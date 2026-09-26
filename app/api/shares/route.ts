import { z } from "zod";
import { json, parseJson } from "@/lib/server/http";
import { createShare, publish, requireCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  relationship: z.string().trim().min(1).max(60),
  contact: z.string().trim().max(120).optional(),
  scopes: z.object({ summary: z.boolean(), recordings: z.boolean(), message: z.boolean(), disclosure: z.boolean() }),
  acknowledgedNoRetract: z.literal(true),
});

// Invite a family member. The link token is shown once and only its SHA-256 hash is stored.
export const POST = handler(async (req: Request) => {
  const planId = await requirePlanner();
  const body = await parseJson(req, Body);
  if (!Object.values(body.scopes).some(Boolean)) throw new HttpError(400, "Choose at least one thing to share");
  // The first invite freezes version 1, so there is always a published version for family to open.
  if (!requireCore(planId).versions.length) await publish(planId);
  const { share, token } = await createShare(planId, body);
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  return json({ shareId: share.id, link: `${origin}/f/${token}`, plan: plannerView(requireCore(planId)) }, { status: 201 });
});
