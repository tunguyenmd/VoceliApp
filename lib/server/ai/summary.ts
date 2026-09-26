import { z } from "zod";
import type { Answer, PlanCore, Quote, SummaryDoc, SummarySection, SummarySentence } from "@/lib/types";
import { optionLabel, spectrumStop } from "@/lib/content/prompts";
import { exactQuote, soundsLikeAdvice, stripLabels } from "@/lib/grounding";
import { generateJson, S } from "./json";
import { labelPassages, type Passage } from "./material";

// The values summary card (spec §5 "Output framing", §9). Written in the person's voice, and every sentence must cite
// the answers it came from. Sentences that cite nothing real are removed and counted, so the UI can say so.

export const SECTION_TITLES: Record<SummarySection["id"], string> = {
  matters: "What matters most to me",
  quality: "What quality of life means to me",
  treatment: "How I want my care to lean",
  stop: "When I would want to stop",
  clarifications: "In case it's unclear",
};

const SECTION_IDS = Object.keys(SECTION_TITLES) as SummarySection["id"][];

const Sentence = S.obj({ text: S.str(), sources: S.arr(S.str("a passage label such as S3")) });

const SCHEMA = S.obj({
  headline: Sentence,
  sections: S.arr(S.obj({ id: S.enumOf(SECTION_IDS), sentences: S.arr(Sentence) })),
  quotes: S.arr(S.obj({ sourceId: S.str(), text: S.str("copied exactly, under 30 words") })),
});

const SentenceZ = z.object({ text: z.string(), sources: z.array(z.string()) });
const Out = z.object({
  headline: SentenceZ,
  sections: z.array(z.object({ id: z.enum(SECTION_IDS as [SummarySection["id"], ...SummarySection["id"][]]), sentences: z.array(SentenceZ) })),
  quotes: z.array(z.object({ sourceId: z.string(), text: z.string() })),
});

const SYSTEM = `You write the "values summary" card a person will share with their family. It must sound like them and say only what they said.

Rules:
- First person ("I", "my"), warm and plain, about a 6th-grade reading level.
- Every sentence must cite at least one passage label (like S3) that supports it. Do not add wishes, reasons, feelings, or details that are not in the cited passages.
- Headline: one sentence. Each section: at most 2 sentences. If a section has no material, give it an empty sentences list.
- Sections: matters (what matters most), quality (quality of life), treatment (how care should lean), stop (when to stop life-prolonging treatment), clarifications (answers to follow-up questions, if any).
- Never mention how the person wants to hear a diagnosis or prognosis; that is shared separately.
- No medical advice and no clinical jargon the person did not use.
- quotes: pick 2 to 4 short lines, under 30 words each, copied exactly from passages marked (recorded) or (typed) or from clarifications, that would mean the most to family. Cite each quote's passage label.`;

function validateSentence(s: { text: string; sources: string[] }, resolve: (label: string) => Passage | null): SummarySentence | null {
  const sources = [...new Set(s.sources.map((x) => resolve(x)?.sourceId).filter((x): x is string => !!x))];
  const text = stripLabels(s.text.trim().replace(/\s+/g, " "));
  if (!sources.length || !text || soundsLikeAdvice(text)) return null;
  return { text: text.slice(0, 400), sources };
}

export async function aiSummary(passages: Passage[], firstName: string): Promise<SummaryDoc> {
  const labelled = labelPassages(passages);
  const user = `Passages from ${firstName || "the person"}'s plan:\n\n${labelled.block}`;
  const { data, meta } = await generateJson(
    { tier: "smart", system: SYSTEM, user, schemaName: "values_summary", schema: SCHEMA, effort: "medium", maxOutputTokens: 5000 },
    Out,
  );
  const resolve = (label: string) => labelled.resolve(label);
  let dropped = 0;

  const headline = validateSentence(data.headline, resolve);
  if (!headline) dropped++;

  const sections: SummarySection[] = [];
  for (const id of SECTION_IDS) {
    const raw = data.sections.find((s) => s.id === id);
    const sentences: SummarySentence[] = [];
    for (const s of raw?.sentences.slice(0, 3) ?? []) {
      const ok = validateSentence(s, resolve);
      if (ok) sentences.push(ok);
      else dropped++;
    }
    if (sentences.length) sections.push({ id, title: SECTION_TITLES[id], sentences });
  }

  const quotes: Quote[] = [];
  for (const q of data.quotes.slice(0, 4)) {
    const src = labelled.resolve(q.sourceId, q.text);
    const text = src && !src.sourceId.startsWith("answer:") ? exactQuote(q.text, src.text, 0.85) : null;
    if (!src || !text) {
      dropped++;
      continue;
    }
    quotes.push({ text, sourceId: src.sourceId, clipId: src.clipId });
  }

  return {
    generatedAt: new Date().toISOString(),
    generator: "ai",
    model: meta.model,
    headline: headline ?? { text: firstName ? `${firstName}'s wishes, in their own words.` : "My wishes, in my own words.", sources: [] },
    sections,
    quotes,
    droppedCount: dropped,
  };
}

function list(items: string[]): string {
  const lower = items.map((s) => s.charAt(0).toLowerCase() + s.slice(1));
  if (lower.length <= 1) return lower.join("");
  return `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}`;
}

/** Deterministic summary used when AI assistance is off or unavailable. Built only from structured answers. */
export function templateSummary(core: PlanCore): SummaryDoc {
  const a = (id: Answer["promptId"]) => (core.answers[id]?.status === "answered" ? core.answers[id] : undefined);
  const labels = (id: Answer["promptId"]) => {
    const ans = a(id);
    const out = (ans?.selected ?? []).filter((x) => x !== "other" && x !== "none").map((x) => optionLabel(id, x));
    if (ans?.selected?.includes("other") && ans.otherText) out.push(ans.otherText);
    return out;
  };
  const sections: SummarySection[] = [];
  const matters = labels("matters_most");
  if (matters.length) sections.push({ id: "matters", title: SECTION_TITLES.matters, sentences: [{ text: `What matters most to me is ${list(matters)}.`, sources: ["answer:matters_most"] }] });
  const quality = labels("quality_of_life");
  if (quality.length) sections.push({ id: "quality", title: SECTION_TITLES.quality, sentences: [{ text: `If I became seriously ill, what would matter most for my quality of life is ${list(quality)}.`, sources: ["answer:quality_of_life"] }] });
  const spec = a("care_spectrum");
  const stop = spectrumStop(spec?.spectrum ?? null);
  if (spec?.unsure) sections.push({ id: "treatment", title: SECTION_TITLES.treatment, sentences: [{ text: "I am not sure yet how much treatment I would want.", sources: ["answer:care_spectrum"] }] });
  else if (stop) sections.push({ id: "treatment", title: SECTION_TITLES.treatment, sentences: [{ text: `I lean toward "${stop.label}": ${stop.description.charAt(0).toLowerCase()}${stop.description.slice(1)}`, sources: ["answer:care_spectrum"] }] });
  const scen = a("stop_treatment");
  if (scen?.selected?.includes("none")) sections.push({ id: "stop", title: SECTION_TITLES.stop, sentences: [{ text: "None of these situations would make me want to stop; I would want treatment to continue.", sources: ["answer:stop_treatment"] }] });
  else {
    const s = labels("stop_treatment");
    if (s.length) sections.push({ id: "stop", title: SECTION_TITLES.stop, sentences: [{ text: `I would want to stop treatments meant to prolong my life if ${list(s)}.`, sources: ["answer:stop_treatment"] }] });
  }
  const name = core.profile.firstName;
  return {
    generatedAt: new Date().toISOString(),
    generator: "template",
    headline: { text: matters.length ? `What matters most to me is ${list(matters.slice(0, 3))}.` : `${name ? `${name}'s` : "My"} wishes, in my own words.`, sources: matters.length ? ["answer:matters_most"] : [] },
    sections,
    quotes: [],
    droppedCount: 0,
  };
}
