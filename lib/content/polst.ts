import type { PromptId } from "@/lib/types";

// POLST preparation (spec §1): helps people with serious illness get ready for the conversation with their clinician.
// The app never fills in a POLST, never recommends a choice, and never sends anything to a clinician (spec §5).
// Physician-authored wording goes here; the "current leaning" is chosen by the person, not inferred.

export const POLST_ABOUT = {
  what:
    "POLST is a medical order that tells emergency responders and hospitals what treatment you want right now. It is meant for people with a serious illness or frailty, and it is filled out with your clinician, who signs it.",
  notYet:
    "If you are healthy and planning ahead, you likely don't need a POLST yet. An advance directive, plus the conversation you just had, is the right tool for now.",
  names: "Depending on your state it may be called POLST, MOLST, MOST, POST, or TPOPP.",
};

export interface PolstSection {
  id: string;
  title: string;
  explain: string;
  related: PromptId[];
  questions: string[];
  leanings: string[];
}

export const POLST_SECTIONS: PolstSection[] = [
  {
    id: "cpr",
    title: "CPR if your heart stops",
    explain:
      "Whether to try cardiopulmonary resuscitation if your heart stops or you stop breathing. CPR means chest compressions, and often a breathing tube and electric shocks to the heart.",
    related: ["care_spectrum", "stop_treatment"],
    questions: ["With my health as it is, what would CPR likely mean for me?", "If I survived CPR, what would my recovery probably look like?"],
    leanings: ["I would want CPR tried", "I would not want CPR", "I'm not sure yet"],
  },
  {
    id: "treatment",
    title: "How much treatment to start",
    explain:
      "If you are breathing but very sick: full treatment (including intensive care and a breathing machine), selective treatment (hospital care like antibiotics and IV fluids, usually without intensive care), or comfort-focused treatment (relieving pain and symptoms, often at home).",
    related: ["care_spectrum", "quality_of_life", "stop_treatment"],
    questions: ["Which level of treatment fits what matters most to me?", "When would you suggest we revisit this choice?"],
    leanings: ["Full treatment", "Selective treatment", "Comfort-focused treatment", "I'm not sure yet"],
  },
  {
    id: "nutrition",
    title: "Tube feeding",
    explain: "Whether to use a feeding tube if you can no longer eat or drink by mouth: for a long time, for a short trial, or not at all.",
    related: ["stop_treatment", "quality_of_life"],
    questions: ["In my situation, would a feeding tube likely help me live longer or feel better?", "What would a time-limited trial look like?"],
    leanings: ["Long-term tube feeding", "A trial period only", "No tube feeding", "I'm not sure yet"],
  },
];
