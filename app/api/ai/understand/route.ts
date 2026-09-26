import { z } from "zod";
import type { PromptId } from "@/lib/types";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { AiUnavailableError, aiEnabled } from "@/lib/server/ai/provider";
import { understand } from "@/lib/server/ai/understand";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore, readTranscript, requireCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

const Body = z.union([
  z.object({ clipId: z.string().min(6).max(64) }),
  z.object({ promptId: z.string().max(40), text: z.string().min(1).max(4000) }),
]);

// Find worksheet options the person's own words already express, as suggestions they confirm.
export const POST = handler(async (req: Request) => {
  const planId = await requirePlanner();
  const core = requireCore(planId);
  if (!aiEnabled() || !core.profile.aiAssist) return json({ suggestions: [], distress: false, plan: plannerView(core), skipped: "ai-off" });

  const body = await parseJson(req, Body);
  let words: string;
  let sourcePromptId: PromptId | "clarification";
  let question: string;
  let sourceClipId: string | undefined;

  if ("clipId" in body) {
    const clip = core.clips[body.clipId];
    if (!clip || clip.owner === "disclosure") throw new HttpError(404, "Recording not found");
    const t = readTranscript(planId, body.clipId);
    if (!t) return json({ suggestions: [], distress: false, plan: plannerView(core), skipped: "no-transcript" });
    words = t.text;
    sourcePromptId = clip.owner;
    sourceClipId = clip.id;
    question = clip.owner === "clarification" ? core.clarity.find((n) => n.id === clip.clarificationId)?.followUp ?? "" : PROMPT_BY_ID[clip.owner].question;
  } else {
    const prompt = PROMPT_BY_ID[body.promptId as PromptId];
    if (!prompt || prompt.kind === "disclosure") throw new HttpError(400, "Unknown question");
    words = body.text;
    sourcePromptId = prompt.id;
    question = prompt.question;
  }

  try {
    const result = await understand({ core, sourcePromptId, question, words, sourceClipId });
    const { core: updated } = await mutateCore(planId, (c) => {
      c.suggestions.push(...result.suggestions);
    });
    return json({ suggestions: result.suggestions, distress: result.distress, plan: plannerView(updated), model: result.model, ms: result.ms });
  } catch (err) {
    if (err instanceof AiUnavailableError || (err instanceof Error && err.message.startsWith("Model output"))) {
      console.error("[heard] understand unavailable:", (err as Error).message);
      return json({ suggestions: [], distress: false, plan: plannerView(core), skipped: "ai-unavailable" });
    }
    throw err;
  }
});
