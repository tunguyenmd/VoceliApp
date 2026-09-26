import { z } from "zod";
import type { NextRequest } from "next/server";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

const Body = z.object({ action: z.enum(["accept", "dismiss"]) });

// The person stays in control: a suggestion only changes an answer when they accept it.
export const POST = handler(async (req: NextRequest, ctx: RouteContext<"/api/suggestions/[id]">) => {
  const planId = await requirePlanner();
  const { id } = await ctx.params;
  const { action } = await parseJson(req, Body);
  const { core } = await mutateCore(planId, (core) => {
    const s = core.suggestions.find((x) => x.id === id);
    if (!s) throw new HttpError(404, "Suggestion not found");
    if (s.state !== "pending") return;
    s.state = action === "accept" ? "accepted" : "dismissed";
    if (action !== "accept") return;
    const now = new Date().toISOString();
    const existing = core.answers[s.targetPromptId];
    if (s.kind === "option" && s.optionId) {
      let selected = existing?.selected ?? [];
      // "None of these" is exclusive; accepting it replaces other scenario choices and vice versa.
      if (s.optionId === "none") selected = ["none"];
      else selected = [...selected.filter((x) => x !== "none" && x !== s.optionId), s.optionId];
      core.answers[s.targetPromptId] = {
        promptId: s.targetPromptId,
        status: "answered",
        selected,
        otherText: existing?.otherText,
        text: existing?.text,
        clipIds: existing?.clipIds ?? [],
        updatedAt: now,
      };
    } else if (s.kind === "spectrum" && s.value) {
      core.answers.care_spectrum = {
        promptId: "care_spectrum",
        status: "answered",
        spectrum: s.value,
        unsure: false,
        text: existing?.text,
        clipIds: existing?.clipIds ?? [],
        updatedAt: now,
      };
      for (const other of core.suggestions) if (other !== s && other.kind === "spectrum" && other.state === "pending") other.state = "dismissed";
    }
  });
  return json({ plan: plannerView(core) });
});
