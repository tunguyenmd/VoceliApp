import type { Answer, ClarityNote, PromptId, Transcript } from "@/lib/types";
import { PROMPT_BY_ID, optionLabel, spectrumStop } from "@/lib/content/prompts";
import { locateQuote } from "@/lib/grounding";

// Turns a plan into labelled, citable passages for the model. Source ids are stable strings the model must cite:
//   answer:<promptId>   the structured selection, rendered as text
//   text:<promptId>     what the person typed
//   clip:<clipId>       a transcript of what the person said
//   clarify:<noteId>    a typed answer to a Clarity-check question
// The disclosure preference is never included: it has its own key and access log and is not sent to any model.

export interface Passage {
  sourceId: string;
  label: string;
  text: string;
  promptId?: PromptId;
  clipId?: string;
}

export function renderStructured(a: Answer): string | null {
  const p = PROMPT_BY_ID[a.promptId];
  if (!p || a.status !== "answered") return null;
  if (p.kind === "chips" || p.kind === "scenarios") {
    const labels = (a.selected ?? []).filter((id) => id !== "other").map((id) => optionLabel(a.promptId, id));
    if (a.selected?.includes("other") && a.otherText) labels.push(`Other: ${a.otherText}`);
    return labels.length ? `Selected: ${labels.join("; ")}.` : null;
  }
  if (p.kind === "spectrum") {
    if (a.unsure) return "Not sure yet.";
    const stop = spectrumStop(a.spectrum ?? null);
    return stop ? `Chose ${stop.value} of 5, "${stop.label}": ${stop.description}` : null;
  }
  return null;
}

export function buildPassages(
  answers: Answer[],
  transcripts: Record<string, Transcript>,
  opts: { clarity?: ClarityNote[]; includeFamilyMessage?: boolean } = {},
): Passage[] {
  const out: Passage[] = [];
  for (const a of answers) {
    if (a.promptId === "disclosure" || a.status !== "answered") continue;
    if (a.promptId === "family_message" && !opts.includeFamilyMessage) continue;
    const p = PROMPT_BY_ID[a.promptId];
    const structured = renderStructured(a);
    if (structured) out.push({ sourceId: `answer:${a.promptId}`, label: `${p.eyebrow} — ${p.question}`, text: structured, promptId: a.promptId });
    if (a.text?.trim()) out.push({ sourceId: `text:${a.promptId}`, label: `${p.eyebrow} (typed)`, text: a.text.trim(), promptId: a.promptId });
    for (const clipId of a.clipIds) {
      const t = transcripts[clipId];
      if (t?.text.trim()) out.push({ sourceId: `clip:${clipId}`, label: `${p.eyebrow} (recorded)`, text: t.text.trim(), promptId: a.promptId, clipId });
    }
  }
  for (const n of opts.clarity ?? []) {
    if (n.state !== "answered" || !n.response) continue;
    if (n.response.text?.trim()) out.push({ sourceId: `clarify:${n.id}`, label: `Clarification — ${n.followUp}`, text: n.response.text.trim() });
    for (const clipId of n.response.clipIds) {
      const t = transcripts[clipId];
      if (t?.text.trim()) out.push({ sourceId: `clip:${clipId}`, label: `Clarification — ${n.followUp} (recorded)`, text: t.text.trim(), clipId });
    }
  }
  return out;
}

/**
 * Passages are shown to the model under short labels (S1, S2, …) because models occasionally mistype long random
 * ids. `resolve` maps a cited label back to its passage; when a quote is given and the label is wrong or missing,
 * it finds the passage that actually contains the quote. Quotes are verified against the text either way.
 */
export function labelPassages(passages: Passage[]) {
  const byLabel = new Map(passages.map((p, i) => [`S${i + 1}`, p]));
  const block = passages.map((p, i) => `[S${i + 1}] ${p.label}\n"""\n${p.text}\n"""`).join("\n\n");
  function resolve(label: string, quote?: string): Passage | null {
    const clean = label.replace(/[\[\]\s]/g, "").toUpperCase();
    const direct = byLabel.get(clean) ?? passages.find((p) => p.sourceId === label.replace(/[\[\]\s]/g, ""));
    if (!quote) return direct ?? null;
    if (direct && locateQuote(quote, direct.text, 0.8)) return direct;
    return passages.find((p) => locateQuote(quote, p.text, 0.8)) ?? null;
  }
  return { block, resolve };
}
