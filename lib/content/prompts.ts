import type { ChapterDef, PromptDef, PromptId, DisclosureChoice, LifeEventType } from "@/lib/types";

// Clinical wording lives here, in plain data, so the physician author can review and edit it directly.
// The AI never rewrites these strings; it only reads the person's own answers.

export const CHAPTERS: ChapterDef[] = [
  { id: "story", title: "Your story", blurb: "A little about you and what you have lived through." },
  { id: "values", title: "What matters", blurb: "The things that make your life your own." },
  { id: "care", title: "Your care", blurb: "How you would want treatment to go if you were very sick." },
  { id: "told", title: "Being told", blurb: "How you would want to hear serious news." },
  { id: "message", title: "Your message", blurb: "Something in your own voice for the people you love." },
];

export const PROMPTS: PromptDef[] = [
  {
    id: "reflect_health",
    kind: "reflection",
    chapter: "story",
    eyebrow: "Your health, in your words",
    question: "How do you feel about your health right now?",
    help: "There are no right answers. You might talk about how you feel day to day, what worries you, or what you are hopeful about.",
    voiceCue: "Take your time. About a minute is plenty.",
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    id: "reflect_experience",
    kind: "reflection",
    chapter: "story",
    eyebrow: "What you have lived through",
    question:
      "Have you, or someone close to you, been through a serious illness? What did it teach you about what you would want?",
    help: "Many people's wishes are shaped by watching a parent, partner, or friend go through a hospital stay.",
    voiceCue: "Share as much or as little as you like.",
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    id: "matters_most",
    kind: "chips",
    chapter: "values",
    eyebrow: "What matters most",
    question: "When you think about what makes your life your own, what matters most to you?",
    help: "Choose as many as you like.",
    voiceCue: "Tell your family why these matter to you.",
    options: [
      { id: "independence", label: "Independence" },
      { id: "not_burden", label: "Not burdening loved ones" },
      { id: "live_long", label: "Living as long as possible" },
      { id: "family_friends", label: "Family and friends" },
      { id: "pets", label: "Pets" },
      { id: "hobbies", label: "Hobbies" },
      { id: "faith", label: "Faith" },
      { id: "other", label: "Other", isOther: true },
    ],
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    id: "quality_of_life",
    kind: "chips",
    chapter: "values",
    eyebrow: "Quality of life",
    // Wording from the physician's demo script (Sep 26 2026); the spec's original was "If you became seriously ill,
    // which of these would matter most for your quality of life?"
    question: "When you think about what makes your life feel like your own, what does a good quality of life mean to you?",
    help: "Choose as many as you like.",
    voiceCue: "Tell your family what a good day would still look like.",
    options: [
      { id: "recognize_loved_ones", label: "Recognizing and talking with loved ones" },
      { id: "physical_independence", label: "Physical independence" },
      { id: "free_from_pain", label: "Freedom from pain" },
      // Added with the demo script's wording, which invites it. Flagged for physician review in docs/SPEC_TRACEABILITY.md.
      { id: "not_burden", label: "Not being a burden to my family" },
      { id: "mental_sharpness", label: "Mental sharpness" },
      { id: "home_vs_facility", label: "Where I live (home vs. a facility)" },
      { id: "other", label: "Other", isOther: true },
    ],
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    id: "care_spectrum",
    kind: "spectrum",
    chapter: "care",
    eyebrow: "How much treatment",
    question:
      "If you were seriously ill and your doctors were not sure you would recover, how would you want your care to lean?",
    help: "Slide to the spot that feels closest. You can change it any time.",
    voiceCue: "Tell your family what you would want them to keep in mind.",
    stops: [
      {
        value: 1,
        label: "Try everything",
        description: "Use every treatment that might extend my life, even if it is hard or uncomfortable.",
      },
      {
        value: 2,
        label: "Lean toward trying",
        description: "Try most treatments, but I may want to stop if they are not working.",
      },
      {
        value: 3,
        label: "It depends",
        description: "Weigh my chances and what recovery would really look like.",
      },
      {
        value: 4,
        label: "Lean toward comfort",
        description: "Focus mostly on comfort, but I am open to treatments that are not too hard on me.",
      },
      {
        value: 5,
        label: "Comfort-focused",
        description: "Focus on comfort and peace, even if it means a shorter life.",
      },
    ],
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    // Not in the source spec: the physician's question from the Sep 26 2026 demo script, asked word for word. The
    // answer choices are drafted from it and flagged for physician review in docs/SPEC_TRACEABILITY.md.
    id: "ventilator",
    kind: "chips",
    chapter: "care",
    eyebrow: "A breathing machine",
    question:
      "When you envision a situation when you cannot breathe to live, needing a breathing tube connected to a breathing machine - intubated on a ventilator, would you consider undergoing this procedure short term or long term in order to live?",
    help: "Choose the one that feels closest.",
    voiceCue: "Tell your family, in your own words, what you would want.",
    options: [
      { id: "short_term", label: "For a short time, if I could meaningfully recover", exclusive: true },
      { id: "long_term", label: "Long term, if that is what it takes to live", exclusive: true },
      { id: "not_at_all", label: "I would not want a breathing tube", exclusive: true },
      { id: "not_sure", label: "I am not sure yet", exclusive: true },
    ],
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    id: "stop_treatment",
    kind: "scenarios",
    chapter: "care",
    eyebrow: "When to stop",
    question: "I would want to stop treatments meant to prolong my life if…",
    help: "Check any that are true for you.",
    voiceCue: "Tell your family, in your own words, when it would be time to let go.",
    options: [
      { id: "no_recovery", label: "There is no chance I will recover" },
      { id: "no_independence", label: "There is no chance I will be independent again" },
      { id: "cant_recognize", label: "I can no longer recognize my loved ones" },
      { id: "machines", label: "I am being kept alive by machines" },
      { id: "other", label: "Other", isOther: true },
      // Not in the source list. Added so "none apply" is recorded explicitly instead of inferred from
      // blank boxes. Flagged for physician review in docs/SPEC_TRACEABILITY.md.
      { id: "none", label: "None of these. I would want treatment to continue.", exclusive: true },
    ],
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    id: "disclosure",
    kind: "disclosure",
    chapter: "told",
    eyebrow: "Being told",
    question: "If you were diagnosed with a serious illness, how would you want to hear about it?",
    help: "This shapes what your family says to you in a crisis, so it is kept separate from your other answers and every view of it is logged.",
    voiceCue: "Tell your family how you would want serious news shared with you.",
    sensitive: true,
    recordLimitSec: 90,
    targetSec: 60,
  },
  {
    id: "family_message",
    kind: "legacy",
    chapter: "message",
    eyebrow: "A message to my family",
    question: "If you could say anything to the people you love, what would you want them to know?",
    help: "Optional. This is separate from your answers, and you can take up to five minutes.",
    voiceCue: "Speak from the heart. Three to five minutes is plenty.",
    optional: true,
    starters: [
      "What I am grateful for",
      "What I hope for each of you",
      "How I would like to be remembered",
      "It is okay to let me go when the time comes",
    ],
    recordLimitSec: 300,
    targetSec: 180,
  },
];

export const PROMPT_BY_ID = Object.fromEntries(PROMPTS.map((p) => [p.id, p])) as Record<PromptId, PromptDef>;

export const STRUCTURED_PROMPT_IDS: PromptId[] = ["matters_most", "quality_of_life", "care_spectrum", "ventilator", "stop_treatment"];

export const DISCLOSURE_OPTIONS: { id: DisclosureChoice; label: string; description: string }[] = [
  {
    id: "tell_all",
    label: "Tell me everything",
    description: "The diagnosis and what to expect, including how much time I might have.",
  },
  {
    id: "tell_diagnosis",
    label: "Tell me the diagnosis first",
    description: "I will ask about the outlook when I am ready.",
  },
  {
    id: "family_first",
    label: "Tell my family first",
    description: "Let them decide how and when to tell me.",
  },
  {
    id: "dont_tell",
    label: "I would rather not know",
    description: "Share it with someone I trust instead.",
  },
];

export const LIFE_EVENTS: { id: LifeEventType; label: string }[] = [
  { id: "diagnosis", label: "A new diagnosis" },
  { id: "hospitalization", label: "A hospital stay" },
  { id: "birth", label: "A birth in the family" },
  { id: "death", label: "The loss of someone close" },
  { id: "relationship", label: "Marriage, divorce, or a new partner" },
  { id: "move", label: "A move" },
  { id: "other", label: "Something else" },
];

export function optionLabel(promptId: PromptId, optionId: string): string {
  return PROMPT_BY_ID[promptId]?.options?.find((o) => o.id === optionId)?.label ?? optionId;
}

export function spectrumStop(value: number | null | undefined) {
  return PROMPT_BY_ID.care_spectrum.stops!.find((s) => s.value === value);
}

export function disclosureLabel(choice?: DisclosureChoice) {
  return DISCLOSURE_OPTIONS.find((d) => d.id === choice);
}
