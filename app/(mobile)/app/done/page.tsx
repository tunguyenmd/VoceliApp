"use client";

import { useRouter } from "next/navigation";
import { Check, Heart, Share2 } from "lucide-react";
import { PROMPT_BY_ID, optionLabel, spectrumStop } from "@/lib/content/prompts";
import { useLinhScreen } from "@/lib/client/LinhProvider";
import { usePlan } from "@/lib/client/PlanProvider";
import type { PlannerView } from "@/lib/server/views";
import type { PromptId } from "@/lib/types";
import { MobilePage } from "@/components/mobile/MobileFrame";
import { AudioPlayer } from "@/components/voice/AudioPlayer";

function choices(view: PlannerView, id: PromptId): string[] {
  const a = view.core.answers[id];
  if (!a || a.status !== "answered") return [];
  const out = (a.selected ?? []).filter((x) => x !== "other").map((x) => optionLabel(id, x));
  if (a.selected?.includes("other") && a.otherText) out.push(a.otherText);
  const stop = spectrumStop(a.spectrum ?? null);
  if (stop) out.push(stop.label);
  return out;
}

// The final screen: what they said, in their own voice, and one button to share it with their family.
export default function Done() {
  const { view } = usePlan();
  const router = useRouter();
  useLinhScreen("done");
  if (!view) return null;
  const asked = view.flow.filter((id) => id !== "disclosure" && view.core.answers[id]?.status === "answered");

  return (
    <MobilePage
      actions={
        <button className="btn btn-primary w-full text-[1.05rem]" onClick={() => router.push("/app/share")}>
          <Share2 className="h-5 w-5" /> Share my recordings with my family
        </button>
      }
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-clay-soft">
          <Heart className="h-5 w-5 text-clay" />
        </span>
        <div>
          <h1 className="font-display text-[1.45rem] leading-tight">Your wishes, in your own voice</h1>
          <p className="text-[0.88rem] text-ink-soft">Your family won&rsquo;t hear an AI. They&rsquo;ll hear you.</p>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {asked.map((id) => {
          const p = PROMPT_BY_ID[id];
          const clips = (view.core.answers[id]?.clipIds ?? []).map((c) => view.core.clips[c]).filter(Boolean);
          return (
            <li key={id} className="rounded-2xl bg-white p-3 ring-1 ring-line">
              <p className="text-[0.75rem] font-bold uppercase tracking-wider text-ink-mute">{p.eyebrow}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {choices(view, id).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-plum-soft px-3 py-1 text-[0.82rem] font-semibold text-plum">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} /> {c}
                  </span>
                ))}
              </div>
              {clips.map((c) => (
                <div key={c.id} className="mt-2">
                  <AudioPlayer src={`/api/clips/${c.id}`} durationMs={c.durationMs} label="In your own voice" tone="clay" compact />
                  {view.transcripts[c.id] && <p className="mt-1 line-clamp-2 pl-1 text-[0.8rem] italic text-ink-soft">&ldquo;{view.transcripts[c.id]}&rdquo;</p>}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </MobilePage>
  );
}
