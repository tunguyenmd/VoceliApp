import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { AccessToken } from "livekit-server-sdk";
import { PROMPTS } from "@/lib/content/prompts";
import { mintAgentToken } from "@/lib/server/agentAuth";
import { mobileFlow } from "@/lib/server/config";
import { randomId } from "@/lib/server/crypto";
import { json } from "@/lib/server/http";
import { AGENT_NAME, liveConfigured } from "@/lib/server/live";
import { requireCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";

// Join token for a live conversation with the voice assistant. Each conversation gets a fresh room, and the token
// dispatches the agent explicitly with a plan-scoped credential in its job metadata (never exposed to the browser).
// The mobile app ("guide" mode) asks the questions of its flow (HEARD_MOBILE_FLOW); the desktop page may pass a focus.
export const POST = handler(async (req: Request) => {
  const planId = await requirePlanner();
  // Optional short-demo path: only these question ids, in the spec's order.
  const body = (await req.json().catch(() => ({}))) as { focus?: unknown; mode?: unknown };
  const mode = body.mode === "guide" ? "guide" : "conversation";
  const asked = Array.isArray(body.focus) ? body.focus.filter((id): id is string => typeof id === "string" && PROMPTS.some((p) => p.id === id)) : undefined;
  const focus = mode === "guide" && !asked?.length ? mobileFlow() : asked;
  const core = requireCore(planId);
  if (!liveConfigured()) throw new HttpError(503, "Live conversation isn't configured on this server");

  const room = `heard-${randomId(6)}`;
  const metadata = JSON.stringify({
    agentToken: mintAgentToken(planId),
    backendUrl: process.env.HEARD_AGENT_BACKEND_URL || "http://127.0.0.1:3120",
    firstName: core.profile.firstName,
    focus: focus?.length ? focus : undefined,
    mode,
  });
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: `planner-${randomId(4)}`,
    name: core.profile.firstName || "You",
    ttl: "2h",
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  at.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: AGENT_NAME, metadata })] });
  return json({ serverUrl: process.env.LIVEKIT_URL, participantToken: await at.toJwt(), room });
});
