import { readLog, verifyLog } from "@/lib/server/audit";
import { json } from "@/lib/server/http";
import { handler, requirePlanner } from "@/lib/server/session";
import { rawPreview } from "@/lib/server/vault";

// The planner's view of who accessed what and when, with a tamper check over each hash chain.
export const GET = handler(async () => {
  const planId = await requirePlanner();
  return json({
    access: readLog(planId, "access").reverse(),
    disclosure: readLog(planId, "disclosure").reverse(),
    status: { access: verifyLog(planId, "access"), disclosure: verifyLog(planId, "disclosure") },
    atRest: { core: rawPreview(planId, "core"), disclosure: rawPreview(planId, "disclosure") },
  });
});
