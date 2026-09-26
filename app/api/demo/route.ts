import { z } from "zod";
import { appendAudit } from "@/lib/server/audit";
import { demoMode } from "@/lib/server/config";
import { seedDemo } from "@/lib/server/demo";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore, requireCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner, setPlannerPlan } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

const Body = z.object({
  action: z.enum(["seed", "advance-year", "reset-clock", "memorial"]),
  stage: z.enum(["answers", "complete"]).optional(),
});

// Presenter tools. Only available when HEARD_DEMO=1.
export const POST = handler(async (req: Request) => {
  if (!demoMode()) throw new HttpError(404, "Not found");
  const body = await parseJson(req, Body);

  if (body.action === "seed") {
    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const { planId, link } = await seedDemo(body.stage ?? "complete", origin);
    await setPlannerPlan(planId);
    return json({ link, plan: plannerView(requireCore(planId)) }, { status: 201 });
  }

  const planId = await requirePlanner();
  if (body.action === "memorial") {
    let on = false;
    await mutateCore(planId, (c) => {
      c.retention.memorialMode = !c.retention.memorialMode;
      on = c.retention.memorialMode;
    });
    appendAudit(planId, "access", {
      actor: { kind: "system" },
      action: on ? "memorial.on" : "memorial.off",
      detail: on ? "Legacy contact confirmed; memorial mode on (demo)" : "Memorial mode off (demo)",
    });
  } else {
    await mutateCore(planId, (c) => {
      c.clockOffsetDays = body.action === "advance-year" ? (c.clockOffsetDays ?? 0) + 366 : 0;
    });
  }
  return json({ plan: plannerView(requireCore(planId)) });
});
