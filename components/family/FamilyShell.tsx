import type { ReactNode } from "react";
import { Wordmark } from "../Logo";

export function FamilyShell({ children, memorial }: { children: ReactNode; memorial?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Wordmark />
          <span className="rounded-full bg-sand px-3 py-1 text-[0.8rem] font-semibold text-ink-soft">Private, shared with you</span>
        </div>
      </header>
      {memorial && (
        <div className="bg-plum-soft py-3 text-center text-[0.95rem] text-plum">In loving memory. This plan is preserved as it was last shared.</div>
      )}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-8">{children}</main>
    </div>
  );
}
