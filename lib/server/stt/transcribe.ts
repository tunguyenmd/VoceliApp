import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
  type TranscriptResultStream,
} from "@aws-sdk/client-transcribe-streaming";
import type { Word } from "@/lib/types";
import { randomId } from "../crypto";
import { sttConfig } from "../config";

// Live transcription with Amazon Transcribe streaming. The browser sends 16 kHz mono PCM in small HTTP POSTs while
// the person speaks (works in every browser, no WebSockets needed), we feed an open Transcribe stream, and the
// transcript is essentially finished when they press stop. Audio is never written to disk here; the recording
// itself is stored separately, encrypted, by the clip upload.

const CHUNK_BYTES = 8000; // 250 ms of 16-bit mono at 16 kHz
const SESSION_TTL_MS = 10 * 60 * 1000;

interface FinalSegment {
  text: string;
  words: Word[];
}

interface LiveSession {
  id: string;
  planId: string;
  createdAt: number;
  queue: Uint8Array[];
  wake: (() => void) | null;
  ended: boolean;
  finals: FinalSegment[];
  partial: string;
  error?: string;
  bytes: number;
  done: Promise<void>;
}

const g = globalThis as unknown as { __heardStt?: Map<string, LiveSession>; __heardSttClient?: TranscribeStreamingClient };
const sessions: Map<string, LiveSession> = (g.__heardStt ??= new Map());

function client() {
  return (g.__heardSttClient ??= new TranscribeStreamingClient({ region: sttConfig().region }));
}

export function sttEnabled() {
  return sttConfig().kind === "aws-transcribe";
}

async function* audioEvents(s: LiveSession) {
  while (true) {
    const next = s.queue.shift();
    if (next) {
      yield { AudioEvent: { AudioChunk: next } };
      continue;
    }
    if (s.ended) return;
    await new Promise<void>((resolve) => (s.wake = resolve));
    s.wake = null;
  }
}

function collect(stream: AsyncIterable<TranscriptResultStream>, s: LiveSession) {
  return (async () => {
    for await (const event of stream) {
      for (const r of event.TranscriptEvent?.Transcript?.Results ?? []) {
        const alt = r.Alternatives?.[0];
        if (!alt) continue;
        if (r.IsPartial) {
          s.partial = alt.Transcript ?? "";
        } else {
          const words: Word[] = (alt.Items ?? [])
            .filter((i) => i.Type === "pronunciation" && i.Content)
            .map((i) => ({ w: i.Content!, s: i.StartTime ?? 0, e: i.EndTime ?? 0 }));
          s.finals.push({ text: alt.Transcript ?? "", words });
          s.partial = "";
        }
      }
    }
  })();
}

function sweep() {
  const now = Date.now();
  for (const s of sessions.values()) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      s.ended = true;
      s.wake?.();
      sessions.delete(s.id);
    }
  }
}

export function startLiveSession(planId: string): string {
  sweep();
  const cfg = sttConfig();
  const s: LiveSession = {
    id: randomId(12),
    planId,
    createdAt: Date.now(),
    queue: [],
    wake: null,
    ended: false,
    finals: [],
    partial: "",
    bytes: 0,
    done: Promise.resolve(),
  };
  s.done = (async () => {
    try {
      const res = await client().send(
        new StartStreamTranscriptionCommand({
          LanguageCode: cfg.languageCode as "en-US",
          MediaEncoding: "pcm",
          MediaSampleRateHertz: 16000,
          EnablePartialResultsStabilization: true,
          PartialResultsStability: "medium",
          AudioStream: audioEvents(s),
        }),
      );
      if (res.TranscriptResultStream) await collect(res.TranscriptResultStream, s);
    } catch (err) {
      s.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error("[heard] transcribe stream error:", s.error);
    }
  })();
  sessions.set(s.id, s);
  return s.id;
}

function own(id: string, planId: string): LiveSession | null {
  const s = sessions.get(id);
  return s && s.planId === planId ? s : null;
}

export function pushAudio(id: string, planId: string, pcm: Uint8Array): { partial: string; final: string; error?: string } | null {
  const s = own(id, planId);
  if (!s) return null;
  if (!s.ended) {
    for (let i = 0; i < pcm.length; i += CHUNK_BYTES) s.queue.push(pcm.subarray(i, Math.min(i + CHUNK_BYTES, pcm.length)));
    s.bytes += pcm.length;
    s.wake?.();
  }
  return { partial: s.partial, final: s.finals.map((f) => f.text).join(" "), error: s.error };
}

export interface FinishedTranscript {
  text: string;
  words: Word[];
  seconds: number;
}

export async function finishLiveSession(id: string, planId: string, timeoutMs = 12000): Promise<FinishedTranscript | null> {
  const s = own(id, planId);
  if (!s) return null;
  s.ended = true;
  s.wake?.();
  await Promise.race([s.done, new Promise((r) => setTimeout(r, timeoutMs))]);
  sessions.delete(id);
  if (s.error && !s.finals.length) return null;
  const segments = [...s.finals];
  if (s.partial) segments.push({ text: s.partial, words: [] });
  return {
    text: segments.map((f) => f.text).join(" ").replace(/\s+/g, " ").trim(),
    words: segments.flatMap((f) => f.words),
    seconds: s.bytes / 32000,
  };
}

export function cancelLiveSession(id: string, planId: string) {
  const s = own(id, planId);
  if (!s) return;
  s.ended = true;
  s.queue = [];
  s.wake?.();
  sessions.delete(id);
}

/** One-shot transcription of a whole PCM buffer (used by the demo seeder and for re-transcribing). */
export async function transcribePcm(pcm: Uint8Array, planId = "oneshot"): Promise<FinishedTranscript | null> {
  const id = startLiveSession(planId);
  pushAudio(id, planId, pcm);
  return finishLiveSession(id, planId, 120000);
}
