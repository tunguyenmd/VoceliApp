import type { NextRequest } from "next/server";
import { disclosureLabel } from "@/lib/content/prompts";
import { familyAudit, requireFamily } from "@/lib/server/family";
import { json } from "@/lib/server/http";
import { latestPublished } from "@/lib/server/plans";
import { handler, HttpError } from "@/lib/server/session";
import { publishedDisclosure } from "@/lib/server/views";

// Deliberate reveal of the diagnosis/prognosis disclosure preference. Every read goes to its own access log.
export const POST = handler(async (_req: NextRequest, ctx: RouteContext<"/api/share-access/[shareId]/disclosure">) => {
  const { shareId } = await ctx.params;
  const fam = await requireFamily(shareId);
  if (!fam.share.scopes.disclosure) throw new HttpError(403, "Not shared with you");
  const published = latestPublished(fam.core);
  const pref = published ? publishedDisclosure(fam.core.id, published.version) : null;
  if (!pref) throw new HttpError(404, "Not available");
  familyAudit(fam, "disclosure", "disclosure.viewed", `version ${published!.version}`, "Opened the diagnosis and prognosis preference");
  const label = disclosureLabel(pref.choice);
  return json({
    choice: pref.choice ?? null,
    label: label?.label ?? null,
    description: label?.description ?? null,
    unsure: !!pref.unsure,
    who: pref.who ?? null,
    text: pref.text ?? null,
    clipIds: pref.clipIds,
  });
});
