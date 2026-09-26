import { PROMPTS } from "@/lib/content/prompts";
import { requireAgent } from "@/lib/server/agentAuth";
import { json } from "@/lib/server/http";
import { loadDisclosure, requireCore } from "@/lib/server/plans";
import { handler } from "@/lib/server/session";

// What the voice assistant needs to run the conversation: the person's first name and the spec's questions in order, with the
// status of each. The disclosure question is listed (so she can hand it to the screen) but never its answer.
export const GET = handler(async (req: Request) => {
  const planId = requireAgent(req);
  const core = requireCore(planId);
  const disclosure = loadDisclosure(planId);
  return json({
    firstName: core.profile.firstName,
    voiceConsent: !!core.profile.voiceConsentAt,
    questions: PROMPTS.map((p) => ({
      id: p.id,
      kind: p.kind,
      topic: p.eyebrow,
      question: p.question,
      private: p.kind === "disclosure",
      optional: !!p.optional,
      options: p.kind === "disclosure" ? [] : (p.options ?? []).map((o) => ({ id: o.id, label: o.label, exclusive: !!o.exclusive })),
      scale: (p.stops ?? []).map((s) => ({ value: s.value, label: s.label, description: s.description })),
      status: p.kind === "disclosure" ? (disclosure?.status ?? "todo") : (core.answers[p.id]?.status ?? "todo"),
    })),
  });
});
