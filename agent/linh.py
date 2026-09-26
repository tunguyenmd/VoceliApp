"""Heard's real-time voice assistant for advance care planning (the Voceli app).

The assistant is an AI, not a healthcare professional, and doesn't use a personal name. She walks a person through the
guided conversation from the product spec (open reflection, what matters most, quality of life, how much treatment,
breathing machines, when to stop, and an optional message to family), saves what they choose into their plan, and
keeps their spoken answers as recordings in their own voice. The diagnosis/prognosis disclosure question is private:
she hands it to the screen and never hears, records, or discusses the answer.
"""
from __future__ import annotations

import array
import asyncio
import io
import logging
import time
import wave
from typing import Any, Awaitable, Callable

import aiohttp
from livekit import rtc
from livekit.agents import Agent, RunContext, function_tool
from livekit.agents.llm import ToolError, ToolResult

logger = logging.getLogger("heard.linh")

SAMPLE_RATE = 16000

# Scripted, never generated, so every conversation opens with the same honest description of the assistant's role.
# Word for word from the demo script (docs/DEMO_LINH_2MIN.md).
INTRO = (
    "I'm an AI assistant. I'm not a clinician so I can't give medical or legal advice. I'm here to help you put what "
    "matters most into words, and save it in your own voice for the people you choose. You can skip anything, type "
    "instead, or stop any time."
)

PRIVATE_HANDOFF = (
    "The next question, about how you'd want to hear news of a serious diagnosis, is extra private, so I've put it "
    "on your screen instead of asking you out loud. Take your time, and let me know when you're ready to go on."
)


def intro_text(first_name: str | None) -> str:
    return f"Hi {first_name}. {INTRO}" if first_name else INTRO


# ---------------------------------------------------------------- guide mode (mobile app)
# In the mobile app the assistant leads and the person only answers: after the Play tap she introduces herself, then
# asks each question word for word (the physician's wording). When she saves an answer the screen shows the choices it
# matched, she thanks them, and she moves the app to the next question herself. There are no buttons to press. The
# private disclosure question is the exception: it is answered by tapping, with her microphone closed.

ACKS = ("Thank you. I've marked that for you.", "Thank you. That's saved.")
SKIP_ACK = "That's completely fine. We can skip that one."
PRIVATE_ACK = "Thank you."
RESUME = "Let's pick up where we left off."
CLOSING = "Thank you. Your answers are saved in your own voice. When you're ready, you can share them with your family."

SCREEN_LINES = {
    "review": "Here's everything you've shared. Take a look, and change anything you like.",
    "share": "When you're ready, you can choose who can see and hear your answers.",
    "done": CLOSING,
}

PRIVATE_SCREEN_LINE = (
    "This next question is extra private, so I've turned off my listening while you answer it on your screen. "
    "Take your time."
)


def question_line(q: dict[str, Any]) -> str:
    """What she says to ask a question: the physician's wording, never paraphrased; the private one is never read."""
    return PRIVATE_SCREEN_LINE if q.get("private") else q["question"]


def screen_line(screen: str, questions: list[dict[str, Any]]) -> str | None:
    """What she says when the person opens a screen themselves. None means stay quiet."""
    if screen in SCREEN_LINES:
        return SCREEN_LINES[screen]
    q = next((x for x in questions if x["id"] == screen), None)
    return question_line(q) if q else None


def build_guide_instructions(context: dict[str, Any], current: str | None) -> str:
    name = context.get("firstName") or "the person"
    questions = "\n".join(_question_block(q) for q in context["questions"])
    q = next((x for x in context["questions"] if x["id"] == current), None)
    if q is None:
        here = "No question is open right now."
    elif q.get("private"):
        here = f"The private question ({q['id']}) is on their screen; your listening is off."
    else:
        here = f"The open question is {q['id']}: \"{q['question']}\""
    return f"""You are the voice assistant in Voceli, an app for advance care planning. You appear as a video avatar at the top of the app and talk with {name}. You don't use a personal name; if asked, you are Voceli's AI assistant.

# Your role, which you never step outside
- You are an AI assistant, not a clinician: not a doctor, nurse, social worker, chaplain, lawyer, or other professional.
- Never give medical, legal, or financial advice, never recommend or discourage a treatment, and never tell anyone what they should choose. You may explain what the words in a question mean in plain language. For anything medical, suggest asking their doctor or care team.
- This is a values summary for family, not a legal document or a medical order.
- If they say they want to harm themselves or end their life now, gently tell them they can call or text 988, any time.

# How this conversation works
- The app asks each question aloud for you, word for word, and shows it on screen. The person answers by talking (or typing). They never press buttons.
- As soon as they answer the open question, call save_answer for it right away, without saying anything first. The app then shows the choices their words matched, thanks them, and moves to the next question by itself. So never ask the next question yourself, and never repeat the question.
- option_ids: every option from the open question's list that their words clearly express. Don't guess. An empty list is fine.
- other_text: only for something important they said that no option covers.
- If they'd rather not answer, or say skip or pass, call skip_question.
- If they ask what something in the question means, explain it in one or two plain sentences, without advice, then invite them to answer.
- If they want to stop, say a short, warm goodbye and call end_conversation.
- Never ask about or discuss the private question about hearing serious news; your listening is off on that screen.
- When you do speak: one or two short sentences, warm and plain. No lists, no markdown.

# Where they are
{here}

# The questions
{questions}
"""


def _question_block(q: dict[str, Any]) -> str:
    lines = [f"- {q['id']} ({q['topic']}): \"{q['question']}\""]
    if q.get("private"):
        lines.append("  PRIVATE: answered on the person's screen. Never ask for, discuss, or save this answer.")
    if q.get("options"):
        opts = "; ".join(f"{o['id']} = {o['label']}" for o in q["options"])
        lines.append(f"  options: {opts}")
        if all(o.get("exclusive") for o in q["options"]):
            lines.append("  choose exactly one option")
    if q.get("scale"):
        scale = "; ".join(f"{s['value']} = {s['label']}" for s in q["scale"])
        lines.append(f"  treatment_level scale: {scale}")
    if q.get("optional"):
        lines.append("  optional")
    if q.get("status") in ("answered", "skipped"):
        lines.append(f"  already {q['status']}: don't ask again unless they bring it up")
    return "\n".join(lines)


def build_instructions(context: dict[str, Any]) -> str:
    name = context.get("firstName") or "the person"
    questions = "\n".join(_question_block(q) for q in context["questions"])
    return f"""You are Voceli's AI assistant: warm and patient. You don't use a personal name. You are talking by voice with {name}, through a video avatar of an older woman, to help them prepare an advance care plan: a values summary their family can hear in their own words.

# Your role, which you never step outside
- You are an AI assistant. You are not a doctor, nurse, social worker, chaplain, lawyer, or any other professional.
- Never give medical, legal, or financial advice. Never recommend or discourage a treatment, and never tell anyone what they should choose. If asked, say kindly that you can't advise on that, suggest they ask their doctor or care team, and offer to keep going.
- What they make here is a summary of their values for family, not a legal document or a medical order.
- If they say they want to harm themselves or end their life now, gently tell them they can call or text 988, any time, and ask if they'd like to pause.

# How you talk
- One question at a time. One to three short sentences per turn. Plain, warm, unhurried words. No lists, no markdown, no emojis.
- Listen more than you talk. Reflect back one short phrase of what they said, in their words, then move on. Never judge.
- Every question can be skipped. If they hesitate, say pass, or don't want to answer, call skip_question and move on without pressure.
- If they seem upset, slow down, acknowledge it, and offer a pause.
- They may type instead of talking; treat typed messages exactly like speech.
- For questions with options, don't read the whole list. Ask openly, and give two or three short examples only if they seem stuck.

# The conversation, in this order (skip ones already answered)
{questions}

# Saving
- After they answer a question, call save_answer once for it, then reflect back briefly and ask the next question in the same turn. The tool tells you which question is next.
- option_ids: only ids from that question's list that their words clearly express. Don't guess. An empty list is fine.
- other_text: only when something important they said doesn't fit any option. Leave it out if an option already covers it.
- For care_spectrum, set treatment_level (1 to 5) only if their answer is clear; use not_sure if they're unsure.
- For the private disclosure question, don't ask it. Say this, in your own gentle words: "{PRIVATE_HANDOFF}" Then wait. Never call save_answer or skip_question for it.
- When the tool says everything is covered, thank them warmly and stop; the conversation closes on its own. If they want to stop early, say goodbye and call end_conversation.
"""


def normalize_options(question: dict[str, Any], option_ids: list[str] | None, other_text: str | None) -> list[str]:
    """Keep only ids that belong to the question. An exclusive option (like 'none', or one answer of a single-choice
    question) stands alone: combined with ordinary options it is dropped; among exclusive options the first wins."""
    options = question.get("options", [])
    valid = [o["id"] for o in options]
    exclusive = {o["id"] for o in options if o.get("exclusive")} | ({"none"} if "none" in valid else set())
    picked: list[str] = []
    for oid in option_ids or []:
        if oid in valid and oid not in picked:
            picked.append(oid)
    if other_text and "other" in valid and "other" not in picked:
        picked.append("other")
    ordinary = [p for p in picked if p not in exclusive]
    if ordinary:
        return ordinary
    return picked[:1]


def wav_bytes(pcm: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


def compact_speech(pcm: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Trim silence at the edges and shorten long pauses (for example while Linh was talking), so the saved clip
    is just the person's voice. Energy-based: 20 ms frames against an adaptive noise floor."""
    samples = array.array("h")
    samples.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
    frame = sample_rate // 50
    if len(samples) < frame * 5:
        return b""
    energies = []
    for i in range(0, len(samples) - frame + 1, frame):
        chunk = samples[i : i + frame]
        energies.append((sum(s * s for s in chunk) / frame) ** 0.5)
    floor = sorted(energies)[max(0, len(energies) // 5 - 1)]
    threshold = max(floor * 3.0, 350.0)
    speech = [e > threshold for e in energies]
    if not any(speech):
        return b""
    pad = 15  # 300 ms around speech
    keep = [False] * len(speech)
    for i, s in enumerate(speech):
        if s:
            for j in range(max(0, i - pad), min(len(speech), i + pad + 1)):
                keep[j] = True
    last = max(i for i, k in enumerate(keep) if k)
    out = array.array("h")
    gap = 0
    for i, k in enumerate(keep[: last + 1]):
        chunk = samples[i * frame : (i + 1) * frame]
        if k:
            out.extend(chunk)
            gap = 0
        else:
            gap += 1
            if gap <= 20 and out:  # keep at most 400 ms of any pause
                out.extend(chunk)
    return out.tobytes()


class MicRecorder:
    """Holds the person's microphone audio (16 kHz mono) so each answer can be saved as a recording in their voice."""

    def __init__(self) -> None:
        self.frames: list[tuple[float, bytes]] = []
        self._task: asyncio.Task | None = None

    def start(self, participant: rtc.RemoteParticipant) -> None:
        if self._task is not None:
            return

        async def run() -> None:
            stream = rtc.AudioStream.from_participant(
                participant=participant, track_source=rtc.TrackSource.SOURCE_MICROPHONE, sample_rate=SAMPLE_RATE, num_channels=1
            )
            try:
                async for ev in stream:
                    self.frames.append((time.monotonic(), bytes(ev.frame.data)))
            finally:
                await stream.aclose()

        self._task = asyncio.create_task(run())

    def cut(self, since: float, until: float | None = None) -> bytes:
        return b"".join(data for t, data in self.frames if t >= since and (until is None or t <= until))

    async def aclose(self) -> None:
        if self._task:
            self._task.cancel()


class PlayoutWatchdog:
    """Keeps Linh from freezing when the avatar never confirms that a line finished playing.

    The Tavus avatar reports "playback finished" after each line. Very occasionally that report never arrives; the
    agent would then wait for it forever, with every later line queued behind it. When the line playing now runs well
    past its expected length, clear it (the SDK marks a cleared line done within two seconds) so Linh carries on.
    """

    SECONDS_PER_WORD = 0.45
    SLACK = 4.0
    DEFAULT_LIMIT = 30.0  # generated replies: model time, a tool call, and the spoken reply together

    def __init__(self, session: Any, clock: Callable[[], float] = time.monotonic) -> None:
        self._session = session
        self._clock = clock
        self._limits: dict[str, float] = {}
        self._current: str | None = None
        self._since = 0.0
        self.cleared = 0

    def expect(self, handle: Any, text: str) -> Any:
        """Note how long a scripted line should take; returns the speech handle unchanged."""
        self._limits[handle.id] = self.SLACK + self.SECONDS_PER_WORD * len(text.split())
        return handle

    def check(self) -> bool:
        """Call about once a second. Returns True when it cleared a stuck line."""
        speech = self._session.current_speech
        if speech is None or speech.done():
            self._current = None
            return False
        if speech.id != self._current:
            self._current, self._since = speech.id, self._clock()
            return False
        if self._clock() - self._since <= self._limits.get(speech.id, self.DEFAULT_LIMIT):
            return False
        self._since = float("inf")  # at most once per line
        logger.warning("the avatar never confirmed that a line finished playing; clearing it so Linh can go on")
        try:
            self._session.interrupt(force=True)
        except RuntimeError:
            return False
        self.cleared += 1
        return True

    async def run(self) -> None:
        while True:
            await asyncio.sleep(1)
            self.check()


class HeardClient:
    """Calls back into the Heard app with the plan-scoped credential from the job metadata."""

    def __init__(self, base_url: str, token: str) -> None:
        self._base = base_url.rstrip("/")
        self._headers = {"authorization": f"Bearer {token}"}

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as http:
            async with http.request(method, f"{self._base}{path}", headers=self._headers, **kwargs) as resp:
                data = await resp.json(content_type=None)
                if resp.status >= 400:
                    raise ToolError((data or {}).get("error") or f"Heard said {resp.status}")
                return data

    async def context(self) -> dict:
        return await self._request("GET", "/api/agent/context")

    async def save_answer(self, payload: dict) -> dict:
        return await self._request("POST", "/api/agent/answer", json=payload)

    async def upload_clip(self, question_id: str, wav: bytes, duration_ms: int, words: str) -> dict:
        form = aiohttp.FormData()
        form.add_field("file", wav, filename="answer.wav", content_type="audio/wav")
        form.add_field("questionId", question_id)
        form.add_field("durationMs", str(duration_ms))
        form.add_field("words", words)
        return await self._request("POST", "/api/agent/clip", data=form)


class LinhAgent(Agent):
    def __init__(
        self,
        context: dict[str, Any],
        client: HeardClient | None = None,
        recorder: MicRecorder | None = None,
        mode: str = "conversation",
        notify: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        self.mode = mode
        self._notify = notify
        self._context = context
        self.current: str | None = None
        # Guide mode: called after each save or skip so the app can move on (see GuideFlow.after_answer).
        self.on_answered: Callable[[str, bool], None] | None = None
        super().__init__(instructions=build_guide_instructions(context, None) if mode == "guide" else build_instructions(context))
        self._questions: list[dict[str, Any]] = [dict(q) for q in context["questions"]]
        self._client = client
        self._recorder = recorder
        self._voice_consent = bool(context.get("voiceConsent"))
        self._segment_start = time.monotonic()
        self._last_save = self._segment_start
        self._await_listen = False
        self._heard: list[str] = []
        self._uploads: set[asyncio.Task] = set()
        self.finished = False
        self.finished_at = 0.0
        self.state = "initializing"

    # ----- conversation bookkeeping -----

    def question(self, qid: str) -> dict[str, Any] | None:
        return next((q for q in self._questions if q["id"] == qid), None)

    def next_question(self) -> dict[str, Any] | None:
        return next((q for q in self._questions if q.get("status", "todo") == "todo"), None)

    def note_user_words(self, text: str) -> None:
        if text.strip():
            self._heard.append(text.strip())

    @property
    def first_name(self) -> str | None:
        return self._context.get("firstName") or None

    def on_agent_state(self, state: str) -> None:
        self.state = state
        # A new answer starts once she has finished asking the next question.
        if state == "listening" and self._await_listen:
            # People often start answering a beat before she finishes; keep that first second and a half.
            self._segment_start = max(self._last_save, time.monotonic() - 1.5)
            self._heard.clear()
            self._await_listen = False

    def expect_answer(self) -> None:
        self._await_listen = True

    async def set_screen(self, screen: str) -> None:
        """Guide mode: a screen opened. Start a fresh answer segment and refresh her context."""
        self.current = screen
        self._segment_start = time.monotonic()
        self._last_save = self._segment_start
        self._heard.clear()
        await self.update_instructions(build_guide_instructions(self._context, screen if self.question(screen) else None))

    def grant_voice_consent(self) -> None:
        self._voice_consent = True

    async def _tell_app(self, event: dict[str, Any]) -> None:
        """Mobile app: let the screen know the plan changed so it shows what was saved."""
        if not self._notify:
            return
        try:
            await self._notify(event)
        except Exception as exc:  # the save itself succeeded; the screen catches up on its next refresh
            logger.warning("could not notify the app: %s", exc)

    def mark_private_done(self) -> None:
        for q in self._questions:
            if q.get("private") and q.get("status", "todo") == "todo":
                q["status"] = "answered"

    def _advance(self, skipped: bool = False) -> str:
        self._await_listen = True
        self._last_save = time.monotonic()
        nxt = self.next_question()
        if nxt is None:
            # The ending is deterministic: the session closes by itself after this goodbye.
            self.finished = True
            self.finished_at = time.monotonic()
            return (
                "Everything is covered. Now thank them warmly in one or two sentences, and tell them they can review "
                "and change anything on their screen and choose who to share it with. Don't ask another question."
            )
        if nxt.get("private"):
            return f"Next is the private question ({nxt['id']}). Don't ask it; hand it to their screen as instructed, then wait."
        return f"Next question: {nxt['id']}: \"{nxt['question']}\""

    def _guide_saved(self, qid: str, skipped: bool) -> ToolResult:
        """Guide mode: the app shows the answer and moves on by itself, so no spoken reply from the model."""
        # Anything more they say about this question becomes its own clip, so no audio is kept twice.
        self._segment_start = self._last_save = time.monotonic()
        self._heard.clear()
        if qid != self.current:
            q = self.question(self.current or "")
            if q is not None and not q.get("private") and q.get("status", "todo") == "todo":
                return ToolResult(f"Saved to {qid}. They are still on {q['id']}; in a few words, invite them to answer it.")
            return ToolResult(f"Saved to {qid}.", reply_required=False)
        if self.on_answered:
            self.on_answered(qid, skipped)
        return ToolResult("Saved. The app is showing it and moves on by itself; say nothing more.", reply_required=False)

    async def _save_voice(self, qid: str, words: str, since: float, until: float) -> None:
        if not (self._client and self._recorder and self._voice_consent):
            return
        pcm = compact_speech(self._recorder.cut(since, until))
        seconds = len(pcm) / (2 * SAMPLE_RATE)
        if seconds < 1.0:
            return
        try:
            await self._client.upload_clip(qid, wav_bytes(pcm), int(seconds * 1000), words)
        except Exception as exc:  # the structured answer is already saved; a missing clip is not fatal
            logger.warning("could not save the voice clip for %s: %s", qid, exc)
            return
        await self._tell_app({"type": "clip", "questionId": qid})

    # ----- tools -----

    @function_tool()
    async def save_answer(
        self,
        context: RunContext,
        question_id: str,
        option_ids: list[str] | None = None,
        treatment_level: int | None = None,
        not_sure: bool = False,
        other_text: str | None = None,
    ) -> str | ToolResult:
        """Save the person's answer to one question, right after they answer it.

        Args:
            question_id: The id of the question they just answered, for example matters_most.
            option_ids: For questions with options, the ids their words clearly express. Only ids from that question's list. Empty list if none fit.
            treatment_level: Only for care_spectrum: 1 (try everything) to 5 (comfort-focused), when their answer is clear.
            not_sure: Only for care_spectrum: true when they say they're not sure.
            other_text: A few of their own words about something important that isn't one of the options.
        """
        q = self.question(question_id)
        if q is None:
            raise ToolError(f"Unknown question id '{question_id}'. Valid ids: {', '.join(x['id'] for x in self._questions)}.")
        if q.get("private"):
            raise ToolError("That question is private and is answered on their screen. Don't record or discuss it.")
        words = " ".join(self._heard).strip()
        payload: dict[str, Any] = {"questionId": question_id, "status": "answered"}
        if q.get("options"):
            payload["optionIds"] = normalize_options(q, option_ids, other_text)
            if other_text:
                payload["otherText"] = other_text[:300]
        if q.get("scale"):
            level = treatment_level if isinstance(treatment_level, int) and 1 <= treatment_level <= 5 else None
            payload["treatmentLevel"] = None if not_sure else level
            payload["notSure"] = bool(not_sure)
        if not (self._recorder and self._voice_consent) and words:
            payload["words"] = words  # no recording possible: keep their words as text instead
        if self.mode == "guide":
            payload["merge"] = True  # add to what they've already tapped on screen
        if self._client:
            await self._client.save_answer(payload)
            await self._tell_app({"type": "answer", "questionId": question_id})
            task = asyncio.create_task(self._save_voice(question_id, words, self._segment_start, time.monotonic()))
            self._uploads.add(task)
            task.add_done_callback(self._uploads.discard)
        q["status"] = "answered"
        if self.mode == "guide":
            return self._guide_saved(question_id, skipped=False)
        return f"Saved. {self._advance()}"

    @function_tool()
    async def skip_question(self, context: RunContext, question_id: str) -> str | ToolResult:
        """Mark a question as skipped when the person would rather not answer it. Skipping is always fine.

        Args:
            question_id: The id of the question to skip.
        """
        q = self.question(question_id)
        if q is None:
            raise ToolError(f"Unknown question id '{question_id}'.")
        if q.get("private"):
            raise ToolError("That question is private and handled on their screen. Just move on.")
        if self._client:
            await self._client.save_answer({"questionId": question_id, "status": "skipped"})
            await self._tell_app({"type": "answer", "questionId": question_id})
        q["status"] = "skipped"
        if self.mode == "guide":
            return self._guide_saved(question_id, skipped=True)
        return f"Skipped. {self._advance(skipped=True)}"

    @function_tool()
    async def end_conversation(self, context: RunContext) -> str:
        """Call once, after your goodbye, when the person wants to stop before the questions are done."""
        if not self.finished:
            self.finished = True
            self.finished_at = time.monotonic()
        return "Conversation closed."

    async def drain(self) -> None:
        if self._uploads:
            await asyncio.gather(*self._uploads, return_exceptions=True)


class GuideFlow:
    """Mobile app: the assistant leads, so the person never has to tap through screens.

    After the Play tap she introduces herself and asks the first open question. Each save shows the matched choices on
    screen (the app refreshes), then she thanks them and moves the app to the next question, or to the final screen.
    The app reports every screen it shows; screens she opened herself are ignored, and a screen the person opened on
    their own (for example to change an answer) gets that screen's question.
    """

    def __init__(
        self,
        agent: LinhAgent,
        session: Any,
        say: Callable[..., Any],
        goto: Callable[[str], Awaitable[None]],
        pause: float = 0.8,
    ) -> None:
        self.agent = agent
        self._session = session
        self._say = say
        self._goto = goto
        self._pause = pause
        self.started = False
        self.screen: str | None = None  # what the app shows now
        self._seq = 0
        self._acks = 0
        agent.on_answered = self._answered

    async def _speak(self, text: str, allow_interruptions: bool = True) -> None:
        handle = self._say(text, allow_interruptions=allow_interruptions)
        if handle is not None:
            await handle

    async def _quiet(self) -> None:
        """Wait until nothing is being said (for example, the reply that saved the answer)."""
        for _ in range(120):
            speech = self._session.current_speech
            if speech is None or speech.done():
                return
            await speech.wait_for_playout()

    def _ack(self) -> str:
        line = ACKS[self._acks % len(ACKS)]
        self._acks += 1
        return line

    async def start(self) -> None:
        """The person tapped Play: introduce, then ask. After a reload, pick up on the screen they're on."""
        if self.started:
            return
        self.started = True
        self._seq += 1
        q = self.agent.question(self.screen) if self.screen else None
        if q is not None:
            await self._speak(RESUME)
            await self.ask(q, navigate=False)
        elif self.screen in SCREEN_LINES:
            await self._speak(SCREEN_LINES[self.screen])
        else:
            await self._speak(intro_text(self.agent.first_name), allow_interruptions=False)
            await self.advance()

    async def ask(self, q: dict[str, Any], navigate: bool = True) -> None:
        self.screen = q["id"]
        await self.agent.set_screen(q["id"])  # her context, and a fresh answer segment
        if navigate:
            await self._goto(q["id"])
        if not q.get("private"):
            self.agent.expect_answer()  # the answer starts once she has finished asking
        await self._speak(question_line(q))  # on the private screen the app has closed her microphone

    async def advance(self) -> None:
        nxt = self.agent.next_question()
        if nxt is not None:
            await self.ask(nxt)
            return
        self.screen = "done"
        await self.agent.set_screen("done")
        await self._goto("done")
        await self._speak(CLOSING)

    def _answered(self, qid: str, skipped: bool) -> None:
        asyncio.create_task(self.after_answer(qid, skipped))

    async def after_answer(self, qid: str, skipped: bool = False, private: bool = False) -> None:
        """The answer is saved and showing on screen: thank them, give the screen a beat, then move on. A newer save
        (they kept talking) or a screen they opened themselves supersedes this one."""
        self._seq += 1
        seq = self._seq

        def stale() -> bool:
            return seq != self._seq or self.agent.current != qid

        await self._quiet()
        if stale():
            return
        await self._speak(PRIVATE_ACK if private else SKIP_ACK if skipped else self._ack())
        await self._quiet()  # if they spoke over the thanks, let that exchange finish first
        if stale():
            return
        await asyncio.sleep(self._pause)
        if stale():
            return
        await self.advance()

    async def private_done(self) -> None:
        """They answered the private question on screen (the app never says what they chose)."""
        self.agent.mark_private_done()
        q = self.agent.question(self.agent.current or "")
        if q is not None and q.get("private"):
            await self.after_answer(q["id"], private=True)

    async def on_screen(self, screen: str) -> None:
        """The app reports the screen it shows."""
        if screen == self.screen:
            return  # she opened it herself
        self.screen = screen
        if self.agent.question(screen) is not None or screen in SCREEN_LINES:
            await self.agent.set_screen(screen)
        if not self.started:
            return  # before Play, just remember where they are
        self._seq += 1  # they moved on their own: drop any pending move
        try:
            self._session.interrupt()
        except RuntimeError:
            pass  # the role introduction can't be interrupted; the next line queues after it
        q = self.agent.question(screen)
        if q is not None:
            await self.ask(q, navigate=False)
        elif screen in SCREEN_LINES:
            await self._speak(SCREEN_LINES[screen])
