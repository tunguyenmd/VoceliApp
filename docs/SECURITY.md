# Security and privacy design

Heard's MVP has no clinician in the loop and is not a HIPAA covered entity. Following spec §11, we still treat voice recordings, transcripts, and the diagnosis/prognosis disclosure preference as **sensitive health data**. This document describes what the prototype does today and what production needs before launch.

## 1. Data classification
| Class | Examples | Protection |
|---|---|---|
| **S3: highest** | Diagnosis/prognosis disclosure preference, and its recordings | Own data key, own file, own access log; never transcribed; never sent to AI |
| **S2: sensitive** | Voice recordings, transcripts (a "second sensitive copy", §11.5), answers, summary | Encrypted per plan; transcripts under the same key as audio |
| S1: personal | First name, state, family members' names and relationships, consent records | Encrypted inside the plan's core file |
| S0: operational | Access-log metadata (who, what, when; no content), share-token hashes | Integrity-protected (hash chain); tokens stored only as SHA-256 |

## 2. Encryption
- **At rest:** AES-256-GCM. Each plan has three data keys (`core`, `voice`, `disclosure`), wrapped by a key-encryption key (KEK). Each ciphertext is bound to its path and domain with GCM additional authenticated data, so a file moved or renamed will not decrypt (`tests/security.test.ts`).
- **KEK:** `HEARD_MASTER_KEY` (or a generated local key for development). **Production:** AWS KMS (`GenerateDataKey`/`Decrypt`) with key policies and CloudTrail. The envelope format was designed so only the KEK provider changes.
- **In transit:** HTTPS in deployment (set `HEARD_SECURE_COOKIES=1`). Bedrock and Transcribe calls use TLS with SigV4 signatures.
- **Deletion:** crypto-shredding. Deleting a plan destroys its wrapped keys first, then the files.

## 3. Access control and audit
- The planner has a signed, HttpOnly session cookie bound to their plan.
- A family member needs a 256-bit invite token (only its SHA-256 is stored), then gives **their own consent**, which binds a signed device cookie to that share. A new device requires consent again, and it is logged.
- Scopes per person: summary / recordings / family message / disclosure preference. Revoking takes effect on the next request.
- **Access logs:** append-only JSONL with a SHA-256 hash chain and a separate head file. Edits, reordering, and truncation are detected. There are two logs: `access` and `disclosure`. The planner sees both in the Privacy center, with a "Tamper check passed" badge. Production: anchor the head hash externally, for example in S3 Object Lock or CloudTrail Lake.
- Audio plays are counted once per minute per person; saving a copy is always logged and counted.

## 4. AI processing
- **Amazon Bedrock** (OpenAI GPT-5.6) via the Responses API with **`store:false`**, so responses are not retained for conversation state. AWS states that Bedrock doesn't store or log prompts and completions, doesn't use them for training, and that model providers have no access to them. **Caveat:** for some OpenAI models, AWS abuse detection may retain *classifier-flagged* traffic for up to 30 days, without sharing it with the provider. Disclose this in the privacy policy.
- **Amazon Transcribe:** AWS may use content to improve AI services unless the account opts out. **Production: enable the AWS Organizations AI-services opt-out policy.**
- **Minimisation:** the model receives only the answers needed for the task, never the disclosure preference. Nothing is logged except error class and timing, never prompts or outputs.
- **Output controls:** strict JSON schemas; quotes must match the source and are replaced with the exact words; unknown sources are dropped; advice-like language is filtered; family search never recommends. Measured in `docs/EVAL_RESULTS.md`.
- The person can turn AI and transcription off at any time; every feature has a non-AI path.

## 5. Voice data (§11.5)
- Consent notice before the first recording: what's stored, who hears it, no voiceprints, no voice cloning, and that transcription creates a text copy.
- We don't derive biometric identifiers from voice. **Legal review still required** for Illinois BIPA and similar laws (Texas CUBI, Washington), and consumer-health-data laws such as the Washington My Health My Data Act, Nevada SB 370, and the Connecticut data privacy act. Also the FTC Health Breach Notification Rule, since a health app outside HIPAA may be a "vendor of personal health records".

## 6. Third-party exposure (§11.6)
| Vendor | Data | Notes |
|---|---|---|
| AWS Bedrock | Answer text/transcripts (task-specific) | `store:false`, no training, regional |
| AWS Transcribe | Audio stream (not the disclosure preference) | Enable the AI-services opt-out |
| Hosting (TBD) | Encrypted files | Encrypt before storage, least-privilege IAM |
| Analytics / crash reporting | **None.** | If added later, scrub form fields and audio, and never send request bodies |
| Fonts | None at runtime | `next/font` self-hosts fonts, so browsers make no third-party font requests |

## 7. Retention (§11.4), as implemented settings with proposed defaults
- **Account deletion:** default "end everyone's access and erase everything" (crypto-shred). The alternative "keep what I shared" preserves published versions only.
- **Death:** a legacy contact can trigger **memorial mode**, which freezes the plan, keeps family access, and stops reminders. Production needs a verification step.
- **Inactivity:** after N years without sign-in (default 3), check in with the person, then the legacy contact. Nothing is deleted silently.
- **Proposed data retention:** plan data kept until deleted; backups purged within 35 days of deletion. *Needs legal sign-off.*

## 8. Breach response plan (draft, §11.7)
1. **Detect and contain (0–24 h):** revoke suspicious sessions, rotate the KEK/KMS keys and session secret, preserve logs, and appoint an incident lead and a privacy counsel contact.
2. **Assess (≤72 h):** which classes (S0–S3) were exposed, whether the data was encrypted and whether keys were exposed, and which people and states are affected.
3. **Notify:**
   - affected users (and, where possible, the family members holding shares), in plain language with what happened, what data, what we're doing, and what they can do;
   - regulators as required: the FTC Health Breach Notification Rule (vendors of personal health records must notify affected individuals and the FTC; check current timelines), state attorneys general under state breach and health-data laws;
   - the media where thresholds are met.
4. **Remediate:** root-cause fix, key rotation complete, re-encryption if needed, and a third-party review.
5. **Review:** a public post-incident summary, and updates to this plan.

*Owners, contacts, and exact regulatory deadlines must be confirmed by counsel before launch.*
