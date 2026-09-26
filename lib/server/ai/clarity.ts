import { z } from "zod";
import type { ClarityNote, PromptId, Quote } from "@/lib/types";
import { PROMPTS } from "@/lib/content/prompts";
import { exactQuote, soundsLikeAdvice, stripLabels } from "@/lib/grounding";
import { randomId } from "../crypto";
import { generateJson, S } from "./json";
import { labelPassages, type Passage } from "./material";

// Clarity check: before sharing, find places where a loving family member could be left unsure what the person
// meant. Advance directives often fail at the bedside because they are vague; this is the fix, done gently.

const PROMPT_IDS = PROMPTS.filter((p) => p.id !== "disclosure").map((p) => p.id);

const SCHEMA = S.obj({
  notes: S.arr(
    S.obj({
      kind: S.enumOf(["tension", "unclear"]),
      title: S.str("at most 8 words"),
      body: S.str("1-2 gentle sentences explaining why family might be unsure"),
      followUp: S.str("one question the person can answer to clear it up"),
      promptIds: S.arr(S.enumOf(PROMPT_IDS)),
      quotes: S.arr(S.obj({ sourceId: S.str(), text: S.str("copied exactly from that source") })),
    }),
  ),
});

const Out = z.object({
  notes: z.array(
    z.object({
      kind: z.enum(["tension", "unclear"]),
      title: z.string(),
      body: z.string(),
      followUp: z.string(),
      promptIds: z.array(z.string()),
      quotes: z.array(z.object({ sourceId: z.string(), text: z.string() })),
    }),
  ),
});

const SYSTEM = `You review a person's advance care planning answers the way a thoughtful palliative care clinician would before a family meeting. You look for places where a loving family member could be left unsure what the person meant.

Return at most 3 notes, of two kinds:
- "tension": two answers that could seem to point in different directions (for example choosing "Try everything" and also wanting to stop if kept alive by machines). Say gently that both can be true, and ask one question that would help the family understand how the person weighs them.
- "unclear": a phrase different family members might read differently (for example "I don't want to be a vegetable" or "don't let me suffer"). Ask what it would look like in practice.

Rules:
- Never comment on skipped or unanswered questions. Skipping is always fine.
- Never judge the person's values or suggest what they should choose. No medical advice, no statistics, no predictions.
- Warm, plain language at about a 6th-grade reading level. Speak to the person as "you".
- Each note needs 1 or 2 supporting quotes copied word-for-word from the passages, each with the label (like S3) of the passage it came from.
- If nothing is genuinely unclear, return an empty list. Do not invent problems to be helpful.`;

export async function clarityCheck(passages: Passage[], firstName: string): Promise<{ notes: ClarityNote[]; model: string; ms: number }> {
  if (!passages.length) return { notes: [], model: "", ms: 0 };
  const labelled = labelPassages(passages);
  const user = `Answers from ${firstName || "the person"}:\n\n${labelled.block}`;
  const { data, meta } = await generateJson(
    { tier: "smart", system: SYSTEM, user, schemaName: "clarity_notes", schema: SCHEMA, effort: "medium", maxOutputTokens: 5000 },
    Out,
  );

  const now = new Date().toISOString();
  const notes: ClarityNote[] = [];
  for (const n of data.notes.slice(0, 3)) {
    const quotes: Quote[] = [];
    for (const q of n.quotes) {
      const src = labelled.resolve(q.sourceId, q.text);
      const text = src ? exactQuote(q.text, src.text, 0.8) : null;
      if (src && text) quotes.push({ text, sourceId: src.sourceId, clipId: src.clipId });
    }
    if (!quotes.length) continue; // ungrounded note: drop it
    if (soundsLikeAdvice(`${n.body} ${n.followUp}`, "question")) continue;
    const promptIds = [...new Set(n.promptIds.filter((id): id is PromptId => PROMPT_IDS.includes(id as PromptId)))];
    notes.push({
      id: randomId(9),
      kind: n.kind,
      title: stripLabels(n.title).slice(0, 80),
      body: stripLabels(n.body).slice(0, 400),
      followUp: stripLabels(n.followUp).slice(0, 300),
      promptIds,
      quotes,
      state: "open",
      createdAt: now,
    });
  }
  return { notes, model: meta.model, ms: meta.ms };
}
