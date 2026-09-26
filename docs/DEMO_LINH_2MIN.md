# Heard × Linh: 2-minute live demo script


Tu: As a physician, I have witnessed families facing some of the most difficult decisions they've had to make without ever hearing the person's wishes. So we built Heard, where people can record their wishes in their own voices and share with families and clinicians. 

AI "I'm an AI assistant. I'm not a clinician so I can't give medical or legal advice. I'm here to help you put what matters most into words, and save it in your own voice for the people you choose. You can skip anything, type instead, or stop any time."

AI: When you think about what makes your life feel like your own, what does a good quality of life mean to you? 

Tam: Answer her, speaking naturally. “ I want to be physically independent, free of pain, not a burden to my family. I want to recognize and talk with my family. “

AI: When you envision a situation when you cannot breathe to live, needing a breathing tube connected to a breathing machine - intubated on a ventilator, would you consider undergoing this procedure short term or long term in order to live?

Tam: “I would consider being on having a breathing tube for a short time if I can meaningfully recover, but I don’t want to be connected to a machine forever”.


Final screen - Button to share recordings with families.
---

## If something goes wrong (don't stop, keep narrating)

| Symptom | Do |
|---|---|
| Video doesn't appear within ~10 s | Keep going: Linh still talks, and her portrait shows. If it never starts, click **End** and restart Terminal 2 with `HEARD_AGENT_AVATAR=0 uv run python main.py dev` (voice-only). |
| She doesn't react to your answer | Say it once more, a little closer to the laptop. Or click **Type instead** and type it. |
| A chip is missing | Leave it. "I can fix anything later on screen." |
| She asks a follow-up | Answer briefly: "That's all, thank you." |
| The call doesn't end by itself | Click **End**. The "What your family will hear" card still appears. |
| Wi-Fi or LiveKit is down | Play `demo-rehearsal/Linh 2-min rehearsal (silent).mp4` and narrate it, then show the recordings on **Conversation → Review**. |

---

## One-liners for Q&A

- **Is Linh giving medical advice?** No. She's an AI assistant and says so first, from a fixed script. Asked "should I get a feeding tube?", she says she can't recommend treatments and suggests asking the care team. Our tests check this on every change.
- **What's different from a chatbot?** She follows the physician-written spec, one question at a time. She only saves options the person's own words express, and the person's voice, not the AI's, is what the family hears.
- **Privacy?** The disclosure question is never seen by the AI: the server rejects any attempt by the agent to save it. Recordings and transcripts are encrypted per plan, family members give their own consent, and access can be revoked any time.
- **Stack?** LiveKit Agents with LiveKit Inference (Deepgram speech-to-text, OpenAI GPT-5.6 Luna, Inworld voice) and a Tavus avatar. Amazon Transcribe produces the word timings for recordings, and the rest of Heard runs OpenAI GPT-5.6 on Amazon Bedrock.
