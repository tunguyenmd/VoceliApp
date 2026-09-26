import { json } from "@/lib/server/http";
import { publish, requireCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

// Freeze the current plan as the version family members see.
export const POST = handler(async () => {
  const planId = await requirePlanner();
  const core = requireCore(planId);
  if (core.retention.memorialMode) throw new HttpError(409, "This plan is in memorial mode and can no longer change");
  const version = await publish(planId);
  return json({ version: version.version, plan: plannerView(requireCore(planId)) });
});
