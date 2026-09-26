import type { ClipOwner, PromptId, Word } from "@/lib/types";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { storeClip } from "@/lib/server/clips";
import { json } from "@/lib/server/http";
import { requireCore } from "@/lib/server/plans";
import { handler, HttpError, requirePlanner } from "@/lib/server/session";
import { cancelLiveSession, finishLiveSession } from "@/lib/server/stt/transcribe";
import { plannerView } from "@/lib/server/views";

const MAX_BYTES = 20 * 1024 * 1024;

// Upload one recording (multipart). The audio is normalised, encrypted, and attached to its question. If a live
// transcription session ran while recording, it is closed here and the transcript is stored, also encrypted.
export const POST = handler(async (req: Request) => {
  const planId = await requirePlanner();
  const core = requireCore(planId);
  if (!core.profile.voiceConsentAt) throw new HttpError(409, "Please review the voice recording notice first");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "No audio received");
  if (file.size > MAX_BYTES) throw new HttpError(413, "That recording is too large");

  const owner = String(form.get("owner") || "") as ClipOwner;
  const clarificationId = form.get("clarificationId") ? String(form.get("clarificationId")) : undefined;
  if (owner !== "clarification" && !PROMPT_BY_ID[owner as PromptId]) throw new HttpError(400, "Unknown question");
  if (owner === "clarification" && !core.clarity.some((n) => n.id === clarificationId)) throw new HttpError(400, "Unknown follow-up question");

  const limitSec = owner === "clarification" ? 90 : PROMPT_BY_ID[owner as PromptId].recordLimitSec;
  const durationMs = Math.min(Number(form.get("durationMs") || 0), (limitSec + 3) * 1000);
  const continuationOf = form.get("continuationOf") ? String(form.get("continuationOf")) : undefined;
  if (continuationOf && !core.clips[continuationOf]) throw new HttpError(400, "Unknown earlier clip");
  const sttSessionId = form.get("sttSessionId") ? String(form.get("sttSessionId")) : undefined;

  // The disclosure preference is never transcribed or sent to a model; it stays under its own key.
  let transcript: { text: string; words: Word[]; provider: string } | null = null;
  let transcriptFailed = false;
  if (owner === "disclosure") {
    if (sttSessionId) cancelLiveSession(sttSessionId, planId);
  } else if (sttSessionId) {
    const result = await finishLiveSession(sttSessionId, planId);
    if (result && result.text) transcript = { text: result.text, words: result.words, provider: "amazon-transcribe" };
    else transcriptFailed = true;
  }

  const { meta, core: updated } = await storeClip(planId, {
    owner,
    clarificationId,
    audio: Buffer.from(await file.arrayBuffer()),
    mime: file.type || "audio/webm",
    durationMs,
    continuationOf,
    autoSaved: form.get("autoSaved") === "1",
    transcript,
    transcriptFailed,
  });
  return json({ clip: meta, transcript: transcript ? { text: transcript.text } : null, plan: plannerView(updated) }, { status: 201 });
});
