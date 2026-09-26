import { json } from "@/lib/server/http";
import { requireCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { startLiveSession, sttEnabled } from "@/lib/server/stt/transcribe";

// Opens a live transcription stream for one recording.
export const POST = handler(async () => {
  const planId = await requirePlanner();
  const core = requireCore(planId);
  if (!sttEnabled() || !core.profile.transcription) throw new HttpError(409, "Transcription is off");
  return json({ id: startLiveSession(planId) }, { status: 201 });
});
