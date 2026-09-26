"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, Lock, SendHorizontal, X } from "lucide-react";
import { useLinh } from "@/lib/client/LinhProvider";

// The live waveform at the bottom of every screen. It never stops moving, so it's always clear the conversation is
// on: a slow travelling wave while she listens, the person's voice in green when they talk, hers in gold when she
// speaks. It replaces the app's buttons; the only control is a small keyboard for anyone who'd rather type.

const BARS = 44;

/** A live 0..1 loudness reading for one audio track (0 when there is none). */
function useLevel(ctx: AudioContext | null, track: MediaStreamTrack | null) {
  const read = useRef<() => number>(() => 0);
  useEffect(() => {
    read.current = () => 0;
    if (!ctx || !track || track.readyState === "ended") return;
    let source: MediaStreamAudioSourceNode | null = null;
    try {
      source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      read.current = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        return Math.min(1, Math.sqrt(sum / data.length) * 5);
      };
    } catch {
      /* no analyser: the wave still moves */
    }
    return () => {
      source?.disconnect();
      read.current = () => 0;
    };
  }, [ctx, track]);
  return read;
}

export function LiveWave({ tone }: { tone: "dark" | "light" }) {
  const { phase, started, agentState, micLive, held, micError, agentAudio, micAudio, audioContext, notify } = useLinh();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentLevel = useLevel(audioContext, agentAudio);
  const micLevel = useLevel(audioContext, micLive ? micAudio : null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Read by the animation loop without restarting it.
  const live = useRef({ speaking: false, listening: false, dim: true, tone });
  useEffect(() => {
    live.current = { speaking: agentState === "speaking", listening: micLive, dim: !started || held, tone };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heights = new Array(BARS).fill(0.1);
    let voice = 0;
    let raf = 0;
    const t0 = performance.now();

    const draw = (now: number) => {
      const t = reduced ? 0 : (now - t0) / 1000;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const s = live.current;
      const her = agentLevel.current();
      const you = s.listening ? micLevel.current() : 0;
      // Her voice may not be measurable in every browser; while she speaks, the wave still dances.
      const herLevel = s.speaking ? Math.max(her, 0.22 + 0.16 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1))) : her * 0.6;
      const target = Math.max(herLevel, you);
      voice += (target - voice) * (target > voice ? 0.45 : 0.12);
      const talking = you > 0.07 && you >= herLevel;

      const color =
        s.tone === "dark"
          ? talking ? "#9fd6b9" : s.speaking ? "#f0c46a" : "rgba(255,255,255,0.85)"
          : talking ? "#4f7d68" : s.speaking ? "#d9a441" : "#3d405b";
      ctx.fillStyle = color;
      const gap = 3;
      const bw = Math.max(2, (w - gap * (BARS - 1)) / BARS);
      for (let i = 0; i < BARS; i++) {
        const x = i / (BARS - 1);
        const bell = Math.exp(-Math.pow((x - 0.5) / 0.28, 2));
        const idle = 0.1 + 0.07 * Math.sin(t * 1.7 - i * 0.42) + 0.04 * Math.sin(t * 0.9 + i * 0.23);
        const ripple = 0.55 + 0.45 * Math.sin(t * 9 + i * 1.3) * Math.sin(t * 4.1 - i * 0.7);
        const want = (s.dim ? 0.6 : 1) * idle + voice * bell * ripple * 1.05;
        heights[i] += (want - heights[i]) * 0.35;
        const bh = Math.max(3, Math.min(1, heights[i]) * h);
        ctx.globalAlpha = s.dim ? 0.45 : 0.55 + 0.45 * bell;
        const bx = i * (bw + gap);
        const by = (h - bh) / 2;
        const r = Math.min(bw / 2, bh / 2);
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
        ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
        ctx.arcTo(bx, by + bh, bx, by, r);
        ctx.arcTo(bx, by, bx + bw, by, r);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [agentLevel, micLevel, typing]);

  const status = !started
    ? phase === "error"
      ? "Couldn’t connect"
      : "Tap play to begin"
    : phase !== "live"
      ? "Connecting…"
      : held
        ? "Not listening on this screen"
        : micError
          ? micError
          : agentState === "speaking"
            ? "Speaking"
            : "Listening";

  function send() {
    const text = draft.trim();
    if (!text) return;
    notify(text);
    setDraft("");
    setTyping(false);
  }

  const dark = tone === "dark";
  return (
    <div
      className={`pointer-events-auto relative shrink-0 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 ${dark ? "bg-gradient-to-t from-black/70 to-black/0 text-white" : "border-t border-line/70 bg-paper"}`}
    >
      {typing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={inputRef}
            className="field min-h-[2.75rem] flex-1 py-2 text-[0.98rem]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your answer"
            maxLength={2000}
            autoFocus
          />
          <button type="submit" aria-label="Send" className="flex h-11 w-11 items-center justify-center rounded-full bg-dusk text-white disabled:opacity-40" disabled={!draft.trim()}>
            <SendHorizontal className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Close typing" onClick={() => setTyping(false)} className="flex h-11 w-9 items-center justify-center text-ink-mute">
            <X className="h-5 w-5" />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <canvas ref={canvasRef} className="block h-9 w-full" aria-hidden="true" />
            <p className={`mt-0.5 flex items-center justify-center gap-1 text-[0.72rem] font-semibold tracking-wide ${dark ? "text-white/85" : "text-ink-mute"}`} role="status">
              {held && <Lock className="h-3 w-3" />} {status}
            </p>
          </div>
          {started && (
            <button
              aria-label="Type instead"
              onClick={() => setTyping(true)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${dark ? "text-white/80 hover:bg-white/10" : "text-ink-mute hover:bg-sand"}`}
            >
              <Keyboard className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
