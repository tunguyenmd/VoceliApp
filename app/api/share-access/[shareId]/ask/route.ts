import { z } from "zod";
import type { NextRequest } from "next/server";
import { askPlan } from "@/lib/server/ai/ask";
import { buildPassages } from "@/lib/server/ai/material";
import { AiUnavailableError, aiEnabled } from "@/lib/server/ai/provider";
import { familyAudit, requireFamily } from "@/lib/server/family";
import { json, parseJson } from "@/lib/server/http";
import { transcriptsFor } from "@/lib/server/plans";
import { handler, HttpError } from "@/lib/server/session";
import { familyView } from "@/lib/server/views";

const Body = z.object({ question: z.string().trim().min(3).max(400) });

// "What did they say about…?" answered only from what this family member is allowed to see.
export const POST = handler(async (req: NextRequest, ctx: RouteContext<"/api/share-access/[shareId]/ask">) => {
  const { shareId } = await ctx.params;
  const fam = await requireFamily(shareId);
  if (!aiEnabled()) throw new HttpError(503, "Search is not available right now");
  const { question } = await parseJson(req, Body);
  const view = familyView(fam.core, fam.share);
  if (!view.plan) throw new HttpError(404, "Nothing has been shared yet");

  const clipIds = view.plan.clips.map((c) => c.id);
  const transcripts = transcriptsFor(fam.core.id, clipIds);
  const clarity = fam.core.clarity.filter((n) => view.plan!.clarifications.some((c) => c.noteId === n.id));
  const passages = buildPassages(view.plan.answers, transcripts, { clarity, includeFamilyMessage: fam.share.scopes.message }).filter(
    (p) => !p.sourceId.startsWith("answer:") || fam.share.scopes.summary || fam.share.scopes.recordings,
  );
  const name = fam.core.profile.firstName || "They";
  try {
    const answer = await askPlan({ question, name, passages, transcripts });
    // Log that a question was asked and how many passages were cited, not the question itself.
    familyAudit(fam, "access", "plan.asked", undefined, `Searched the plan (${answer.status.replace("_", " ")}, ${answer.citations.length} passage${answer.citations.length === 1 ? "" : "s"} cited)`);
    return json(answer);
  } catch (err) {
    if (err instanceof AiUnavailableError || (err instanceof Error && err.message.startsWith("Model output"))) {
      console.error("[heard] ask unavailable:", (err as Error).message);
      throw new HttpError(503, "Search is not available right now");
    }
    throw err;
  }
});
