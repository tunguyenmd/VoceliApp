// User-facing legal and consent wording in one place so it can be reviewed (and versioned) as a unit.

export const APP_NAME = "Voceli";
export const TAGLINE = "Advance care planning, in your own voice.";

export const NOT_A_LEGAL_DOCUMENT =
  "This is a summary of your values and wishes. It is not an advance directive, a POLST, or a medical order, and it does not replace the forms your state requires.";

export const VOICE_NOTICE = {
  version: "voice-2026-09",
  points: [
    "Your recordings are stored encrypted and played only for you and the people you choose.",
    "We never create a voiceprint, identify you by your voice, or use your voice to train AI. We will never make an artificial copy of your voice.",
    "If you turn on transcription, your words are also saved as text. That text is protected the same way as your audio.",
    "You can re-record, delete, or stop at any time.",
  ],
};

export const SHARE_WARNING =
  "You can turn off someone's access at any time. But if they save or download a recording or your summary, turning off access cannot take back the copy they already have.";

export const CONSENT_VERSION = "family-consent-2026-09";

export function familyConsentPoints(name: string): string[] {
  return [
    `I agree to receive and keep ${name}'s care wishes, including recordings of ${name}'s voice.`,
    `I understand this is private health information, and I will not share it without ${name}'s permission.`,
    `I understand ${name} can turn off my access at any time, and that anything I save to my device stays my responsibility.`,
  ];
}

export const DISCLOSURE_VIEW_NOTE =
  "This preference shapes what you say to them in a crisis, so it is kept separately. Viewing it is recorded in their access log.";

export const CRISIS_RESOURCES = {
  title: "You don't have to carry this alone",
  body: "If you are thinking about ending your life or hurting yourself, please reach out now. In the U.S., call or text 988 (Suicide & Crisis Lifeline), any time.",
  link: "https://988lifeline.org",
};
