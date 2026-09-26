"use client";

import { useEffect, useRef } from "react";

// Live bars from the microphone so people can see they are being heard (spec §6: waveform feedback).
export function Waveform({ analyser, active, color = "#c8643f", bars = 36, className = "" }: { analyser: AnalyserNode | null; active: boolean; color?: string; bars?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const data = new Uint8Array(analyser ? analyser.fftSize : 1024);
    const levels = new Array(bars).fill(0.04);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let level = 0;
      if (analyser && active) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
      }
      levels.shift();
      levels.push(active ? Math.max(0.05, level) : 0.04);

      const gap = 4;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const bh = Math.max(4, levels[i] * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.globalAlpha = 0.35 + 0.65 * (i / bars);
        roundRect(ctx, x, y, bw, bh, bw / 2);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, bars, color]);

  return <canvas ref={canvasRef} className={`h-14 w-full ${className}`} aria-hidden="true" />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
