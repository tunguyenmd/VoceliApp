import { z } from "zod";
import type { NextRequest } from "next/server";
import { CONSENT_VERSION, familyConsentPoints } from "@/lib/content/copy";
import { appendAudit } from "@/lib/server/audit";
import { sha256Hex } from "@/lib/server/crypto";
import { resolveToken } from "@/lib/server/family";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore } from "@/lib/server/plans";
import { handler, HttpError, setFamilyDevice } from "@/lib/server/session";

const Body = z.object({ typedName: z.string().trim().min(1).max(80), agree: z.literal(true) });

// The family member's own, explicit consent (spec §9, §11.2). Not inherited from the planner's decision to share.
export const POST = handler(async (req: NextRequest, ctx: RouteContext<"/api/family/[token]">) => {
  const { token } = await ctx.params;
  const found = resolveToken(token);
  if (!found) throw new HttpError(404, "This link is not valid");
  if (found.share.status === "revoked") throw new HttpError(403, "Access has been turned off");
  const { typedName } = await parseJson(req, Body);

  const device = await setFamilyDevice(found.share.id);
  const firstName = found.core.profile.firstName || "them";
  const consentHash = sha256Hex(`${CONSENT_VERSION}\n${familyConsentPoints(firstName).join("\n")}`);
  await mutateCore(found.core.id, (core) => {
    const s = core.shares.find((x) => x.id === found.share.id);
    if (!s || s.status === "revoked") throw new HttpError(403, "Access has been turned off");
    s.status = "active";
    s.consents.push({ acceptedAt: new Date().toISOString(), typedName, consentVersion: CONSENT_VERSION, consentHash, device });
    s.lastAccessAt = new Date().toISOString();
  });
  appendAudit(found.core.id, "access", {
    actor: { kind: "family", id: found.share.id, name: found.share.name },
    action: "share.accepted",
    detail: `Consented as "${typedName}" (${CONSENT_VERSION}, ${consentHash.slice(0, 12)}…) on a new device`,
  });
  return json({ ok: true });
});
