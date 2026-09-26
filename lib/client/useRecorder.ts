"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { concatInt16, Downsampler } from "./pcm";

// Voice capture for every question (spec §6):
//   • MediaRecorder keeps the recording itself (AAC in Safari, Opus in Chrome/Firefox).
//   • An AudioWorklet taps the same microphone stream, downsamples to 16 kHz PCM, and streams it to the server in small
//     POSTs for live captions. The transcript is ready moments after the person stops talking.
//   • A hard time limit auto-saves the clip (partial recordings are kept, never discarded) so the person can continue
//     in a follow-up clip.

export type RecorderStatus = "idle" | "starting" | "recording" | "finishing" | "error";

export interface RecordingResult {
  blob: Blob;
  mime: string;
  durationMs: number;
  autoSaved: boolean;
  sttSessionId?: string;
}

interface Options {
  limitSec: number;
  live: boolean;
  onComplete: (result: RecordingResult) => void;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function recordingSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

interface Internals {
  stream: MediaStream;
  ctx: AudioContext;
  recorder: MediaRecorder;
  chunks: Blob[];
  mime: string;
  startedAt: number;
  timer: number;
  sessionId?: string;
  sessionReady: Promise<string | undefined>;
  queue: Int16Array[];
  sending: Promise<void> | null;
  sendTimer: number;
  worklet?: AudioWorkletNode;
  stopping: boolean;
}

export function useRecorder(opts: Options) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const inner = useRef<Internals | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const teardown = useCallback((i: Internals) => {
    window.clearInterval(i.timer);
    window.clearInterval(i.sendTimer);
    i.worklet?.port.close();
    i.stream.getTracks().forEach((t) => t.stop());
    i.ctx.close().catch(() => {});
    setAnalyser(null);
  }, []);

  const sendQueued = useCallback(async (i: Internals) => {
    if (!i.sessionId || !i.queue.length) return;
    const pcm = concatInt16(i.queue.splice(0));
    try {
      const res = await api<{ partial: string; final: string }>(`/api/stt/${i.sessionId}`, { method: "POST", raw: pcm.buffer as ArrayBuffer });
      const text = `${res.final} ${res.partial}`.trim();
      if (text) setCaption(text);
    } catch {
      // Live captions are a nicety; the recording itself is unaffected.
    }
  }, []);

  const pump = useCallback(
    (i: Internals) => {
      if (i.sending) return;
      i.sending = sendQueued(i).finally(() => {
        i.sending = null;
      });
    },
    [sendQueued],
  );

  const finish = useCallback(
    async (autoSaved: boolean) => {
      const i = inner.current;
      if (!i || i.stopping) return;
      i.stopping = true;
      setStatus("finishing");
      const durationMs = Math.min(Date.now() - i.startedAt, optsRef.current.limitSec * 1000);
      const stopped = new Promise<void>((resolve) => i.recorder.addEventListener("stop", () => resolve(), { once: true }));
      if (i.recorder.state !== "inactive") i.recorder.stop();
      await stopped;
      window.clearInterval(i.sendTimer);
      await i.sessionReady;
      if (i.sending) await i.sending;
      await sendQueued(i);
      teardown(i);
      inner.current = null;
      const blob = new Blob(i.chunks, { type: i.mime || i.chunks[0]?.type || "audio/webm" });
      setStatus("idle");
      setElapsedMs(0);
      optsRef.current.onComplete({ blob, mime: blob.type, durationMs, autoSaved, sttSessionId: i.sessionId });
    },
    [sendQueued, teardown],
  );

  const start = useCallback(async () => {
    if (inner.current) return;
    setError(null);
    setCaption("");
    setStatus("starting");
    // Create the audio context inside the click so Safari lets it run.
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      ctx.close().catch(() => {});
      setStatus("error");
      setError(
        (e as DOMException)?.name === "NotAllowedError"
          ? "Microphone access was blocked. You can allow it in your browser settings, or type your answer instead."
          : "We couldn't reach a microphone. You can type your answer instead.",
      );
      return;
    }
    await ctx.resume().catch(() => {});

    const source = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.75;
    source.connect(an);

    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
    const i: Internals = {
      stream,
      ctx,
      recorder,
      chunks: [],
      mime: recorder.mimeType || mime,
      startedAt: Date.now(),
      timer: 0,
      queue: [],
      sending: null,
      sendTimer: 0,
      stopping: false,
      sessionReady: Promise.resolve(undefined),
    };
    inner.current = i;
    recorder.addEventListener("dataavailable", (ev) => {
      if (ev.data && ev.data.size) i.chunks.push(ev.data);
    });

    if (optsRef.current.live) {
      i.sessionReady = api<{ id: string }>("/api/stt", { method: "POST" })
        .then((r) => (i.sessionId = r.id))
        .catch(() => undefined);
      try {
        await ctx.audioWorklet.addModule("/pcm-worklet.js");
        const node = new AudioWorkletNode(ctx, "pcm-capture");
        const down = new Downsampler(ctx.sampleRate);
        node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
          if (!i.stopping) i.queue.push(down.push(ev.data));
        };
        const mute = ctx.createGain();
        mute.gain.value = 0;
        source.connect(node);
        node.connect(mute).connect(ctx.destination);
        i.worklet = node;
        i.sendTimer = window.setInterval(() => pump(i), 300);
      } catch {
        // No worklet support: record without live captions.
      }
    }

    recorder.start(1000);
    i.startedAt = Date.now();
    setAnalyser(an);
    setElapsedMs(0);
    setStatus("recording");
    i.timer = window.setInterval(() => {
      const ms = Date.now() - i.startedAt;
      setElapsedMs(ms);
      if (ms >= optsRef.current.limitSec * 1000) void finish(true);
    }, 100);
  }, [finish, pump]);

  const stop = useCallback(() => finish(false), [finish]);

  const cancel = useCallback(() => {
    const i = inner.current;
    if (!i) return;
    i.stopping = true;
    if (i.recorder.state !== "inactive") i.recorder.stop();
    teardown(i);
    i.sessionReady.then((id) => id && api(`/api/stt/${id}`, { method: "DELETE" }).catch(() => {}));
    inner.current = null;
    setStatus("idle");
    setElapsedMs(0);
    setCaption("");
  }, [teardown]);

  useEffect(() => () => cancel(), [cancel]);

  return { status, elapsedMs, caption, error, analyser, start, stop, cancel };
}
