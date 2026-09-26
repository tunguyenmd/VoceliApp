import { describe, expect, it } from "vitest";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { mergeSelection } from "@/lib/server/answers";

// In the mobile app, what the person taps and what they tell Linh add up to one answer.
describe("mergeSelection", () => {
  const matters = PROMPT_BY_ID.matters_most;
  const stop = PROMPT_BY_ID.stop_treatment;

  it("adds spoken options to tapped ones without duplicates", () => {
    expect(mergeSelection(matters, ["independence", "faith"], ["faith", "family_friends"])).toEqual(["independence", "faith", "family_friends"]);
    expect(mergeSelection(matters, undefined, ["pets"])).toEqual(["pets"]);
    expect(mergeSelection(matters, ["pets"], [])).toEqual(["pets"]);
  });

  it("keeps an exclusive option on its own", () => {
    expect(mergeSelection(stop, ["machines", "no_recovery"], ["none"])).toEqual(["none"]);
    expect(mergeSelection(stop, ["none"], ["machines"])).toEqual(["machines"]);
  });
});
