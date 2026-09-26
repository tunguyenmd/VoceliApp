import { z } from "zod";
import type { ClipOwner, PlanCore, PromptId, SpectrumValue, Suggestion } from "@/lib/types";
import { PROMPT_BY_ID, STRUCTURED_PROMPT_IDS } from "@/lib/content/prompts";
import { exactQuote } from "@/lib/grounding";
import { randomId } from "../crypto";
import { generateJson, S } from "./json";

// "Speak naturally, we'll fill in the form": after someone records or types, find worksheet options their own
// words already express. Everything is a suggestion the person confirms or dismisses; nothing is selected for them.

const OPTION_KEYS: string[] = STRUCTURED_PROMPT_IDS.flatMap((pid) =>
  (PROMPT_BY_ID[pid].options ?? []).filter((o) => !o.isOther).map((o) => `${pid}:${o.id}`),
);

const SCHEMA = S.obj({
  options: S.arr(
    S.obj({
      option: S.enumOf(OPTION_KEYS, "promptId:optionId of an option the words clearly express"),
      quote: S.str("5-25 words copied exactly from the person's words"),
    }),
  ),
  spectrumValue: S.nullable(S.int("1-5, only if they clearly described how much treatment they would want")),
  spectrumQuote: S.nullable(S.str("exact words supporting spectrumValue")),
  distress: S.bool("true only for a present wish to harm themselves or end their life now"),
});

const Out = z.object({
  options: z.array(z.object({ option: z.string(), quote: z.string() })),
  spectrumValue: z.number().int().min(1).max(5).nullable(),
  spectrumQuote: z.string().nullable(),
  distress: z.boolean(),
});

const SYSTEM = `You help a person fill in an advance care planning worksheet by noticing when their own spoken or written words already express one of the worksheet's listed options.

Rules:
- Only suggest an option when the person's words clearly express it. When in doubt, leave it out. An empty list is a good answer.
- Every suggestion needs a quote of 5 to 25 words copied word-for-word from the person's words. Do not paraphrase, correct grammar, or stitch sentences together.
- Do not infer medical facts, diagnoses, or wishes the person did not state. Do not give advice.
- Suggest a treatment-spectrum value only if the person clearly describes how much treatment they would want (1 = try everything, 5 = comfort-focused).
- If they say they would never want life-prolonging treatment stopped, that is stop_treatment:none.
- "distress" is true only if the person expresses a present wish to harm themselves or end their life now, or an acute crisis. Calmly discussing death, dying, or stopping treatment in the future is normal here and is NOT distress.`;

function optionsBlock(): string {
  return STRUCTURED_PROMPT_IDS.map((pid) => {
    const p = PROMPT_BY_ID[pid];
    if (p.kind === "spectrum") {
      return `care_spectrum — ${p.question}\n${p.stops!.map((s) => `  ${s.value} = ${s.label}: ${s.description}`).join("\n")}`;
    }
    return `${pid} — ${p.question}\n${p.options!.filter((o) => !o.isOther).map((o) => `  ${pid}:${o.id} = ${o.label}`).join("\n")}`;
  }).join("\n\n");
}

export interface UnderstandResult {
  suggestions: Suggestion[];
  distress: boolean;
  /** Model proposals removed because their quote could not be found in the person's words. */
  ungrounded?: number;
  model?: string;
  ms?: number;
}

export async function understand(input: {
  core: PlanCore;
  sourcePromptId: ClipOwner;
  question: string;
  words: string;
  sourceClipId?: string;
}): Promise<UnderstandResult> {
  const words = input.words.trim();
  if (words.split(/\s+/).length < 4) return { suggestions: [], distress: false };

  const user = `Question they were answering: "${input.question}"

Their words:
"""
${words}
"""

Worksheet options you may suggest:
${optionsBlock()}`;

  const { data, meta } = await generateJson(
    { tier: "fast", system: SYSTEM, user, schemaName: "worksheet_suggestions", schema: SCHEMA, effort: "low", maxOutputTokens: 2500 },
    Out,
  );

  const now = new Date().toISOString();
  const already = (pid: PromptId, optionId: string) =>
    input.core.answers[pid]?.selected?.includes(optionId) ||
    input.core.suggestions.some((s) => s.targetPromptId === pid && s.optionId === optionId && s.state !== "dismissed");

  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  let ungrounded = 0;
  for (const o of data.options) {
    if (!OPTION_KEYS.includes(o.option) || seen.has(o.option)) continue;
    const quote = exactQuote(o.quote, words, 0.8);
    if (!quote) {
      ungrounded++; // grounding: the quote must really be theirs, and we show their exact words
      continue;
    }
    const [pid, optionId] = o.option.split(":") as [PromptId, string];
    seen.add(o.option);
    if (already(pid, optionId)) continue;
    suggestions.push({
      id: randomId(9),
      targetPromptId: pid,
      kind: "option",
      optionId,
      quote,
      sourcePromptId: input.sourcePromptId,
      sourceClipId: input.sourceClipId,
      state: "pending",
      createdAt: now,
    });
  }

  // How much treatment someone wants is too nuanced to infer from other answers, so a spectrum suggestion is only
  // offered from what they said while answering that question itself.
  if (data.spectrumValue && data.spectrumQuote && input.sourcePromptId === "care_spectrum") {
    const quote = exactQuote(data.spectrumQuote, words, 0.8);
    const current = input.core.answers.care_spectrum?.spectrum;
    if (quote && current !== data.spectrumValue) {
      suggestions.push({
        id: randomId(9),
        targetPromptId: "care_spectrum",
        kind: "spectrum",
        value: data.spectrumValue as SpectrumValue,
        quote,
        sourcePromptId: input.sourcePromptId,
        sourceClipId: input.sourceClipId,
        state: "pending",
        createdAt: now,
      });
    }
  }

  return { suggestions, distress: data.distress, ungrounded, model: meta.model, ms: meta.ms };
}
