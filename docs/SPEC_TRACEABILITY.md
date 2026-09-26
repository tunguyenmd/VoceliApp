# Spec traceability: "Advance Care Planning App, Product Specification, Draft v2"

Every requirement in the spec, where it lives in Heard, and anything we added or deferred. **Additions are flagged for physician review.**

## §1 Overview and scope
| Requirement | Implementation |
|---|---|
| Guide end-of-life discussions | 8-step guided conversation in 5 chapters: `lib/content/prompts.ts`, `app/(planner)/talk/[promptId]` |
| Help prepare POLST forms | POLST *conversation prep*: what POLST is, who it's for, the sections with plain explanations, "what you told Heard", questions for your clinician, and an optional user-chosen leaning. Watermarked *"Draft for discussion with your clinician. Not a medical order."* `lib/content/polst.ts`, `/next-steps` |
| Share values with loved ones | Family sharing (§9) |
| Broad range of adults, not only the seriously ill | POLST prep is opt-in and explains it's for serious illness or frailty; healthy adults are pointed to the advance directive |
| Excludes physician signing | No signing, no clinician delivery anywhere |

## §3 Differentiating pillars
| Pillar | Status |
|---|---|
| 3.1 Multilingual, culturally adapted | **Deferred per §10 (MVP English only).** Content lives in data files so per-culture versions can be reviewed and swapped. On the roadmap. |
| 3.2 Individual vs family-centered | **Individual mode only, per §10.** Family mode is deferred. |
| 3.3 Guided voice recordings | Every question, plus the family message. Played back in the family view. |

## §4 Guided conversation flow
| # | Prompt type | Implementation |
|---|---|---|
| 1 | Open reflection | `reflect_health`, `reflect_experience` (two prompts: health perspective, prior experience with serious illness) |
| 2 | Chip-select, "What matters most" | Exactly the spec's options: Independence · Not burdening loved ones · Living as long as possible · Family/friends · Pets · Hobbies · Faith · Other (free text) |
| 3 | Chip-select, "Quality of life" | Recognizing/talking with loved ones · Physical independence · Freedom from pain · Mental sharpness · Home vs. facility · Other |
| 4 | Spectrum / slider | "Try everything" → "Comfort-focused", 5 labelled stops with plain descriptions, plus "I'm not sure yet" |
| 5 | Scenario checklist | No chance of recovery · no chance of independence · can't recognize loved ones · kept alive by machines · other. **Addition, for review:** an exclusive "None of these. I would want treatment to continue." so "none apply" is recorded explicitly instead of inferred from blank boxes. |
| — | Every question: voice + structured input + free text | `VoicePanel` + input + "Type instead" on all 8 steps |

## §5 Out of scope and output framing
| Requirement | Implementation |
|---|---|
| No physician signing, telehealth, or acting as a legal order | None built. Copy: `NOT_A_LEGAL_DOCUMENT` on the summary card, onboarding, and family view |
| No sending the plan or POLST draft to clinicians | No such path. The family view tells relatives to *show* the page to the care team. |
| Output is a values summary, not a legal directive | Values summary card (AI-drafted with citations, or template); the person approves it |
| Direct users to state execution requirements | `/next-steps`: California requirements verified against Probate Code §§ 4673–4675 (dated), plus free official forms for every state via CaringInfo. **Open item §12.3:** legal review before launch, and more states in detail. |

## §6 Recording duration and UX
| Requirement | Implementation |
|---|---|
| 60–90 s structured recordings | 90 s hard limit, 60 s target tick on the ring |
| Optional 3–5 min family message | 300 s limit, 180 s target |
| Countdown/progress ring + waveform | `RecordButton` ring (turns gold in the last 10 s), live `Waveform` from an AnalyserNode |
| Re-record any time, no penalty | "Record again" (replace) and "Record more" (add a follow-up clip); delete any clip |
| Partial auto-save at the limit, continue in a follow-up clip | Auto-saves at the limit (flagged `autoSaved`), offers "Continue in a new clip" (`continuationOf`) |
| "Type instead" at every step | On every question |
| Skip without penalty or friction | "Skip" on every step. Skipped questions are never counted against the person, and the Clarity check is instructed to ignore them. |

## §7 Revisiting and updating
| Requirement | Implementation |
|---|---|
| Annual revisit prompt | `nextReviewAt` = last share + 1 year; a "Time for a check-in" banner on My plan |
| Log a major life event → earlier prompt | Diagnosis, hospital stay, birth, loss, relationship, move, other: sets the review as due now |
| Shared plans don't go stale | Versioned publishing. Family sees "Last reviewed…, after a hospital stay"; the planner sees "you've made changes since you last shared" |

## §8 Diagnosis/prognosis disclosure preference
| Requirement | Implementation |
|---|---|
| Dedicated prompt, separate from the five types | `disclosure` step: tell me everything / diagnosis first / tell my family first / I'd rather not know, plus "who should be there" |
| High-sensitivity, stored distinctly | Its own encrypted file under its **own data key** (`disclosure` domain), versioned separately at publish; recordings for it also use that key |
| Own access log | Separate hash-chained `audit-disclosure.jsonl`; every family view (a deliberate "Show me" reveal) and every edit is logged |
| (Our hardening) | Never transcribed and never sent to any AI model; family search points to it instead of answering from it |

## §9 Family sharing
| Requirement | Implementation |
|---|---|
| Family mode deferred, sharing in scope | Sharing implemented, family-centered mode not |
| Shared view: voice recordings + text summary card | `/f/[token]`: summary card, recordings by question with transcripts, message to family |
| Granular and revocable, with an audit trail | Per-person scopes (summary / recordings / message / disclosure), editable any time; revoke kills link and device immediately; every view, play, save, search, and denial is logged |
| Recipient gives explicit consent | Their own consent screen (three statements plus typed name), stored with a consent version and hash per device |
| Users told revoking can't retract downloads | Required acknowledgement on the invite form; "Saved N copies" is tracked per person |

## §10 MVP scope
Individual mode only ✓ · English only ✓ · voice/skip/type on every prompt ✓ · end-of-flow sharing (voice + summary) ✓ · no clinician-facing delivery ✓

## §11 Security and storage: see [SECURITY.md](SECURITY.md)
11.1 classification and encryption ✓ · 11.2 consent chain ✓ · 11.3 disclosure field handling ✓ · 11.4 retention, deletion, memorial mode, inactivity: implemented as user settings with proposed defaults, **policy needs legal sign-off** · 11.5 voice: notice at consent, no voiceprints, no voice cloning, transcripts protected like audio; **BIPA review open** · 11.6 third parties: inventory in SECURITY.md · 11.7 breach plan drafted.

## Additions beyond the spec (all optional to keep)
1. **Speak naturally**: suggests answers from the person's own words (never auto-selects).
2. **Clarity check**: flags tensions and ambiguous phrases, never skipped questions.
3. **AI values summary** with per-sentence citations and exact-moment audio quotes (template fallback when AI is off).
4. **Family search**: "What did Mom say about…?", answered only with her words; says so when she didn't address it.
5. **Distress safety net**: if a recording expresses a present wish to self-harm, a calm 988 resource card appears.
6. **Memorial mode and legacy contact** (spec 11.4 asks for a policy; this is a working version).
7. "None of these" option on the scenario checklist (see §4).

## Open questions from §12, and where they stand
1. Cultural content frameworks: post-MVP; content is data-driven to support per-culture review.
2. Family-side view design: built (`/f/[token]`); needs user testing with families.
3. State requirements for the disclaimer: California verified; other states link to official forms.
4. Biometric privacy legal review: open (see SECURITY.md §5).
5. Interactive prototype scope: this app is the prototype.
