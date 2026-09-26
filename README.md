# Heard: advance care planning, in your own voice

Heard guides a person through a gentle conversation about what matters most, records their answers **in their own voice**, and shares them with the people who may one day have to speak for them. It is built from Dr. Tu's product spec (Draft v2) and adds AI that listens closely but never decides:

| | What it does | Built with |
|---|---|---|
| Guided conversation | The spec's 5 prompt types plus the diagnosis/prognosis disclosure preference and a "message to my family". Voice, structured input, "type instead", and skip on every question. | Next.js 16, React 19 |
| Voice capture | 60–90 s answers (5 min for the family message), countdown ring, live waveform, auto-save at the limit, then continue in a follow-up clip | MediaRecorder + AudioWorklet |
| Live captions | Words appear as you speak; the transcript is ready about 1–2 s after you stop | Amazon Transcribe streaming (16 kHz PCM over HTTP) |
| **Speak naturally** | Suggests answers from your own words, e.g. "please don't forget my garden" → *Hobbies*. You tap to accept. | GPT-5.6 Luna on Amazon Bedrock |
| **Clarity check** | Finds tensions ("Lean toward trying" and "stop if kept alive by machines") and phrases family could read two ways ("like a vegetable"), then asks one gentle follow-up | GPT-5.6 Terra on Amazon Bedrock |
| **Values summary** | A one-page card in the person's own voice. Every sentence cites its source answers, ungrounded lines are removed, and quotes play the exact moment from the recording. | GPT-5.6 Terra + word timings |
| **Family: "What did Mom say about…?"** | Answers only with the person's words and plays that exact sentence. It never predicts or advises. | GPT-5.6 Luna + grounding validator |
| Family sharing | Private links, **the family member's own consent**, per-person scopes, revoke any time, "saved a copy" tracking | Hash-only tokens, signed cookies |
| Trust | Three encryption keys (answers / voice / disclosure), separate hash-chained access logs, crypto-shredding delete, retention and memorial settings | AES-256-GCM envelope encryption |
| Revisit | Annual check-in, life events trigger an early review, and versioned "what family sees" | |
| Next steps | California signing rules (Probate Code §§ 4673–4675), free state forms, POLST conversation prep (draft, never a medical order) | |

### The mobile app, with Linh always on screen

Heard opens as a **phone app** (`/`; on a laptop it sits in a phone frame). Linh, a live video avatar, stays at the top of every screen, with her role on a label that never goes away. The first screen is just Linh, one sentence ("I'm Linh, an AI assistant, not a clinician, and I can help guide you through advance care planning.") and **Continue**. Then: About you (name, decision style, language) → Before we begin (what this is and isn't, voice consent) → the spec's 8 questions → Review (answers + values summary to approve) → Share (per-person scopes, QR link) → Done.

- **Talk or tap, it's one answer.** Linh reads each screen's physician-written question aloud (scripted, never paraphrased). If the person answers her out loud, she saves it into the screen they're on: chips light up next to anything they already tapped, and their spoken answer appears as a voice note ("Linh saved what you told her").
- **She can't hear what she shouldn't.** The microphone closes on the private disclosure question and while the on-screen recorder is running (the label turns to *Not listening*), and she stops talking when recording starts.
- **Latest screen wins.** Tapping quickly through screens, she narrates only the one the person lands on.
- **Resilient.** If the avatar never confirms that a line finished playing (it happens), a watchdog clears it so she doesn't freeze. If the page reloads, **Talk with Linh** on her video brings her back. When the person leaves, the room closes and the avatar is released.

The older desktop planner, the demo launchers and the 2-minute desktop demo live at `/about`.

### Linh: a live voice + video assistant (LiveKit + Tavus)

**Talk with Linh** (`/live`) turns the same guided conversation into a real-time video call. Linh is an **AI assistant, not a doctor or healthcare professional**. Every conversation opens with a scripted introduction that says so (not model-generated), and her role label stays on screen the whole time.

- She asks the spec's questions one at a time, reflects back in the person's words, and saves each answer as they go (`save_answer` / `skip_question` tools on GPT-5.6 Luna). The plan fills in live beside the video.
- **Their own voice is kept:** the agent records the person's microphone and cuts each answer into a recording (long pauses trimmed). The recording is transcribed by Amazon Transcribe and appears in the family view like any other.
- **The diagnosis/prognosis question never goes through her:** Linh hands it to a private card on screen and is told only that it's done. The agent can't save, record, or read it (the server rejects it).
- Stack: LiveKit Agents 1.8 (Python) · LiveKit Inference (Deepgram Nova-3 STT, GPT-5.6 Luna, Inworld TTS) · Tavus avatar (a custom Phoenix-4.5 face of an older Vietnamese woman, made with Image-to-Replica from a generated portrait of no real person) · `livekit-client` in the browser. The mobile app runs her in `guide` mode; `/live` runs the original interview-style `conversation` mode. Set `HEARD_AGENT_LLM=bedrock:global.openai.gpt-5.6-luna` to run her LLM on Amazon Bedrock instead.

```bash
cd agent && uv sync
uv run python main.py dev          # registers "heard-linh" with LiveKit Cloud; the web app dispatches it per conversation
uv run pytest                      # 12 tests: intro/guardrails/watchdog offline + live GPT-5.6 behaviour (no medical advice, option mapping, private question, guide-mode save)
```
Settings (in the web app's `.env.local`, which the agent also reads): `LIVEKIT_URL/API_KEY/API_SECRET`, `TAVUS_API_KEY`, `TAVUS_PAL_ID` (an echo-mode PAL), `TAVUS_FACE_ID` (`rf2e6864ff10` = Linh, the custom face; stock fallbacks `r90e7a409fac` = Dawn, `rc4492899eda` = Mrs. Hart), `HEARD_AGENT_VOICE` (default `inworld/inworld-tts-2:Ashley`), `HEARD_AGENT_AVATAR=0` for voice-only.

Everything the AI produces is validated server-side: quotes must match the transcript (fuzzy match, then replaced with the exact words), sources must exist, and advice-like sentences are dropped. The disclosure preference is **never sent to a model**. See [docs/SPEC_TRACEABILITY.md](docs/SPEC_TRACEABILITY.md) for spec → implementation and [docs/SECURITY.md](docs/SECURITY.md) for the data-protection design.

---

## Quick start at the event (≈5 minutes)

Requires Node 22+ (`nvm use 22`) and `ffmpeg` (`brew install ffmpeg`, used to normalise audio for iPhone playback).

```bash
cd heard
npm install
cp .env.example .env.local          # already set for Bedrock + Transcribe in us-east-1
```

1. In **Workshop Studio → Get AWS CLI credentials**, copy the three `export AWS_…` lines. Paste them into your terminal, or add them (without `export`) to `.env.local`.
2. Check everything works before you open the browser:
   ```bash
   npm run check:ai
   # optional: probe more models
   npm run check:ai -- us.openai.gpt-6-luna global.openai.gpt-5.6-sol
   ```
   You want green ticks for AWS credentials, both models, and Transcribe.
3. Run it:
   ```bash
   npm run demo        # production build, served on http://localhost:3120 and your LAN IP
   ```
4. Open **http://localhost:3120 in Safari** for the phone app with Linh (start the agent too: `cd agent && uv run python main.py dev`). For the desktop planner and the demo persona, open **/about** and click **"Hoa's finished plan + Mai's invite"**, or **Start my plan**.

**If Bedrock SigV4 fails** (for example 403 on `project/default`), mint a bearer token the way the workshop does and put it in `.env.local`:
```bash
pip install aws_bedrock_token_generator
echo "AWS_BEARER_TOKEN_BEDROCK=$(python3 -c "from aws_bedrock_token_generator import provide_token; print(provide_token(region='us-east-1'))")" >> .env.local
```
**If Transcribe is denied** in the workshop account, set `HEARD_STT_PROVIDER=none`. Recording still works; only captions and transcript-based suggestions switch off. You can also point `HEARD_TRANSCRIBE_REGION` at an account that allows it.
**If AI is unavailable entirely**, set `HEARD_AI_PROVIDER=none`. Every feature has a non-AI path: the template summary, manual chips, and a family view without search.

### The phone (family view) on stage
- **Same Wi-Fi:** open `http://<laptop-LAN-IP>:3120/f/<token>` on the phone. Playback doesn't need HTTPS.
- **Venue Wi-Fi blocks device-to-device traffic:** use a tunnel (`brew install cloudflared && cloudflared tunnel --url http://localhost:3120`) and open the `https://…trycloudflare.com/f/<token>` link. Or open the family link in a second browser window on the laptop.

## Development

```bash
npm run dev          # http://localhost:3120 (Turbopack)
npm test             # unit tests: grounding, crypto, audit chain, summaries
npm run eval         # model evals: suggestion precision/recall + zero ungrounded quotes
npm run typecheck && npm run lint
npm run demo:audio   # regenerate the demo persona's synthetic recordings (ElevenLabs or macOS say)
```

Data lives in `.data/` (encrypted; delete it to reset). The demo persona "Hoa" is fictional, and her voice is computer-generated and labelled as such wherever it plays.

## Layout

```
app/(mobile)/…         the phone app: welcome (/) · app/about-you · app/begin · app/q/[promptId] · app/review · app/share · app/done
app/(planner)/…        desktop planner: start · talk/[promptId] · review · summary · share · next-steps · privacy · plan · live
agent/                 Linh (LiveKit Agents, Python): linh.py (role, prompts, tools, watchdog) · main.py (session, avatar, app events)
app/f/[token]          family view (consent → summary, voice, disclosure reveal, "what did they say")
app/api/…              route handlers (all state changes are server-side and logged)
lib/content/           clinical wording: prompts, POLST prep, state rules, consent copy (physician-editable)
lib/server/ai/         Bedrock/OpenAI transport, schema-constrained JSON, understand/clarity/summary/ask
lib/server/stt/        Amazon Transcribe live sessions
lib/server/vault.ts    envelope encryption (per-plan keys: core, disclosure, voice)
lib/server/audit.ts    hash-chained access logs (access + disclosure)
lib/grounding.ts       quote location, exact-span extraction, word-timing alignment, advice filter
docs/                  spec traceability, security, breach plan, demo script, pitch
```
