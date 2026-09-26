"""Run the Voceli voice + avatar assistant as a LiveKit agent.

    cd agent && uv run python main.py dev

The web app mints a join token that dispatches this agent (agent_name "heard-linh") into a fresh room, with a
plan-scoped credential in the job metadata. The assistant fetches the questions, introduces herself and her role,
walks through the conversation, and saves answers and voice recordings back into the plan. With TAVUS_API_KEY set,
she speaks through a Tavus video avatar of an older woman.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, JobContext, TurnHandlingOptions, inference, room_io

from linh import GuideFlow, HeardClient, LinhAgent, MicRecorder, PlayoutWatchdog, intro_text

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env.local")  # share LiveKit / Tavus / AI settings with the web app

logger = logging.getLogger("heard.linh")

AGENT_NAME = os.getenv("HEARD_AGENT_NAME", "heard-linh")
PRIVATE_DONE = "[private-question-done]"
PLAN_TOPIC = "heard.plan"  # tells the mobile app to show what she just saved, or which screen to open


def make_llm():
    """GPT-5.6 by default through LiveKit Inference; `bedrock:<model id>` uses OpenAI on Amazon Bedrock instead."""
    spec = os.getenv("HEARD_AGENT_LLM", "openai/gpt-5.6-luna")
    if spec.startswith("bedrock:"):
        from livekit.plugins import openai

        region = os.getenv("HEARD_BEDROCK_REGION") or os.getenv("AWS_REGION") or "us-east-1"
        token = os.getenv("AWS_BEARER_TOKEN_BEDROCK")
        if not token:
            from aws_bedrock_token_generator import provide_token

            token = provide_token(region=region)
        return openai.responses.LLM(
            model=spec.split(":", 1)[1],
            base_url=f"https://bedrock-runtime.{region}.amazonaws.com/openai/v1",
            api_key=token,
            use_websocket=False,
            store=False,
            reasoning={"effort": "low"},
        )
    return inference.LLM(model=spec, extra_kwargs={"reasoning_effort": os.getenv("HEARD_AGENT_EFFORT", "low")})


def make_tts():
    descriptor = os.getenv("HEARD_AGENT_VOICE", "inworld/inworld-tts-2:Ashley")
    model, _, voice = descriptor.partition(":")
    return inference.TTS(model=model, voice=voice or None, language="en")


def build_avatar():
    """Tavus avatar (default face: "Dawn", an older woman). Returns None to run voice-only."""
    if not os.getenv("TAVUS_API_KEY") or os.getenv("HEARD_AGENT_AVATAR", "1") in ("0", "false", "off"):
        return None
    from livekit.plugins import tavus

    kwargs: dict[str, str] = {}
    if os.getenv("TAVUS_FACE_ID"):
        kwargs["face_id"] = os.environ["TAVUS_FACE_ID"]
    if os.getenv("TAVUS_PAL_ID"):
        kwargs["pal_id"] = os.environ["TAVUS_PAL_ID"]
    return tavus.AvatarSession(avatar_participant_name="Linh", **kwargs)


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def linh_session(ctx: JobContext) -> None:
    meta = json.loads(ctx.job.metadata or "{}")
    if not meta.get("agentToken") or not meta.get("backendUrl"):
        logger.error("dispatched without a Heard credential; nothing to do")
        return
    client = HeardClient(meta["backendUrl"], meta["agentToken"])
    context = await client.context()
    focus = meta.get("focus")
    if isinstance(focus, list) and focus:
        # Short demo: only these questions, in the spec's order.
        context["questions"] = [q for q in context["questions"] if q["id"] in focus]
    recorder = MicRecorder()
    mode = meta.get("mode") or "conversation"

    async def notify_app(event: dict) -> None:
        await ctx.room.local_participant.send_text(json.dumps(event), topic=PLAN_TOPIC)

    agent = LinhAgent(context, client, recorder, mode=mode, notify=notify_app)
    ctx.log_context_fields = {"room": ctx.room.name}

    # In the mobile app answers are thoughtful and often come in a few sentences: a little more patience before
    # deciding someone has finished keeps a pause from cutting their answer in two.
    endpointing = {"min_delay": 0.9, "max_delay": 3.5} if mode == "guide" else {}
    session = AgentSession(
        stt=inference.STT(model=os.getenv("HEARD_AGENT_STT", "deepgram/nova-3"), language="en"),
        llm=make_llm(),
        tts=make_tts(),
        turn_handling=TurnHandlingOptions(turn_detection=inference.TurnDetector(), **({"endpointing": endpointing} if endpointing else {})),
        max_tool_steps=5,
    )
    watchdog = PlayoutWatchdog(session)

    def say(text: str, allow_interruptions: bool = True):
        """A scripted line (never generated), registered with the watchdog."""
        return watchdog.expect(session.say(text, allow_interruptions=allow_interruptions), text)

    async def goto(screen: str) -> None:
        await notify_app({"type": "goto", "screen": screen})

    flow = GuideFlow(agent, session, say, goto) if mode == "guide" else None
    flow_tasks: set[asyncio.Task] = set()

    def run_flow(coro) -> None:
        """Flow steps (the intro, the next question) run beside event handling, so they never hold it up."""
        task = asyncio.create_task(coro)
        flow_tasks.add(task)
        task.add_done_callback(flow_tasks.discard)

    @session.on("user_input_transcribed")
    def _on_transcript(ev) -> None:
        if ev.is_final:
            agent.note_user_words(ev.transcript)

    @session.on("agent_state_changed")
    def _on_state(ev) -> None:
        agent.on_agent_state(ev.new_state)

    def planner() -> rtc.RemoteParticipant | None:
        return next((p for p in ctx.room.remote_participants.values() if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD), None)

    # App events are handled one at a time, in order. Screen changes are "latest wins": when someone moves through
    # several screens quickly, only the one they landed on counts.
    events = asyncio.Lock()
    screens = {"latest": 0}

    async def on_text(sess: AgentSession, ev: room_io.TextInputEvent) -> None:
        """Typed answers arrive as lk.chat text; the app also sends screen changes and other events."""
        text = ev.text.strip()
        if text.startswith("[") and text.endswith("]"):
            kind = text[1:-1].split(":", 1)[0]
            logger.info("app event: %s", text[1:-1] if kind == "screen" else kind)  # never logs names or typed words
        # Bookkeeping from the app, which shouldn't cut her off mid-sentence.
        if text.startswith("[name:") and text.endswith("]"):
            context["firstName"] = text[len("[name:") : -1][:40]
            return
        if text == "[voice-consent]":
            # They agreed to keep their answers in their own voice (the Play screen, or the on-screen recorder).
            agent.grant_voice_consent()
            who = ev.participant or planner()
            if who is not None:
                recorder.start(who)
            return
        if flow is not None and text == "[start]":
            run_flow(flow.start())  # they tapped Play
            return
        ticket = 0
        if text.startswith("[screen:") and text.endswith("]"):
            screens["latest"] += 1
            ticket = screens["latest"]
        async with events:
            await handle_event(sess, ev, text, ticket)

    async def handle_event(sess: AgentSession, ev: room_io.TextInputEvent, text: str, ticket: int) -> None:
        if ticket and ticket != screens["latest"]:
            return  # they've already moved on to another screen
        if flow is not None:
            if ticket:
                run_flow(flow.on_screen(text[len("[screen:") : -1]))
                return
            if text == PRIVATE_DONE:
                run_flow(flow.private_done())
                return
            if text == "[quiet]" or text.startswith("[recorded:"):
                return  # the on-screen recorder isn't part of the mobile flow any more
            agent.note_user_words(ev.text)  # typed instead of spoken: same as an answer
            sess.generate_reply(user_input=ev.text)
            return
        try:
            sess.interrupt()  # not awaited: new lines queue right behind whatever is being cut off
        except RuntimeError:
            pass  # the scripted role introduction can't be interrupted; anything new queues after it
        if text == "[quiet]" or ticket:
            return
        if text.startswith("[recorded:"):
            say("Thank you. That's saved in your own voice.")
            return
        if ev.text.strip() == PRIVATE_DONE:
            agent.mark_private_done()
            agent.expect_answer()
            nxt = agent.next_question()
            follow = (
                f"then ask the next question ({nxt['id']}): \"{nxt['question']}\"" if nxt else "then thank them, say they can review everything on their screen, and call end_conversation"
            )
            sess.generate_reply(
                instructions=f"They finished the private question on their screen. Thank them in a few words, without asking what they chose, {follow}"
            )
            return
        agent.note_user_words(ev.text)
        sess.generate_reply(user_input=ev.text)

    avatar = build_avatar()
    if avatar is not None:
        try:
            await avatar.start(session, room=ctx.room)
            await avatar.wait_for_join()
            logger.info("avatar joined")
        except Exception as exc:  # the conversation must never depend on the avatar
            logger.warning("avatar unavailable, continuing voice-only: %s", exc)

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(
            text_input=room_io.TextInputOptions(text_input_cb=on_text),
            text_output=room_io.TextOutputOptions(sync_transcription=True),
        ),
    )

    def planner_present() -> bool:
        return any(p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_STANDARD for p in ctx.room.remote_participants.values())

    try:
        participant = await ctx.wait_for_participant()
    except RuntimeError:
        logger.info("the person left before Linh could start")
        session.shutdown(drain=False)
        return
    if context.get("voiceConsent"):
        recorder.start(participant)
    watchdog_task = asyncio.create_task(watchdog.run())

    if mode == "guide":
        # Mobile app: she waits for the Play tap ("[start]"), then leads from question to question (GuideFlow).
        while planner_present():
            await asyncio.sleep(1)
        watchdog_task.cancel()
        for task in list(flow_tasks):
            task.cancel()
        await agent.drain()
        await recorder.aclose()
        session.shutdown(drain=False)
        await ctx.delete_room()  # they left: release the avatar (and its billing) right away
        return

    await say(intro_text(context.get("firstName")), allow_interruptions=False)
    first = agent.next_question()
    agent.expect_answer()  # the first answer starts once she has asked the first question
    if first is None:
        opening = "Everything is already answered. Offer to go over anything they'd like to change, then say goodbye."
    elif first.get("private"):
        opening = "Ask if they're ready. The first open question is the private one: hand it to their screen as instructed, then wait."
    else:
        opening = f"Ask if they're ready, then ask the first question ({first['id']}): \"{first['question']}\" warmly, in your own words."
    session.generate_reply(instructions=opening)

    await asyncio.sleep(5)
    while planner_present():
        # Close once the goodbye has been spoken: finished, a moment passed, and Linh is listening again.
        if agent.finished and time.monotonic() - agent.finished_at > 3 and agent.state in ("listening", "idle"):
            break
        await asyncio.sleep(0.5)
    if agent.finished:
        await asyncio.sleep(1.5)
    watchdog_task.cancel()
    await agent.drain()  # finish saving voice recordings before the call ends
    await recorder.aclose()
    session.shutdown(drain=agent.finished)
    if agent.finished:
        # End the call for everyone (and release the avatar) once the goodbye has been said.
        await ctx.delete_room()


if __name__ == "__main__":
    agents.cli.run_app(server)
