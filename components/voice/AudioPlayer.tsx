"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatClock } from "../ui";

// A large, simple player. With `segment`, it plays just that stretch of the recording: how a family member hears
// the exact sentence a quote came from.
export function AudioPlayer({
  src,
  durationMs,
  segment,
  label,
  compact,
  tone = "dusk",
  onPlay,
}: {
  src: string;
  durationMs?: number;
  segment?: { start: number; end: number };
  label?: string;
  compact?: boolean;
  tone?: "dusk" | "clay" | "plum";
  onPlay?: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(segment?.start ?? 0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => {
      setTime(a.currentTime);
      if (segment && a.currentTime >= segment.end) {
        a.pause();
        a.currentTime = segment.start;
      }
    };
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    const onPlayEv = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlayEv);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlayEv);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
    };
  }, [segment]);

  const start = segment?.start ?? 0;
  const end = segment?.end ?? duration;
  const span = Math.max(0.1, end - start);
  const pct = Math.min(100, Math.max(0, ((time - start) / span) * 100));

  async function toggle() {
    const a = ref.current;
    if (!a) return;
    if (playing) {
      a.pause();
      return;
    }
    if (segment && (a.currentTime < segment.start || a.currentTime >= segment.end - 0.05)) a.currentTime = segment.start;
    onPlay?.();
    try {
      await a.play();
    } catch {
      setPlaying(false);
    }
  }

  const tones = { dusk: "bg-dusk", clay: "bg-clay", plum: "bg-plum" };
  const size = compact ? "h-10 w-10" : "h-12 w-12";

  return (
    <div className="flex w-full items-center gap-3">
      <audio ref={ref} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"}${label ? ` ${label}` : ""}`}
        className={`flex ${size} shrink-0 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95 ${tones[tone]}`}
      >
        {playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="ml-0.5 h-5 w-5 fill-white" />}
      </button>
      <div className="min-w-0 flex-1">
        {label && <div className="truncate text-[0.9rem] font-semibold">{label}</div>}
        <div
          className="relative mt-1 h-2 cursor-pointer rounded-full bg-sand-deep"
          onClick={(e) => {
            const a = ref.current;
            if (!a) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            a.currentTime = start + ((e.clientX - rect.left) / rect.width) * span;
          }}
        >
          <div className={`absolute inset-y-0 left-0 rounded-full ${tones[tone]}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-mute">{formatClock((playing ? time - start : span) * 1000)}</span>
    </div>
  );
}
