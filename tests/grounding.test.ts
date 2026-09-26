import { describe, expect, it } from "vitest";
import { exactQuote, locateQuote, quoteTiming, soundsLikeAdvice } from "@/lib/grounding";
import { labelPassages, type Passage } from "@/lib/server/ai/material";

const transcript =
  "If machines are keeping me alive and the doctors say I won't come back. Please let me go. Don't feel guilty. And if I don't know who you are anymore, don't keep me going like a vegetable for a long time.";

describe("quote grounding", () => {
  it("finds exact quotes regardless of case and punctuation", () => {
    expect(locateQuote("please let me go", transcript)).not.toBeNull();
    expect(locateQuote("Please, let me go!", transcript)?.score).toBe(1);
  });

  it("tolerates a small paraphrase drift but rejects invented words", () => {
    expect(locateQuote("If machines are keeping me alive and the doctor says I won't come back", transcript)).not.toBeNull();
    expect(locateQuote("I want every possible treatment no matter what", transcript)).toBeNull();
  });

  it("replaces a model's tidied quote with the person's exact words", () => {
    // Model "tidied" the quote (joined two sentences with "and"); we display what was really said.
    expect(exactQuote("please let me go and don't feel guilty", transcript)).toBe("Please let me go. Don't feel guilty.");
    expect(exactQuote("please keep me alive on machines as long as possible", transcript)).toBeNull();
    expect(exactQuote("the doctors say I will not come back", transcript, 0.7)).toBe("the doctors say I won't come back.");
    expect(exactQuote("dont keep me going like a vegetable", transcript)).toBe("don't keep me going like a vegetable");
  });

  it("maps a quote onto word timings for exact-moment playback", () => {
    const words = transcript
      .replace(/[.,]/g, "")
      .split(" ")
      .map((w, i) => ({ w, s: i * 0.4, e: i * 0.4 + 0.35 }));
    const t = quoteTiming("Please let me go", words);
    expect(t).not.toBeNull();
    // "Please" is the 15th word (index 14) → starts at 5.6 s, minus a small lead-in.
    expect(t!.start).toBeCloseTo(5.45, 2);
    expect(t!.end).toBeCloseTo(17 * 0.4 + 0.35 + 0.25, 2);
  });

  it("flags directive language but allows gentle questions", () => {
    expect(soundsLikeAdvice("She should be intubated if it comes to that.")).toBe(true);
    expect(soundsLikeAdvice("You should honor her wishes.", "statement")).toBe(true);
    expect(soundsLikeAdvice("You should feel free to add more if you like.", "question")).toBe(false);
    expect(soundsLikeAdvice("Linh said she would want to stop if machines kept her alive.")).toBe(false);
  });
});

describe("passage labels", () => {
  const passages: Passage[] = [
    { sourceId: "answer:stop_treatment", label: "When to stop", text: "Selected: I am being kept alive by machines." },
    { sourceId: "clip:Ab12Cd34Ef56Gh78", label: "When to stop (recorded)", text: transcript, clipId: "Ab12Cd34Ef56Gh78" },
  ];
  const { block, resolve } = labelPassages(passages);

  it("shows short labels to the model", () => {
    expect(block).toContain("[S1] When to stop");
    expect(block).toContain("[S2] When to stop (recorded)");
    expect(block).not.toContain("Ab12Cd34Ef56Gh78");
  });

  it("resolves labels, and recovers the right passage when the label is wrong", () => {
    expect(resolve("S2")?.clipId).toBe("Ab12Cd34Ef56Gh78");
    expect(resolve("[s1]")?.sourceId).toBe("answer:stop_treatment");
    expect(resolve("S1", "please let me go")?.sourceId).toBe("clip:Ab12Cd34Ef56Gh78");
    expect(resolve("S9", "a sentence nobody said")).toBeNull();
  });
});

describe("label scrubbing", () => {
  it("removes passage labels from prose", async () => {
    const { stripLabels } = await import("@/lib/grounding");
    expect(stripLabels("She said to let her go (S8, S10).")).toBe("She said to let her go.");
    expect(stripLabels("Family matters most [S2] to her.")).toBe("Family matters most to her.");
    expect(stripLabels("Nothing to strip here.")).toBe("Nothing to strip here.");
  });
});
