import { z } from "zod";
import type { PromptId } from "@/lib/types";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { requireAgent } from "@/lib/server/agentAuth";
import { applyAnswer, mergeSelection } from "@/lib/server/answers";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore } from "@/lib/server/plans";
import { handler, HttpError } from "@/lib/server/session";

const Body = z.object({
  questionId: z.string().max(40),
  status: z.enum(["answered", "skipped"]),
  optionIds: z.array(z.string().max(40)).max(12).optional(),
  otherText: z.string().max(300).optional(),
  treatmentLevel: z.number().int().min(1).max(5).nullable().optional(),
  notSure: z.boolean().optional(),
  words: z.string().max(4000).optional(),
  /** Mobile app: add to what the person already tapped on screen instead of replacing it. */
  merge: z.boolean().optional(),
});

// Linh saves the structured part of an answer (the options the person's words express). Their spoken words are
// saved separately as a recording by /api/agent/clip. The disclosure preference can only be set on screen.
export const POST = handler(async (req: Request) => {
  const planId = requireAgent(req);
  const body = await parseJson(req, Body);
  const prompt = PROMPT_BY_ID[body.questionId as PromptId];
  if (!prompt) throw new HttpError(404, `Unknown question ${body.questionId}`);
  if (prompt.kind === "disclosure") throw new HttpError(403, "The disclosure preference is private: it is answered on screen, never by the agent");
  const multi = prompt.kind === "chips" || prompt.kind === "scenarios";
  // When merging, an unclear spoken answer never clears a slider the person already set.
  const keepSpectrum = body.merge && body.treatmentLevel == null && !body.notSure;
  const { core } = await mutateCore(planId, (c) =>
    applyAnswer(c, prompt, {
      status: body.status,
      selected:
        body.status === "answered" && multi ? (body.merge ? mergeSelection(prompt, c.answers[prompt.id]?.selected, body.optionIds) : (body.optionIds ?? [])) : undefined,
      otherText: body.otherText,
      spectrum: prompt.kind === "spectrum" && body.status === "answered" && !keepSpectrum ? (body.treatmentLevel ?? null) : undefined,
      unsure: prompt.kind === "spectrum" && !keepSpectrum ? body.notSure : undefined,
      // Words are only kept as text when no recording could be captured (see the clip route).
      text: body.words,
    }),
  );
  const a = core.answers[prompt.id]!;
  return json({ ok: true, saved: { questionId: prompt.id, status: a.status, optionIds: a.selected ?? [], treatmentLevel: a.spectrum ?? null } });
});
