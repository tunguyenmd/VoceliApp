"use client";

import { Mic, Square } from "lucide-react";

// Record/stop button wrapped in a countdown ring (spec §6). The ring fills toward the hard limit; the tick marks the
// suggested length so people know roughly how long to talk.
export function RecordButton({
  recording,
  busy,
  elapsedMs,
  limitSec,
  targetSec,
  onClick,
  label,
}: {
  recording: boolean;
  busy?: boolean;
  elapsedMs: number;
  limitSec: number;
  targetSec: number;
  onClick: () => void;
  label: string;
}) {
  const size = 132;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = Math.min(1, elapsedMs / (limitSec * 1000));
  const nearEnd = elapsedMs > (limitSec - 10) * 1000;
  const targetAngle = (targetSec / limitSec) * 2 * Math.PI - Math.PI / 2;
  const tx = size / 2 + r * Math.cos(targetAngle);
  const ty = size / 2 + r * Math.sin(targetAngle);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {recording && <span className="breathe absolute inset-3 rounded-full bg-clay/30" aria-hidden="true" />}
      <svg width={size} height={size} className="absolute inset-0 -rotate-0" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#efe6da" strokeWidth={stroke} />
        {recording && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={nearEnd ? "#d9a441" : "#c8643f"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.4s ease" }}
          />
        )}
        <circle cx={tx} cy={ty} r={3.5} fill={elapsedMs / 1000 >= targetSec ? "#4f7d68" : "#c9bba8"} />
      </svg>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={label}
        aria-pressed={recording}
        className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full text-white shadow-[0_12px_30px_-10px_rgba(200,100,63,0.7)] transition-transform active:scale-95 disabled:opacity-60 ${recording ? "bg-clay" : "bg-clay hover:scale-[1.03]"}`}
      >
        {recording ? <Square className="h-8 w-8 fill-white" /> : <Mic className="h-10 w-10" />}
      </button>
    </div>
  );
}
