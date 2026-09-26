import { cookies } from "next/headers";
import { hmac, randomId, safeEqual } from "./crypto";
import { planExists } from "./vault";

// Signed, HttpOnly cookies. The planner cookie names their plan; each family cookie binds one device to one share
// after that person has given their own consent.

const PLANNER = "heard_p";
const YEAR = 60 * 60 * 24 * 365;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.HEARD_SECURE_COOKIES === "1",
    path: "/",
    maxAge,
  };
}

export async function getPlannerPlanId(): Promise<string | null> {
  const raw = (await cookies()).get(PLANNER)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || !sig || !safeEqual(sig, hmac(`p:${id}`))) return null;
  return planExists(id) ? id : null;
}

export async function setPlannerPlan(planId: string) {
  (await cookies()).set(PLANNER, `${planId}.${hmac(`p:${planId}`)}`, cookieOptions(YEAR));
}

export async function clearPlanner() {
  (await cookies()).delete(PLANNER);
}

function familyCookieName(shareId: string) {
  return `heard_f_${shareId}`;
}

export async function getFamilyDevice(shareId: string): Promise<string | null> {
  const raw = (await cookies()).get(familyCookieName(shareId))?.value;
  if (!raw) return null;
  const [device, sig] = raw.split(".");
  if (!device || !sig || !safeEqual(sig, hmac(`f:${shareId}:${device}`))) return null;
  return device;
}

export async function setFamilyDevice(shareId: string): Promise<string> {
  const device = randomId(9);
  (await cookies()).set(familyCookieName(shareId), `${device}.${hmac(`f:${shareId}:${device}`)}`, cookieOptions(YEAR));
  return device;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requirePlanner(): Promise<string> {
  const id = await getPlannerPlanId();
  if (!id) throw new HttpError(401, "No plan for this browser yet");
  return id;
}

/** Route-handler wrapper: turns thrown HttpErrors into JSON responses and hides internal errors. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof Error && err.name === "NotFoundError") return Response.json({ error: err.message }, { status: 404 });
      // Never log request bodies or plan content: only the error class and message.
      console.error("[heard] route error:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
