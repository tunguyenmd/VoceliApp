import { z } from "zod";
import type { NextRequest } from "next/server";
import { appendAudit } from "@/lib/server/audit";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore, scopeText } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

// Revoke: the family member's link and device stop working immediately. What they already saved stays with them,
// which the planner was told when sharing (spec §9, §11.2).
export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/shares/[id]">) => {
  const planId = await requirePlanner();
  const { id } = await ctx.params;
  let name = "";
  const { core } = await mutateCore(planId, (core) => {
    const s = core.shares.find((x) => x.id === id);
    if (!s) throw new HttpError(404, "Not found");
    if (s.status === "revoked") return;
    s.status = "revoked";
    s.revokedAt = new Date().toISOString();
    name = s.name;
  });
  if (name) appendAudit(planId, "access", { actor: { kind: "planner" }, action: "share.revoked", resource: `share ${id}`, detail: `Turned off ${name}'s access` });
  return json({ plan: plannerView(core) });
});

const Patch = z.object({ scopes: z.object({ summary: z.boolean(), recordings: z.boolean(), message: z.boolean(), disclosure: z.boolean() }) });

// Granular sharing: change exactly what one person can see.
export const PATCH = handler(async (req: NextRequest, ctx: RouteContext<"/api/shares/[id]">) => {
  const planId = await requirePlanner();
  const { id } = await ctx.params;
  const { scopes } = await parseJson(req, Patch);
  let name = "";
  const { core } = await mutateCore(planId, (core) => {
    const s = core.shares.find((x) => x.id === id);
    if (!s || s.status === "revoked") throw new HttpError(404, "Not found");
    s.scopes = scopes;
    name = s.name;
  });
  appendAudit(planId, "access", { actor: { kind: "planner" }, action: "share.changed", resource: `share ${id}`, detail: `${name} can now see: ${scopeText(scopes)}` });
  return json({ plan: plannerView(core) });
});
