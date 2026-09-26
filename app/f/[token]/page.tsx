import type { Metadata } from "next";
import { CONSENT_VERSION, familyConsentPoints } from "@/lib/content/copy";
import { appendAudit } from "@/lib/server/audit";
import { aiEnabled } from "@/lib/server/ai/provider";
import { resolveToken, shouldLogPlay } from "@/lib/server/family";
import { getFamilyDevice } from "@/lib/server/session";
import { familyView } from "@/lib/server/views";
import { FamilyConsent } from "@/components/family/FamilyConsent";
import { FamilyPlan } from "@/components/family/FamilyPlan";
import { FamilyShell } from "@/components/family/FamilyShell";

export const metadata: Metadata = { title: "Care wishes, shared with you", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function FamilyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = resolveToken(token);

  if (!found) {
    return (
      <FamilyShell>
        <div className="card p-8 text-center">
          <h1 className="font-display text-3xl">This link isn&rsquo;t working.</h1>
          <p className="mt-3 text-ink-soft">It may have been typed incorrectly, or the plan may no longer exist. Please ask the person who shared it for a new link.</p>
        </div>
      </FamilyShell>
    );
  }

  const { core, share } = found;
  const firstName = core.profile.firstName || "Someone";

  if (share.status === "revoked") {
    return (
      <FamilyShell>
        <div className="card p-8 text-center">
          <h1 className="font-display text-3xl">Access has been turned off.</h1>
          <p className="mt-3 text-ink-soft">{firstName} has turned off access to this plan. If you think this is a mistake, please talk with them.</p>
        </div>
      </FamilyShell>
    );
  }

  const device = await getFamilyDevice(share.id);
  if (!device || share.status !== "active") {
    return (
      <FamilyShell>
        <FamilyConsent token={token} firstName={firstName} recipient={share.name} points={familyConsentPoints(firstName)} version={CONSENT_VERSION} />
      </FamilyShell>
    );
  }

  const view = familyView(core, share);
  if (shouldLogPlay(share.id, "view")) {
    appendAudit(core.id, "access", { actor: { kind: "family", id: share.id, name: share.name }, action: "plan.viewed", detail: "Opened the shared plan" });
  }
  return (
    <FamilyShell memorial={view.memorial}>
      <FamilyPlan view={view} firstName={firstName} canAsk={aiEnabled()} />
    </FamilyShell>
  );
}
