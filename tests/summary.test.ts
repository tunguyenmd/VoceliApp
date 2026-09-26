import { describe, expect, it } from "vitest";
import { newPlanCore } from "@/lib/server/plans";
import { templateSummary } from "@/lib/server/ai/summary";
import { buildPassages, renderStructured } from "@/lib/server/ai/material";

function plan() {
  const core = newPlanCore("plan_summary_1", "Linh");
  const now = new Date().toISOString();
  core.answers.matters_most = { promptId: "matters_most", status: "answered", selected: ["family_friends", "faith", "other"], otherText: "My garden", clipIds: [], updatedAt: now };
  core.answers.care_spectrum = { promptId: "care_spectrum", status: "answered", spectrum: 2, clipIds: [], updatedAt: now };
  core.answers.stop_treatment = { promptId: "stop_treatment", status: "answered", selected: ["machines", "cant_recognize"], clipIds: ["c1"], updatedAt: now };
  core.answers.quality_of_life = { promptId: "quality_of_life", status: "skipped", selected: ["free_from_pain"], clipIds: [], updatedAt: now };
  return core;
}

describe("template summary (AI off)", () => {
  it("builds first-person sentences only from answered questions", () => {
    const s = templateSummary(plan());
    expect(s.generator).toBe("template");
    expect(s.headline.text).toBe("What matters most to me is family and friends, faith and my garden.");
    const ids = s.sections.map((x) => x.id);
    expect(ids).toEqual(["matters", "treatment", "stop"]); // quality_of_life was skipped
    expect(s.sections.find((x) => x.id === "stop")!.sentences[0].text).toContain("i am being kept alive by machines");
    for (const section of s.sections) for (const sentence of section.sentences) expect(sentence.sources.length).toBeGreaterThan(0);
  });
});

describe("model inputs", () => {
  it("renders structured answers as citable text and never includes the disclosure preference", () => {
    const core = plan();
    expect(renderStructured(core.answers.care_spectrum!)).toContain('"Lean toward trying"');
    core.answers.disclosure = { promptId: "disclosure", status: "answered", text: "Tell me everything", clipIds: [], updatedAt: "" };
    const passages = buildPassages(Object.values(core.answers) as never, { c1: { clipId: "c1", text: "Please let me go.", words: [], provider: "t", createdAt: "" } });
    expect(passages.map((p) => p.sourceId)).toEqual(["answer:matters_most", "answer:care_spectrum", "answer:stop_treatment", "clip:c1"]);
    expect(passages.some((p) => p.text.includes("Tell me everything"))).toBe(false);
  });
});
