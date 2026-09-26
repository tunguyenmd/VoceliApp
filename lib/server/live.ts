// Live conversation with Linh (LiveKit agent + Tavus avatar) configuration.
export const AGENT_NAME = process.env.HEARD_AGENT_NAME || "heard-linh";

export function liveConfigured(): boolean {
  return !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}
