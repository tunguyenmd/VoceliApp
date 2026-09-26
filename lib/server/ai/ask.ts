import { z } from "zod";
import type { Quote, Transcript } from "@/lib/types";
import { exactQuote, quoteTiming, soundsLikeAdvice, stripLabels } from "@/lib/grounding";
import { generateJson, S } from "./json";
import { labelPassages, type Passage } from "./material";

// "What did Mom say about…?" for family members. The model is a librarian of the person's own words: it finds and
// quotes them, and the app plays the exact moment in the recording. It never predicts or recommends a decision.

const SCHEMA = S.obj({
  status: S.enumOf(["addressed", "related", "not_addressed"]),
  answer: S.str("1-2 plain sentences in the third person that only restate what the person said"),
  citations: S.arr(S.obj({ sourceId: S.str(), quote: S.str("copied exactly from that source") })),
  aboutDisclosure: S.bool("true if the question is about how or whether to share a diagnosis or prognosis with them"),
});

const Out = z.object({
  status: z.enum(["addressed", "related", "not_addressed"]),
  answer: z.string(),
  citations: z.array(z.object({ sourceId: z.string(), quote: z.string() })),
  aboutDisclosure: z.boolean(),
});

function system(name: string) {
  return `You help a family member find what ${name} said in ${name}'s advance care plan. You are a careful librarian of ${name}'s own words, not an advisor.

Rules:
- Use only the passages provided. Quote ${name}'s words exactly, citing the passage label (like S3) each quote comes from.
- "addressed": the passages speak to the question directly. Say so plainly in 1-2 sentences in the third person ("${name} said…").
- "related": nothing answers it directly, but something is close. Say what ${name} did say, and make clear it does not answer the question directly.
- "not_addressed": nothing relates. Say ${name} did not talk about this in the plan.
- If the question names a specific treatment (for example CPR, a breathing machine or ventilator, a feeding tube, dialysis, surgery, antibiotics) and the passages never mention that treatment or an unmistakable equivalent, the status can be at most "related", and the answer must begin by saying ${name} did not mention it specifically.
- Put passage labels only in citations, never in the answer text.
- Never tell the family what to decide, never guess what ${name} "would have wanted" beyond the words, and never give medical advice.
- If the question is about how or whether to tell ${name} about a diagnosis or prognosis, set aboutDisclosure to true.`;
}

export interface AskAnswer {
  status: "addressed" | "related" | "not_addressed";
  answer: string;
  citations: Quote[];
  aboutDisclosure: boolean;
  model?: string;
}

export async function askPlan(input: { question: string; name: string; passages: Passage[]; transcripts: Record<string, Transcript> }): Promise<AskAnswer> {
  const question = input.question.trim().slice(0, 400);
  const labelled = labelPassages(input.passages);
  const user = `Family member's question: "${question}"\n\nPassages from ${input.name}'s plan:\n\n${labelled.block}`;
  const { data, meta } = await generateJson(
    { tier: "fast", system: system(input.name), user, schemaName: "plan_answer", schema: SCHEMA, effort: "low", maxOutputTokens: 2500 },
    Out,
  );

  const citations: Quote[] = [];
  for (const c of data.citations.slice(0, 4)) {
    const src = labelled.resolve(c.sourceId, c.quote);
    const text = src ? exactQuote(c.quote, src.text, 0.8) : null;
    if (!src || !text) continue;
    const q: Quote = { text, sourceId: src.sourceId, clipId: src.clipId };
    if (src.clipId) {
      const timing = quoteTiming(text, input.transcripts[src.clipId]?.words ?? []);
      if (timing) Object.assign(q, timing);
    }
    citations.push(q);
  }

  let status = data.status;
  let answer = stripLabels(data.answer.trim());
  if (status !== "not_addressed" && citations.length === 0) {
    status = "not_addressed";
    answer = `${input.name} did not talk about this directly in the plan.`;
  }
  if (soundsLikeAdvice(answer, "statement")) {
    answer = citations.length
      ? `Here is what ${input.name} said that relates to your question.`
      : `${input.name} did not talk about this directly in the plan.`;
  }
  return { status, answer: answer.slice(0, 500), citations, aboutDisclosure: data.aboutDisclosure, model: meta.model };
}
