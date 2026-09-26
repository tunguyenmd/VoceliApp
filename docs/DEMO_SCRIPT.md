# Demo script (3 minutes, with a 5-minute extension)

> **Doing the 2-minute live demo with Linh?** Use [DEMO_LINH_2MIN.md](DEMO_LINH_2MIN.md) instead. It has a measured timeline and a dress-rehearsal video in `~/Desktop/ACP/demo-rehearsal/`.

**Story:** Hoa, 71, a widow in San Jose. Her husband spent three weeks in the ICU while the family kept saying "yes, try one more thing" because nobody knew what he wanted. She doesn't want her children to guess. Her daughter Mai is a nurse. *(Hoa is fictional, and her recordings use a labelled synthetic voice.)*

## Before you go on (10 minutes earlier)

- [ ] `npm run check:ai` is all green (credentials, both models, Transcribe).
- [ ] `npm run demo` is running. **Safari** window A at `http://localhost:3120`, zoomed to 110–125 %.
- [ ] On the landing page, click **"Hoa's answers only (run AI live)"**. It opens Review.
- [ ] Safari has microphone permission: do one throwaway recording on any question, then delete it with the trash icon.
- [ ] **Backup:** in a second browser profile (or Chrome), load **"Hoa's finished plan + Mai's invite"** and copy Mai's link. If anything live fails, switch to this window.
- [ ] Phone: same Wi-Fi as the laptop (or a cloudflared link), volume up, and the camera ready to scan the QR code.
- [ ] Laptop volume up. The recordings are short; let them play.

## Opening with Linh (45 seconds, the strongest start)

Before you go on, run `cd agent && uv run python main.py dev` (Linh's worker) next to `npm run demo`, and create a fresh plan (**Start my plan**, name *Rosa* or your own) so Linh has questions to ask.

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | My plan → **Talk with Linh** | **Start talking with Linh**. Her video appears in about 8 seconds. | "Heard can also run the whole conversation live. This is Linh." |
| 0:08 | Live | Let her scripted introduction play. The label on screen reads *AI assistant · not a doctor or healthcare professional*. | *(Let her say it.)* "She tells everyone her role up front, every time. It's scripted, not generated." |
| 0:25 | Live | Answer her first question out loud, e.g. *"I feel pretty good for my age. My knees hurt, but I walk every morning."* | "She reflects back in my own words, and on the right you can see my plan filling in. My answer is saved *in my voice* for my family." |
| 0:40 | Live | When she reaches **Being told**, point at the private card: pick an option, then **Save and continue**. | "This one never goes through the AI. She hands it to my screen, and she's only told that I'm done." |

Then continue with the 3-minute run below, which uses the demo persona Hoa's finished plan for the Clarity check, summary, and family view.

## 3-minute run

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | Landing | (Already on screen.) | "Only about 1 in 3 American adults has an advance directive, and even those are often too vague to use at the bedside. When a crisis comes, families guess. Heard lets you plan in your own voice." |
| 0:20 | Conversation → *What matters most* | Click **Conversation**, go to *What matters most*, tap the mic, and say: **"And my two cats. They keep me company every single day."** Stop. | "The questions come straight from a physician-written spec: what matters, quality of life, how much treatment, when to stop. I can answer by voice, type, or skip. Watch the captions: Amazon Transcribe, live." |
| 0:45 | Same page | The gold suggestion **Pets** appears with the quote. Tap **Add**. | "GPT-5.6 on Bedrock noticed my words already answer a question. It must quote me exactly, or the suggestion is thrown away, and it only changes the answer when I tap Add." |
| 1:00 | Review | Scroll to **Clarity check**, then **Run the clarity check** (~10 s). | "Here's the part doctors asked for. Advance directives fail because the words are ambiguous." |
| 1:15 | Review | Read out the note about **"like a vegetable"** or the tension between *Lean toward trying* and *stop if kept alive by machines*. Click **Type an answer**, type *"More than two weeks with no sign I'm waking up."* and save. | "It found two things Hoa's kids could read differently. It never judges her choices; it asks what she meant." |
| 1:35 | Summary | **Create my summary** (~8 s), then play one quote under **In my own words**. | "A one-page card in her voice. Every sentence traces back to her answers, and each quote plays the exact moment she said it." |
| 1:55 | Summary → Family | **This sounds like me**, then **Share with family**. Name **Mai**, *Daughter*, turn on *How you want to hear serious news*, tick the acknowledgement, **Create private link**. Scan the QR code with the phone. | "Sharing is granular and revocable, and I'm warned that saved copies can't be pulled back." |
| 2:10 | Phone | Tick the three consent boxes, then **I agree**. | "Mai gives her own consent. It isn't inherited from Hoa." |
| 2:20 | Phone | Tap **"Would Hoa want to be kept on machines?"** (~3 s), then **Hear Hoa say it**. | *(Let her voice play.)* "In the ICU waiting room, Mai doesn't need a PDF. She hears her mom." |
| 2:40 | Phone, then laptop | Phone: **Show me** on *How Hoa wants to hear serious news*. Laptop: **Privacy**. | "That preference, whether Hoa wants to be told, is encrypted under its own key, never sent to AI, and every view goes into its own tamper-evident log." Point at Mai's entries. |
| 2:55 | Laptop | **Family → Turn off access**. Refresh the phone. | "One tap, and access is gone. Built on AWS and OpenAI, encrypted, and honest that it's not a legal document. It tells you how to make it official in your state." |

## 5-minute extension

- **Next steps** (20 s): the California signing rules (notary or two witnesses; a skilled nursing facility adds an ombudsman) come straight from Probate Code §§ 4673–4675. POLST prep is for serious illness only: it maps what she said to the POLST sections and adds questions for her clinician, watermarked "not a medical order".
- **Revisit** (20 s): **My plan → Has something changed? → A hospital stay → Log it**. The check-in banner appears. Or use **Privacy → Demo tools → Jump ahead one year** to show the annual check-in.
- **Memorial mode** (15 s): **Privacy → Demo tools → Toggle memorial mode**. The family view shows "In loving memory", and access continues.
- **Under the hood** (30 s): **Privacy** shows the ciphertext on disk (`48 52 44 31` = "HRD1" magic header), three keys, and "Tamper check passed". Mention `npm run eval` numbers if you ran it.

## If something goes wrong

| Symptom | Fix |
|---|---|
| No captions while recording | Keep talking. The recording is saved anyway. (Transcribe denied → `HEARD_STT_PROVIDER=none`.) |
| Suggestion doesn't appear within ~6 s | Say "Heard also works without AI; I can just tap the chip," tap **Pets**, and move on. |
| Clarity check or summary slow (>20 s) | Switch to the backup window (finished plan) and continue from **Summary**. |
| Phone can't reach the laptop | Open Mai's link in a second Safari window on the laptop, or use the cloudflared URL. |
| Microphone blocked | Safari → Settings for This Website → Microphone → Allow. |

## Lines for Q&A

- **"Is this HIPAA?"** There's no covered entity in the MVP, but the spec treats voice and the disclosure preference as sensitive health data anyway. Bedrock is HIPAA-eligible, we send `store:false`, and there are no analytics trackers. See SECURITY.md.
- **"What stops the AI from putting words in Mom's mouth?"** Every quote must match the transcript and is replaced with the exact words; sentences without a real source are dropped; advice-like sentences are filtered; the family search only restates, it never recommends. `npm run eval` measures it.
- **"Why not a POLST generator?"** POLST is a medical order for serious illness, signed by a clinician. For healthy adults it's the wrong tool, so we prepare people for that conversation and point them to their state's advance directive.
- **"Business?"** Free for individuals. Paid by Medicare Advantage plans, ACOs, and employers who need ACP completion, which is a quality measure. See PITCH.md.
