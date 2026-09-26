"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Lock, Mic, SkipForward } from "lucide-react";
import { VOICE_NOTICE } from "@/lib/content/copy";
import { useLinh, useLinhScreen } from "@/lib/client/LinhProvider";
import { usePlanAction } from "@/lib/client/PlanProvider";
import { MobilePage } from "@/components/mobile/MobileFrame";
import { Spinner } from "@/components/ui";

// Before the questions: what this is and isn't (spec §5), and consent to keep recordings of their voice (§6, §11.5).
export default function Begin() {
  const act = usePlanAction();
  const router = useRouter();
  const linh = useLinh();
  useLinhScreen("begin");
  const [voice, setVoice] = useState(true);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await act("/api/plan", { method: "PATCH", body: voice ? { acknowledged: true, voiceConsent: true } : { acknowledged: true } });
      if (voice) void linh.notify("[voice-consent]"); // Linh may now keep spoken answers as recordings
      router.push("/app/q/reflect_health");
    } finally {
      setBusy(false);
    }
  }

  const points = [
    { icon: FileText, text: "This is a summary of your values, not a legal document or a medical order." },
    { icon: SkipForward, text: "Skip any question. It never counts against you." },
    { icon: Lock, text: "Nothing is shared until you choose who sees it." },
  ];

  return (
    <MobilePage
      actions={
        <button className="btn btn-primary w-full" onClick={start} disabled={busy}>
          {busy ? <Spinner /> : null} I understand, let&rsquo;s begin <ArrowRight className="h-5 w-5" />
        </button>
      }
    >
      <p className="text-[0.85rem] text-ink-mute">Before we begin</p>
      <h2 className="text-[1.3rem] font-bold leading-snug">About ten gentle questions, about fifteen minutes.</h2>
      <ul className="mt-4 space-y-3">
        {points.map((p) => (
          <li key={p.text} className="flex gap-3">
            <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-dusk" />
            <span className="text-ink-soft">{p.text}</span>
          </li>
        ))}
      </ul>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-sand p-4">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#3d405b]" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
        <span className="text-[0.92rem]">
          <span className="flex items-center gap-1.5 font-semibold">
            <Mic className="h-4 w-4 text-clay" /> Save my answers in my own voice
          </span>
          <span className="mt-1 block text-ink-soft">{VOICE_NOTICE.points[0]} {VOICE_NOTICE.points[1]}</span>
        </span>
      </label>
    </MobilePage>
  );
}
