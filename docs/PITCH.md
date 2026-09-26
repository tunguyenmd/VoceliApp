# Pitch notes: Heard

> Fill in the bracketed parts before you present. Claims below are either sourced or labelled as our assumptions.

## One line
**Heard helps people plan end-of-life care in their own voice, so families don't have to guess.**

## Problem
- About **1 in 3** U.S. adults has any advance directive (Yadav et al., *Health Affairs* 2017, 795,909 people across 150 studies: 36.7 %).
- Even when documents exist, they're written in phrases like "no heroic measures" or "don't let me be a vegetable" that families and clinicians can't act on.
- Existing tools split into clinical platforms sold to health systems (Koda Health, Vynca, ADvault/MyDirectives, WiserCare), estate-planning apps (Cake, Everplans, Empathy, Lantern), and static state forms. None combines guided discussion, POLST preparation, cultural adaptation, and voice-recorded wishes in one consumer product. *(From the spec's competitive landscape.)*

## Product (three pillars from the spec, plus AI)
1. **Guided conversation**: physician-authored prompts (what matters, quality of life, how much treatment, when to stop, how to be told), skippable, voice or type.
2. **Your own voice**: 60–90-second answers and a message to your family, played back for the people you choose.
3. **Shared with care**: per-person links, the recipient's own consent, revocable access, tamper-evident access logs.
4. **AI that listens and never decides** (GPT-5.6 on Amazon Bedrock):
   - **Speak naturally**: suggests answers from your own words; you confirm.
   - **Clarity check**: catches ambiguity *before* a crisis ("a long time", or "try hard" alongside "stop if on machines").
   - **Values summary**: one page, every sentence cited to your answers, quotes that play in your voice.
   - **"What did Mom say about…?"**: family members hear the exact moment, not a model's guess.

## Why it's safe to trust
- Clinical wording is physician-authored data, never generated. The AI only restates the person's own words, and a server-side validator enforces it: exact quotes, real sources, and an advice filter.
- The diagnosis/prognosis preference (whether you want to be told) has its **own key and its own access log, and is never sent to AI**.
- AES-256-GCM envelope encryption with three keys per person; crypto-shredding on delete; retention and memorial-mode policies defined up front.
- Bedrock: prompts aren't used for training; requests are sent with `store:false`. No analytics trackers.
- Honest framing: a values summary, not a legal document or medical order, with state-specific signing steps (California Probate Code §§ 4673–4675) and free official forms.

## Technology (for AWS/OpenAI judges)
- **OpenAI GPT-5.6 Terra/Luna on Amazon Bedrock** via the Responses API (SigV4 or Bedrock API key), strict JSON-schema outputs, `store:false`.
- **Amazon Transcribe streaming** for live captions and word-level timings, which make "play the exact sentence" possible.
- Next.js 16 / React 19, AudioWorklet PCM capture, MediaRecorder, Range-request audio for Safari/iOS.
- Evals (`npm run eval`): suggestion precision/recall on synthetic transcripts and ungrounded-quote rate. *[Paste the numbers from your run.]*

## Business model (assumptions to validate)
- **Free for individuals**, which builds trust and distribution.
- **Paid by organisations that need ACP done**: Medicare Advantage plans and ACOs (advance care planning is an NCQA quality measure), employers and benefits platforms, senior living, home health.
- Later: clinician handoff (the spec defers this from the MVP), so prepared patients arrive at a billable ACP visit ready.

## Roadmap (from the spec)
1. **Multilingual and culturally adapted content**, reviewed per culture (Vietnamese, Spanish, Chinese, …), not just translated.
2. **Family-centered mode**: the conversation structured around shared decision-making.
3. Clinician-facing delivery and EHR/portal integration, after regulatory review.
4. Legal review: biometric privacy (BIPA), state health-data laws (WA My Health My Data), and a breach plan (drafted in docs/).

## Team
- **Tam [last name]**: [role; builds AI systems for finance and tax].
- **Dr. Tu [last name]**: [physician; wrote the product spec]. *(Confirm how Dr. Tu wants to be credited.)*

## The ask
[For this hackathon: what you'd do with the prize, advisors, or a PearX intro, e.g. a pilot with a senior clinic or PACE program.]
