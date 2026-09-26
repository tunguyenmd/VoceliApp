# Heard model evals
Run 2026-09-26T19:15:44.044Z · provider openai · smart openai/gpt-5.6-terra · fast openai/gpt-5.6-luna

## 1. "Speak naturally" suggestions (10 synthetic answers)
| case | expected | suggested | result |
|---|---|---|---|
| garden-cats | family_friends, not_burden, hobbies, pets | family_friends, not_burden, hobbies, pets | ✓ |
| church-independence | faith, independence | faith, independence | ✓ |
| longevity | live_long | live_long, family_friends | ≈ |
| memory-fear | mental_sharpness, free_from_pain | mental_sharpness, free_from_pain | ✓ |
| home | home_vs_facility | home_vs_facility, pets | ≈ |
| machines | machines, no_recovery | machines | ≈ |
| recognize | cant_recognize | cant_recognize, recognize_loved_ones | ≈ |
| everything | none | live_long, none | ≈ |
| neutral-health | — | — | ✓ |
| story-only | — | — | ✓ |

**Precision 76% · recall 93% · ungrounded proposals caught by the validator: 0 · avg 1.1 s**
Every suggestion shown to a user quotes their exact words (validated server-side; ungrounded ones never reach the screen).

## 2. Family search ("What did Hoa say about…?")
| question | status | citations (all verified verbatim) | ok |
|---|---|---|---|
| Would Mom want to be kept on machines if she couldn't recover? | addressed | 3 | ✓ |
| Where does she want to be cared for? | addressed | 2 | ✓ |
| Did Mom want to donate her organs? | not_addressed | 0 | ✓ |
| Should we do CPR on her? | related | 2 | ✓ |
| What is her favorite movie? | not_addressed | 0 | ✓ |

**5/5 behaved as expected.** Unanswerable questions (organ donation, favorite movie) must not be "answered".

## 3. Clarity check on the demo plan (3 runs)
- run 1: 3 notes (unclear, unclear, unclear), "like a vegetable" caught
- run 2: 2 notes (tension, unclear), "like a vegetable" caught
- run 3: 2 notes (unclear, unclear), "like a vegetable" caught

**Caught the ambiguous phrase in 3/3 runs.**
