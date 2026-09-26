"use client";

import type { ReactNode } from "react";

// The app is a phone app: full-screen on a phone, and inside a phone frame on a laptop (for demos).
export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#f7ebd0_0%,#fbf8f3_45%,#efe6da_100%)] md:py-4">
      {/* On a laptop the screen inside the frame is an iPhone's 390 × 844 points, shrinking to fit shorter windows. */}
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-paper md:h-[min(868px,calc(100dvh_-_2rem))] md:w-[414px] md:rounded-[56px] md:border-[12px] md:border-[#1c1b22] md:shadow-[0_40px_80px_-30px_rgba(37,40,58,0.55)]">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-40 hidden h-[30px] w-[118px] -translate-x-1/2 rounded-full bg-[#1c1b22] md:block" />
        {children}
      </div>
    </div>
  );
}

/** Scrollable page body under the assistant, with actions pinned above the live waveform. */
export function MobilePage({ children, actions, overlay }: { children: ReactNode; actions?: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">{children}</div>
      {actions && <div className="shrink-0 space-y-2 border-t border-line/70 bg-paper/95 px-5 pb-3 pt-3 backdrop-blur">{actions}</div>}
      {overlay}
    </div>
  );
}
