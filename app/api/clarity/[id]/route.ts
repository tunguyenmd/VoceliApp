import { z } from "zod";
import type { NextRequest } from "next/server";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

const Body = z.object({
  action: z.enum(["answer", "dismiss", "reopen"]),
  text: z.string().max(2000).optional(),
});

export const POST = handler(async (req: NextRequest, ctx: RouteContext<"/api/clarity/[id]">) => {
  const planId = await requirePlanner();
  const { id } = await ctx.params;
  const body = await parseJson(req, Body);
  const { core } = await mutateCore(planId, (core) => {
    const note = core.clarity.find((n) => n.id === id);
    if (!note) throw new HttpError(404, "Not found");
    if (body.action === "dismiss") note.state = "dismissed";
    else if (body.action === "reopen") note.state = note.response && (note.response.text || note.response.clipIds.length) ? "answered" : "open";
    else {
      const text = body.text?.trim();
      note.response = { text: text || undefined, clipIds: note.response?.clipIds ?? [], answeredAt: new Date().toISOString() };
      note.state = text || note.response.clipIds.length ? "answered" : "open";
    }
  });
  return json({ plan: plannerView(core) });
});
