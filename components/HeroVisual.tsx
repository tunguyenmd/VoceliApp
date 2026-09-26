"use client";

import { motion } from "motion/react";
import { Lock, Play, Sparkles } from "lucide-react";

// Illustrative only: a phone-like card showing what a family member sees.
export function HeroVisual() {
  const bars = [0.3, 0.55, 0.8, 0.45, 0.95, 0.6, 0.35, 0.75, 0.5, 0.85, 0.4, 0.65, 0.3, 0.7, 0.45, 0.9, 0.55, 0.35, 0.6, 0.4];
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="breathe absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-clay/25 to-gold/25 blur-2xl" />
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: -1 }}
        transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
        className="relative rounded-[2.5rem] border border-line bg-white p-5 shadow-[var(--shadow-lift)]"
      >
        <div className="rounded-[1.75rem] bg-gradient-to-br from-dusk to-[#4a3f6b] p-5 text-white">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white/70">Hoa&rsquo;s care wishes</p>
          <p className="mt-2 font-display text-[1.35rem] leading-snug">My family, my faith, and my garden matter most to me.</p>
        </div>
        <div className="mt-4 rounded-2xl bg-paper p-4 ring-1 ring-line">
          <p className="font-display text-[1.05rem] leading-snug">&ldquo;If machines are keeping me alive and the doctors say I won&rsquo;t come back, please let me go.&rdquo;</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-clay text-white">
              <Play className="ml-0.5 h-4 w-4 fill-white" />
            </span>
            <div className="flex h-8 flex-1 items-center justify-between">
              {bars.map((h, i) => (
                <motion.span
                  key={i}
                  className="w-[4px] rounded-full bg-clay/70"
                  initial={{ height: "20%" }}
                  animate={{ height: [`${h * 40}%`, `${h * 100}%`, `${h * 55}%`] }}
                  transition={{ duration: 1.6, repeat: Infinity, repeatType: "mirror", delay: i * 0.06 }}
                />
              ))}
            </div>
          </div>
          <p className="mt-2 text-[0.75rem] text-ink-mute">Hear Hoa say it · 0:06</p>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-plum-soft px-4 py-3 text-[0.85rem] text-plum">
          <Lock className="h-4 w-4" /> How Hoa wants to hear serious news
        </div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="absolute -right-4 -top-5 flex items-center gap-2 rounded-full bg-gold-soft px-4 py-2 text-[0.8rem] font-semibold shadow-[var(--shadow-soft)] sm:-right-10"
        >
          <Sparkles className="h-4 w-4 text-gold" /> Every line traced to her words
        </motion.div>
      </motion.div>
    </div>
  );
}
