"use client";

import Link from "next/link";
import { useLinh, useLinhScreen } from "@/lib/client/LinhProvider";

// The first screen: the assistant fills the phone, with a see-through Play button in the middle (on the stage). The
// Play tap starts the conversation: she introduces herself, then leads through the questions. While she speaks here,
// her words appear where the introduction was.

function tail(text: string, max = 200): string {
  return text.length > max ? `…${text.slice(-max).replace(/^\S*\s/, "")}` : text;
}

export default function Welcome() {
  const { started, phase, lastLinh } = useLinh();
  useLinhScreen("welcome");
  const speaking = started && phase === "live" && !!lastLinh;

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end bg-gradient-to-t from-black/75 via-black/30 via-40% to-transparent to-65% px-5 pb-2 text-white">
      <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-white/75">Advance care planning</p>
      <h1 className="font-display text-[2.3rem] font-semibold leading-none">Voceli</h1>
      {speaking ? (
        <p className="mt-3 line-clamp-4 min-h-[5.5rem] text-[1.08rem] leading-snug" aria-live="polite">
          {tail(lastLinh)}
        </p>
      ) : (
        <>
          <p className="mt-3 min-h-[3.2rem] font-display text-[1.25rem] leading-snug">I&rsquo;m an AI assistant, and I can help guide you through advance care planning.</p>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-white/75">
            Tap play to begin. Your answers are saved in your own voice, private and encrypted. Not a legal document or medical order ·{" "}
            <Link href="/about" className="pointer-events-auto underline">
              About Voceli
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
