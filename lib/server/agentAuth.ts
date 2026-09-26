import { hmac, safeEqual } from "./crypto";
import { HttpError } from "./session";
import { planExists } from "./vault";

// Linh (the LiveKit agent process) calls back into Heard with a short-lived credential scoped to one plan.
// It travels in the agent's job metadata, never through the browser, and expires with the conversation.

export function mintAgentToken(planId: string, ttlSec = 3 * 60 * 60): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = `${planId}.${exp}`;
  return `${body}.${hmac(`agent:${body}`)}`;
}

export function verifyAgentToken(token: string): string | null {
  const [planId, exp, sig] = token.split(".");
  if (!planId || !exp || !sig) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  if (!safeEqual(sig, hmac(`agent:${planId}.${exp}`))) return null;
  return planExists(planId) ? planId : null;
}

export function requireAgent(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  const planId = auth.startsWith("Bearer ") ? verifyAgentToken(auth.slice(7).trim()) : null;
  if (!planId) throw new HttpError(401, "Invalid or expired agent credential");
  return planId;
}
