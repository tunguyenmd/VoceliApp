import { z } from "zod";
import type { Answer, SummaryDoc } from "@/lib/types";
import { quoteTiming } from "@/lib/grounding";
import { buildPassages } from "@/lib/server/ai/material";
import { AiUnavailableError, aiEnabled } from "@/lib/server/ai/provider";
import { aiSummary, templateSummary } from "@/lib/server/ai/summary";
import { json, parseJson } from "@/lib/server/http";
import { mutateCore, readTranscript, requireCore, transcriptsFor } from "@/lib/server/plans";
import { handler, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

// Draft the values summary card. AI when enabled (every sentence cited), otherwise a deterministic template.
export const POST = handler(async () => {
  const planId = await requirePlanner();
  const core = requireCore(planId);
  let summary: SummaryDoc;
  let fallback: string | undefined;
  if (aiEnabled() && core.profile.aiAssist) {
    const answers = Object.values(core.answers).filter((a): a is Answer => !!a);
    const passages = buildPassages(answers, transcriptsFor(planId, Object.keys(core.clips)), { clarity: core.clarity });
    try {
      summary = await aiSummary(passages, core.profile.firstName);
      if (!summary.sections.length) {
        summary = templateSummary(core);
        fallback = "empty";
      }
    } catch (err) {
      if (!(err instanceof AiUnavailableError) && !(err instanceof Error && err.message.startsWith("Model output"))) throw err;
      console.error("[heard] summary fell back to template:", (err as Error).message);
      summary = templateSummary(core);
      fallback = "ai-unavailable";
    }
  } else {
    summary = templateSummary(core);
  }
  // Attach timings so "In my own words" plays exactly the quoted line from the recording.
  for (const q of summary.quotes) {
    if (!q.clipId) continue;
    const timing = quoteTiming(q.text, readTranscript(planId, q.clipId)?.words ?? []);
    if (timing) Object.assign(q, timing);
  }
  const { core: updated } = await mutateCore(planId, (c) => {
    c.summary = summary;
  });
  return json({ summary, fallback, plan: plannerView(updated) });
});

const Edit = z.object({
  approve: z.boolean().optional(),
  headline: z.string().trim().min(1).max(400).optional(),
  sentences: z.array(z.object({ section: z.string(), index: z.number().int().min(0), text: z.string().trim().max(400) })).max(20).optional(),
});

// The person edits and approves their card; edits are theirs, so they carry no AI citations requirement.
export const PATCH = handler(async (req: Request) => {
  const planId = await requirePlanner();
  const body = await parseJson(req, Edit);
  const { core } = await mutateCore(planId, (c) => {
    if (!c.summary) return;
    if (body.headline && body.headline !== c.summary.headline.text) {
      c.summary.headline = { ...c.summary.headline, text: body.headline };
      c.summary.editedByUser = true;
    }
    for (const e of body.sentences ?? []) {
      const section = c.summary.sections.find((s) => s.id === e.section);
      const sentence = section?.sentences[e.index];
      if (!section || !sentence || sentence.text === e.text) continue;
      if (e.text) sentence.text = e.text;
      else section.sentences.splice(e.index, 1);
      c.summary.editedByUser = true;
    }
    c.summary.sections = c.summary.sections.filter((s) => s.sentences.length);
    if (body.approve !== undefined) c.summary.approvedAt = body.approve ? new Date().toISOString() : undefined;
  });
  return json({ plan: plannerView(core) });
});
