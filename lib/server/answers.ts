import type { PlanCore, PromptDef, SpectrumValue } from "@/lib/types";
import { HttpError } from "./session";

// One place that validates and applies an answer, used by the planner's own screens and by Linh, the voice agent.

export interface AnswerInput {
  status: "answered" | "skipped";
  selected?: string[];
  otherText?: string;
  spectrum?: number | null;
  unsure?: boolean;
  /** Typed words. Undefined keeps what's there, so an agent save never wipes what the person typed. */
  text?: string;
}

export function validateSelection(prompt: PromptDef, selected?: string[]): string[] | undefined {
  if (!selected) return undefined;
  const valid = new Set((prompt.options ?? []).map((o) => o.id));
  if (!selected.every((id) => valid.has(id))) throw new HttpError(400, "Unknown option");
  const exclusive = (prompt.options ?? []).filter((o) => o.exclusive).map((o) => o.id);
  const unique = [...new Set(selected)];
  if (unique.some((id) => exclusive.includes(id)) && unique.length > 1) throw new HttpError(400, "That option can't be combined with others");
  return unique;
}

/** In the mobile app Linh adds what the person said to what they've already tapped; an exclusive option (like
 *  "none of these") still stands alone. */
export function mergeSelection(prompt: PromptDef, existing: string[] = [], incoming: string[] = []): string[] {
  const exclusive = new Set((prompt.options ?? []).filter((o) => o.exclusive).map((o) => o.id));
  const pick = incoming.find((id) => exclusive.has(id));
  if (pick) return [pick];
  return [...new Set([...existing.filter((id) => !exclusive.has(id)), ...incoming])];
}

export function applyAnswer(core: PlanCore, prompt: PromptDef, body: AnswerInput) {
  if (prompt.kind === "disclosure") throw new HttpError(400, "The disclosure preference is stored separately");
  const selected = validateSelection(prompt, body.selected);
  const existing = core.answers[prompt.id];
  const multi = prompt.kind === "chips" || prompt.kind === "scenarios";
  const finalSelected = multi ? (selected ?? existing?.selected ?? []) : undefined;
  core.answers[prompt.id] = {
    promptId: prompt.id,
    status: body.status,
    selected: finalSelected,
    otherText: finalSelected?.includes("other") ? (body.otherText?.trim() || existing?.otherText || undefined) : undefined,
    spectrum: prompt.kind === "spectrum" ? ((body.spectrum === undefined ? (existing?.spectrum ?? null) : body.spectrum) as SpectrumValue | null) : undefined,
    unsure: prompt.kind === "spectrum" ? (body.unsure ?? existing?.unsure ?? false) : undefined,
    text: body.text === undefined ? existing?.text : body.text.trim() || undefined,
    clipIds: existing?.clipIds ?? [],
    updatedAt: new Date().toISOString(),
  };
  // Choosing an option settles any pending suggestion for it.
  for (const s of core.suggestions) {
    if (s.targetPromptId !== prompt.id || s.state !== "pending") continue;
    if (s.kind === "option" && finalSelected?.includes(s.optionId!)) s.state = "accepted";
    if (s.kind === "spectrum" && body.spectrum === s.value) s.state = "accepted";
  }
}
