import type { NextRequest } from "next/server";
import { json } from "@/lib/server/http";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { cancelLiveSession, pushAudio } from "@/lib/server/stt/transcribe";

const MAX_CHUNK = 512 * 1024;

// Body: raw 16 kHz mono little-endian PCM. Returns the live caption so far.
export const POST = handler(async (req: NextRequest, ctx: RouteContext<"/api/stt/[id]">) => {
  const planId = await requirePlanner();
  const { id } = await ctx.params;
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > MAX_CHUNK || buf.length % 2 !== 0) throw new HttpError(400, "Bad audio chunk");
  const state = pushAudio(id, planId, buf);
  if (!state) throw new HttpError(404, "Transcription session ended");
  return json(state);
});

export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/stt/[id]">) => {
  const planId = await requirePlanner();
  const { id } = await ctx.params;
  cancelLiveSession(id, planId);
  return json({ ok: true });
});
