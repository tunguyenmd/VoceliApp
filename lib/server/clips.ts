import type { ClipMeta, ClipOwner, PlanCore, Word } from "@/lib/types";
import { appendAudit } from "./audit";
import { normalizeAudio } from "./audio";
import { randomId } from "./crypto";
import { attachClip, mutateCore, requireCore, saveDisclosure, writeClipAudio, writeTranscript } from "./plans";

// Store one recording: normalise to AAC, encrypt, keep its transcript (encrypted), and attach it to its question.
// Used by recordings made on screen and by the live conversation with Linh.

export async function storeClip(
  planId: string,
  input: {
    owner: ClipOwner;
    clarificationId?: string;
    audio: Buffer;
    mime: string;
    durationMs: number;
    continuationOf?: string;
    autoSaved?: boolean;
    live?: boolean;
    transcript?: { text: string; words: Word[]; provider: string } | null;
    transcriptFailed?: boolean;
  },
): Promise<{ meta: ClipMeta; core: PlanCore }> {
  const { data, mime } = await normalizeAudio(input.audio, input.mime);
  const meta: ClipMeta = {
    id: randomId(12),
    owner: input.owner,
    clarificationId: input.clarificationId,
    createdAt: new Date().toISOString(),
    durationMs: input.durationMs,
    mime,
    bytes: data.length,
    continuationOf: input.continuationOf,
    autoSaved: input.autoSaved || undefined,
    live: input.live || undefined,
    transcript: "none",
  };
  writeClipAudio(planId, meta, data);

  if (input.owner !== "disclosure" && input.transcript?.text) {
    writeTranscript(planId, { clipId: meta.id, text: input.transcript.text, words: input.transcript.words, provider: input.transcript.provider, createdAt: meta.createdAt });
    meta.transcript = "done";
  } else if (input.transcriptFailed) {
    meta.transcript = "failed";
  }

  const { core } = await mutateCore(planId, (c) => attachClip(c, meta));
  if (input.owner === "disclosure") {
    await saveDisclosure(planId, (cur) => ({ ...cur, status: "answered", clipIds: [...cur.clipIds, meta.id], updatedAt: meta.createdAt }));
    appendAudit(planId, "disclosure", { actor: { kind: "planner" }, action: "disclosure.recorded", resource: `clip ${meta.id}` });
    return { meta, core: requireCore(planId) };
  }
  return { meta, core };
}
