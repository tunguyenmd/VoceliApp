import { z } from "zod";
import type { NextRequest } from "next/server";
import type { PromptId } from "@/lib/types";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { appendAudit } from "@/lib/server/audit";
import { applyAnswer } from "@/lib/server/answers";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore, requireCore, saveDisclosure } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

const Body = z.object({
  status: z.enum(["answered", "skipped"]),
  selected: z.array(z.string().max(40)).max(12).optional(),
  otherText: z.string().max(300).optional(),
  spectrum: z.number().int().min(1).max(5).nullable().optional(),
  unsure: z.boolean().optional(),
  text: z.string().max(4000).optional(),
  choice: z.enum(["tell_all", "tell_diagnosis", "family_first", "dont_tell"]).nullable().optional(),
  who: z.string().max(200).optional(),
});

export const PUT = handler(async (req: NextRequest, ctx: RouteContext<"/api/answers/[promptId]">) => {
  const planId = await requirePlanner();
  const { promptId } = await ctx.params;
  const prompt = PROMPT_BY_ID[promptId as PromptId];
  if (!prompt) throw new HttpError(404, "Unknown question");
  const body = await parseJson(req, Body);
  const now = new Date().toISOString();

  if (prompt.kind === "disclosure") {
    await saveDisclosure(planId, (cur) => ({
      ...cur,
      status: body.status,
      choice: body.choice ?? undefined,
      unsure: body.unsure,
      who: body.who?.trim() || undefined,
      text: body.text?.trim() || undefined,
      updatedAt: now,
    }));
    appendAudit(planId, "disclosure", { actor: { kind: "planner" }, action: body.status === "skipped" ? "disclosure.skipped" : "disclosure.updated" });
    return json({ plan: plannerView(requireCore(planId)) });
  }

  const { core } = await mutateCore(planId, (core) => applyAnswer(core, prompt, { ...body, text: body.text ?? "" }));
  return json({ plan: plannerView(core) });
});
