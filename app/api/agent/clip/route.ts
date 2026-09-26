import type { PromptId, Word } from "@/lib/types";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { requireAgent } from "@/lib/server/agentAuth";
import { decodeToPcm } from "@/lib/server/audio";
import { storeClip } from "@/lib/server/clips";
import { json } from "@/lib/server/http";
import { requireCore } from "@/lib/server/plans";
import { handler, HttpError } from "@/lib/server/session";
import { sttEnabled, transcribePcm } from "@/lib/server/stt/transcribe";

const MAX_BYTES = 30 * 1024 * 1024;

// The person's own voice from the live conversation: Linh cuts the stretch of microphone audio where they answered
// a question and posts it here (multipart: file, questionId, durationMs, words). It is stored exactly like an
// on-screen recording, so family members hear it in the person's voice. Only with the person's voice consent.
export const POST = handler(async (req: Request) => {
  const planId = requireAgent(req);
  const core = requireCore(planId);
  if (!core.profile.voiceConsentAt) throw new HttpError(409, "No voice consent: answers are saved as text only");

  const form = await req.formData();
  const file = form.get("file");
  const questionId = String(form.get("questionId") || "") as PromptId;
  const prompt = PROMPT_BY_ID[questionId];
  if (!prompt) throw new HttpError(404, "Unknown question");
  if (prompt.kind === "disclosure") throw new HttpError(403, "The disclosure preference is never recorded by the agent");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "No audio received");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Recording too large");

  const audio = Buffer.from(await file.arrayBuffer());
  const words = String(form.get("words") || "").trim();
  const durationMs = Math.min(Number(form.get("durationMs") || 0), (prompt.recordLimitSec * 4) * 1000);

  // Prefer Amazon Transcribe (word timings let family hear an exact sentence); fall back to the agent's own STT.
  let transcript: { text: string; words: Word[]; provider: string } | null = null;
  if (sttEnabled() && core.profile.transcription) {
    const pcm = await decodeToPcm(audio);
    const result = pcm ? await transcribePcm(new Uint8Array(pcm), planId).catch(() => null) : null;
    if (result?.text) transcript = { text: result.text, words: result.words, provider: "amazon-transcribe" };
  }
  if (!transcript && words && core.profile.transcription) transcript = { text: words, words: [], provider: "livekit-stt" };

  const { meta } = await storeClip(planId, { owner: prompt.id, audio, mime: file.type || "audio/wav", durationMs, live: true, transcript });
  return json({ ok: true, clipId: meta.id, transcript: meta.transcript }, { status: 201 });
});
