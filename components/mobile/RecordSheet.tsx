"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Keyboard, Mic, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import type { ClipMeta, PromptDef, Suggestion } from "@/lib/types";
import { useLinh } from "@/lib/client/LinhProvider";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { recordingSupported, useRecorder, type RecordingResult } from "@/lib/client/useRecorder";
import { Waveform } from "../voice/Waveform";
import { Spinner, formatClock } from "../ui";

// The recording screen (spec §6): countdown ring, live waveform, max-length hint, re-record, "Type instead", and an
// automatic save when the time limit is reached (then an offer to continue in a follow-up clip). While it's open,
// Linh's microphone is closed so she can't hear the answer being recorded.

type Stage = "ready" | "recording" | "review" | "saving" | "limit";

export function RecordSheet({
  prompt,
  index,
  total,
  onClose,
  onTypeInstead,
  onSuggestions,
}: {
  prompt: PromptDef;
  index: number;
  total: number;
  onClose: () => void;
  onTypeInstead: () => void;
  onSuggestions?: (s: Suggestion[]) => void;
}) {
  const { view } = usePlan();
  const act = usePlanAction();
  const linh = useLinh();
  const [stage, setStage] = useState<Stage>("ready");
  const [take, setTake] = useState<RecordingResult | null>(null);
  const [continueFrom, setContinueFrom] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<ClipMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const live = !!view?.features.stt && prompt.kind !== "disclosure";

  const recorder = useRecorder({
    limitSec: prompt.recordLimitSec,
    live,
    onComplete: (r) => {
      setTake(r);
      setPreviewUrl(URL.createObjectURL(r.blob));
      if (r.autoSaved) void save(r); // at the limit the partial clip is saved automatically
      else setStage("review");
    },
  });

  // Close Linh's microphone while this sheet is open.
  useEffect(() => {
    linh.holdMic("recording", true);
    return () => linh.holdMic("recording", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  async function save(r: RecordingResult | null = take) {
    if (!r) return;
    setStage("saving");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", r.blob, r.mime.includes("mp4") ? "clip.m4a" : "clip.webm");
      form.append("owner", prompt.id);
      form.append("durationMs", String(Math.round(r.durationMs)));
      if (r.autoSaved) form.append("autoSaved", "1");
      if (continueFrom) form.append("continuationOf", continueFrom);
      if (r.sttSessionId) form.append("sttSessionId", r.sttSessionId);
      const res = await act<{ clip: ClipMeta; transcript: { text: string } | null }>("/api/clips", { raw: form });
      setLastSaved(res.clip);
      void linh.notify(`[recorded:${prompt.id}]`);
      if (res.transcript?.text && view?.features.ai && prompt.kind !== "disclosure") {
        act<{ suggestions: Suggestion[] }>("/api/ai/understand", { body: { clipId: res.clip.id } })
          .then((u) => onSuggestions?.(u.suggestions))
          .catch(() => {});
      }
      if (r.autoSaved) setStage("limit");
      else onClose();
    } catch (e) {
      setError((e as Error).message);
      setStage("review");
    }
  }

  function startRecording(fromClip?: string) {
    setTake(null);
    setPreviewUrl(null);
    setContinueFrom(fromClip ?? null);
    setStage("recording");
    void recorder.start();
  }

  function togglePreview() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play();
  }

  const elapsed = stage === "recording" ? recorder.elapsedMs : take?.durationMs ?? 0;
  const limitMs = prompt.recordLimitSec * 1000;
  const left = Math.max(0, limitMs - elapsed);
  const size = 196;
  const r = 86;
  const c = 2 * Math.PI * r;
  const progress = Math.min(1, elapsed / limitMs);

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-0 z-30 flex flex-col bg-paper">
      <div className="flex items-start justify-between px-5 pt-4">
        <div>
          <p className="text-[0.85rem] text-ink-mute">
            Question {index + 1} of {total}
          </p>
          <h2 className="mt-0.5 text-[1.25rem] font-bold leading-snug">{prompt.eyebrow}</h2>
        </div>
        <button className="rounded-full p-2 text-ink-mute hover:bg-sand" onClick={onClose} aria-label="Close" disabled={stage === "recording" || stage === "saving"}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-5">
        {!recordingSupported() ? (
          <p className="text-center text-ink-soft">This browser can&rsquo;t record audio. Please type your answer instead.</p>
        ) : (
          <>
            <div className="relative" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece6de" strokeWidth={9} />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke="#d23c3c"
                  strokeWidth={9}
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - progress)}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  style={{ transition: "stroke-dashoffset 0.1s linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className={`h-5 w-5 rounded-full bg-[#d23c3c] ${stage === "recording" ? "animate-pulse" : ""}`} />
                <span className="text-[1.9rem] font-semibold tabular-nums">{formatClock(elapsed)}</span>
              </div>
            </div>
            <div className="h-10 w-44">{stage === "recording" && <Waveform analyser={recorder.analyser} active color="#d23c3c" bars={18} className="h-10" />}</div>
            <p className="text-[0.9rem] text-ink-mute">
              Max {formatClock(limitMs)} · {formatClock(left)} left
            </p>
            {live && stage === "recording" && recorder.caption && <p className="line-clamp-2 max-w-xs text-center text-[0.85rem] italic text-ink-soft">&ldquo;{recorder.caption}&rdquo;</p>}
            {stage === "limit" && (
              <p className="max-w-xs text-center text-[0.9rem] text-ink-soft">Saved at {formatClock(limitMs)} so nothing was lost. Want to keep going?</p>
            )}
            {recorder.error && <p className="max-w-xs text-center text-[0.85rem] text-clay">{recorder.error}</p>}
            {error && <p className="max-w-xs text-center text-[0.85rem] text-clay">{error}</p>}

            <div className="mt-3 flex items-center gap-6">
              <button
                className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white text-ink-soft disabled:opacity-40"
                onClick={() => startRecording()}
                disabled={stage === "ready" || stage === "recording" || stage === "saving"}
                aria-label="Record again"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              {stage === "recording" ? (
                <button className="flex h-20 w-20 items-center justify-center rounded-full bg-[#d23c3c] text-white shadow-lg active:scale-95" onClick={() => void recorder.stop()} aria-label="Stop recording">
                  <Square className="h-7 w-7 fill-white" />
                </button>
              ) : stage === "review" ? (
                <button className="flex h-20 w-20 items-center justify-center rounded-full bg-[#d23c3c] text-white shadow-lg active:scale-95" onClick={togglePreview} aria-label={playing ? "Pause" : "Play it back"}>
                  {playing ? <Pause className="h-7 w-7 fill-white" /> : <Play className="ml-1 h-7 w-7 fill-white" />}
                </button>
              ) : stage === "limit" ? (
                <button className="flex h-20 w-20 items-center justify-center rounded-full bg-[#d23c3c] text-white shadow-lg active:scale-95" onClick={() => startRecording(lastSaved?.id)} aria-label="Continue in a follow-up clip">
                  <Mic className="h-8 w-8" />
                </button>
              ) : (
                <button
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-[#d23c3c] text-white shadow-lg active:scale-95 disabled:opacity-60"
                  onClick={() => startRecording()}
                  disabled={stage === "saving"}
                  aria-label="Start recording"
                >
                  {stage === "saving" ? <Spinner className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
                </button>
              )}
              <button
                className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white text-ink-soft disabled:opacity-40"
                onClick={() => (stage === "recording" ? void recorder.stop() : onClose())}
                disabled={stage === "saving"}
                aria-label={stage === "recording" ? "Stop" : "Done"}
              >
                <Square className="h-4 w-4" />
              </button>
            </div>
            {previewUrl && <audio ref={audioRef} src={previewUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />}
            <p className="mt-1 text-[0.8rem] text-ink-mute">
              {stage === "ready" ? "Tap the red button and speak for about a minute." : stage === "recording" ? "Tap to stop." : stage === "review" ? "Listen back, record again, or save." : ""}
            </p>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-line/70 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button className="btn btn-outline w-full" onClick={onTypeInstead} disabled={stage === "recording" || stage === "saving"}>
          <Keyboard className="h-5 w-5" /> Type instead
        </button>
        <button className="btn btn-primary w-full" onClick={() => (stage === "limit" ? onClose() : save())} disabled={!(stage === "review" || stage === "limit")}>
          {stage === "saving" ? <Spinner /> : null} {stage === "limit" ? "Done" : "Save recording"}
        </button>
      </div>
    </motion.div>
  );
}
