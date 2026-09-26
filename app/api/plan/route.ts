import { z } from "zod";
import { appendAudit } from "@/lib/server/audit";
import { json, parseJson } from "@/lib/server/http";
import { createPlan, deletePlan, mutateCore, requireCore } from "@/lib/server/plans";
import { clearPlanner, getPlannerPlanId, handler, requirePlanner, setPlannerPlan } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

export const GET = handler(async () => {
  const planId = await getPlannerPlanId();
  if (!planId) return json({ plan: null });
  return json({ plan: plannerView(requireCore(planId)) });
});

const Create = z.object({ firstName: z.string().trim().max(60).optional().default("") });

export const POST = handler(async (req: Request) => {
  const { firstName } = await parseJson(req, Create);
  const core = createPlan(firstName);
  await setPlannerPlan(core.id);
  return json({ plan: plannerView(core) }, { status: 201 });
});

const Patch = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  decisionStyle: z.enum(["self", "family"]).optional(),
  language: z.string().max(12).optional(),
  state: z.string().length(2).optional(),
  aiAssist: z.boolean().optional(),
  transcription: z.boolean().optional(),
  acknowledged: z.literal(true).optional(),
  voiceConsent: z.literal(true).optional(),
  polstPrep: z.record(z.string().max(40), z.string().max(400)).optional(),
  retention: z
    .object({
      onAccountDelete: z.enum(["revoke_all", "keep_shared"]).optional(),
      inactiveYears: z.number().int().min(1).max(10).optional(),
      legacyContact: z.object({ name: z.string().trim().min(1).max(80), contact: z.string().trim().max(120).optional() }).nullable().optional(),
    })
    .optional(),
});

export const PATCH = handler(async (req: Request) => {
  const planId = await requirePlanner();
  const body = await parseJson(req, Patch);
  const { core } = await mutateCore(planId, (core) => {
    const now = new Date().toISOString();
    if (body.firstName) core.profile.firstName = body.firstName;
    if (body.decisionStyle) core.profile.decisionStyle = body.decisionStyle;
    if (body.language) core.profile.language = body.language;
    if (body.state) core.profile.state = body.state.toUpperCase();
    if (body.aiAssist !== undefined) core.profile.aiAssist = body.aiAssist;
    if (body.transcription !== undefined) core.profile.transcription = body.transcription;
    if (body.acknowledged) core.profile.acknowledgedAt = now;
    if (body.voiceConsent) core.profile.voiceConsentAt = now;
    if (body.polstPrep) core.polstPrep = { ...(core.polstPrep ?? {}), ...body.polstPrep };
    if (body.retention) {
      const r = body.retention;
      if (r.onAccountDelete) core.retention.onAccountDelete = r.onAccountDelete;
      if (r.inactiveYears) core.retention.inactiveYears = r.inactiveYears;
      if (r.legacyContact !== undefined) core.retention.legacyContact = r.legacyContact ?? undefined;
    }
  });
  if (body.aiAssist !== undefined || body.transcription !== undefined) {
    appendAudit(planId, "access", {
      actor: { kind: "planner" },
      action: "settings.changed",
      detail: [body.aiAssist !== undefined && `AI assistance ${body.aiAssist ? "on" : "off"}`, body.transcription !== undefined && `transcription ${body.transcription ? "on" : "off"}`].filter(Boolean).join(", "),
    });
  }
  return json({ plan: plannerView(core) });
});

export const DELETE = handler(async () => {
  const planId = await requirePlanner();
  await deletePlan(planId);
  await clearPlanner();
  return json({ ok: true });
});
