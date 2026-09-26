import type { Answer } from "@/lib/types";
import { clarityCheck } from "@/lib/server/ai/clarity";
import { buildPassages } from "@/lib/server/ai/material";
import { AiUnavailableError, aiEnabled } from "@/lib/server/ai/provider";
import { json } from "@/lib/server/http";
import { mutateCore, requireCore, transcriptsFor } from "@/lib/server/plans";
import { handler, requirePlanner } from "@/lib/server/session";
import { plannerView } from "@/lib/server/views";

// Run the Clarity check over the current answers. Answered or dismissed notes are kept; open ones are replaced.
export const POST = handler(async () => {
  const planId = await requirePlanner();
  const core = requireCore(planId);
  if (!aiEnabled() || !core.profile.aiAssist) return json({ notes: [], plan: plannerView(core), skipped: "ai-off" });

  const answers = Object.values(core.answers).filter((a): a is Answer => !!a);
  const transcripts = transcriptsFor(planId, Object.keys(core.clips));
  const passages = buildPassages(answers, transcripts);
  try {
    const { notes, model, ms } = await clarityCheck(passages, core.profile.firstName);
    const { core: updated } = await mutateCore(planId, (c) => {
      c.clarity = [...c.clarity.filter((n) => n.state !== "open"), ...notes];
      c.clarityCheckedAt = new Date().toISOString();
    });
    return json({ notes, plan: plannerView(updated), model, ms });
  } catch (err) {
    if (err instanceof AiUnavailableError || (err instanceof Error && err.message.startsWith("Model output"))) {
      console.error("[heard] clarity unavailable:", (err as Error).message);
      return json({ notes: [], plan: plannerView(core), skipped: "ai-unavailable" });
    }
    throw err;
  }
});
