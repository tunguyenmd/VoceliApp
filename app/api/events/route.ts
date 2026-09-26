import { z } from "zod";
import { json, parseJson } from "@/lib/server/http";
import { addLifeEvent, mutateCore } from "@/lib/server/plans";
import { handler, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

const Body = z.object({
  type: z.enum(["diagnosis", "hospitalization", "birth", "death", "relationship", "move", "other"]),
  note: z.string().trim().max(280).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Logging a major life event makes the plan due for review now instead of at the annual check-in (spec §7).
export const POST = handler(async (req: Request) => {
  const planId = await requirePlanner();
  const body = await parseJson(req, Body);
  const { core, result } = await mutateCore(planId, (core) => addLifeEvent(core, body));
  return json({ event: result, plan: plannerView(core) }, { status: 201 });
});
