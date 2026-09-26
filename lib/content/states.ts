// State execution requirements referenced by the values-summary disclaimer (spec §5, open question 3).
// Only states whose rules were checked against the statute are listed in detail; every other state links to its
// free official form and instructions. Verified 2026-09-25. Legal review is still required before launch.

export interface StateGuide {
  documentName: string;
  steps: string[];
  witnessRules: string[];
  special?: string;
  polst?: string;
  source: { label: string; url: string };
  verifiedAt: string;
}

export const STATE_GUIDES: Record<string, StateGuide> = {
  CA: {
    documentName: "Advance Health Care Directive",
    steps: [
      "Write the date and sign it yourself, or have another adult sign your name while you watch and at your direction.",
      "Then do one of two things: have it acknowledged by a notary public, or sign in front of two adult witnesses who also sign.",
    ],
    witnessRules: [
      "Witnesses must be adults who know you, or who can confirm who you are.",
      "Your health care agent, your health care provider or their employees, and the operator or employees of a community care or residential care facility cannot be witnesses.",
      "At least one witness cannot be related to you by blood, marriage, or adoption, or be entitled to any part of your estate.",
    ],
    special: "If you live in a skilled nursing facility, a patient advocate or ombudsman must also sign as a witness.",
    polst:
      "In California, a POLST is filled out with your clinician and signed by you (or your decision-maker) and your physician, nurse practitioner, or physician assistant. A section left blank means full treatment for that section.",
    source: { label: "California Probate Code §§ 4673–4675", url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PROB&sectionNum=4673" },
    verifiedAt: "2026-09-25",
  },
};

export const US_STATES: { code: string; name: string }[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([code, name]) => ({ code, name }));

export function caringInfoUrl(code: string): string {
  const name = US_STATES.find((s) => s.code === code)?.name;
  if (!name) return "https://www.caringinfo.org/planning/advance-directives/by-state/";
  return `https://www.caringinfo.org/planning/advance-directives/by-state/${name.toLowerCase().replace(/\s+/g, "-")}/`;
}
