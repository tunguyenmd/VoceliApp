"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Check, Lock, Mic, PencilLine, Sparkles } from "lucide-react";
import { PROMPTS, disclosureLabel, optionLabel, spectrumStop } from "@/lib/content/prompts";
import { promptState } from "@/lib/client/flow";
import { useLinhScreen } from "@/lib/client/LinhProvider";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import type { PlannerView } from "@/lib/server/views";
import { MobilePage } from "@/components/mobile/MobileFrame";
import { SummaryCard } from "@/components/SummaryCard";
import { Spinner } from "@/components/ui";

function line(view: PlannerView, id: (typeof PROMPTS)[number]["id"]): string | null {
  if (id === "disclosure") {
    const d = view.disclosure;
    if (!d || d.status !== "answered") return null;
    return d.unsure ? "Not sure yet" : (disclosureLabel(d.choice)?.label ?? "Answered");
  }
  const a = view.core.answers[id];
  if (!a || a.status !== "answered") return null;
  if (a.selected?.length) return a.selected.filter((x) => x !== "other").map((x) => optionLabel(id, x)).concat(a.otherText ? [a.otherText] : []).join(" · ");
  if (a.spectrum) return spectrumStop(a.spectrum)?.label ?? null;
  if (a.unsure) return "Not sure yet";
  const spoken = a.clipIds.map((c) => view.transcripts[c]).find(Boolean);
  if (spoken) return `“${spoken.slice(0, 80)}${spoken.length > 80 ? "…" : ""}”`;
  return a.text ? `“${a.text.slice(0, 80)}”` : a.clipIds.length ? "Recorded in your voice" : null;
}

export default function Review() {
  const { view } = usePlan();
  const act = usePlanAction();
  const router = useRouter();
  useLinhScreen("review");
  const [making, setMaking] = useState(false);
  if (!view) return null;
  const summary = view.core.summary;

  async function makeSummary() {
    setMaking(true);
    try {
      await act("/api/ai/summary", { method: "POST" });
    } finally {
      setMaking(false);
    }
  }

  return (
    <MobilePage
      actions={
        summary ? (
          summary.approvedAt ? (
            <button className="btn btn-primary w-full" onClick={() => router.push("/app/share")}>
              Share with family <ArrowRight className="h-5 w-5" />
            </button>
          ) : (
            <button className="btn btn-primary w-full" onClick={() => act("/api/ai/summary", { method: "PATCH", body: { approve: true } })}>
              <Check className="h-5 w-5" /> This sounds like me
            </button>
          )
        ) : (
          <button className="btn btn-primary w-full" onClick={makeSummary} disabled={making}>
            {making ? <Spinner /> : <Sparkles className="h-5 w-5" />} {making ? "Writing your summary…" : "Create my summary"}
          </button>
        )
      }
    >
      {summary && (
        <div className="mb-5 [&_article]:rounded-3xl [&_h2]:text-[1.35rem]">
          <SummaryCard summary={summary} firstName={view.core.profile.firstName} audience="planner" clips={view.core.clips} clipSrc={(id) => `/api/clips/${id}`} lastReviewed={view.core.lastReviewedAt} />
          {summary.approvedAt && (
            <p className="mt-2 flex items-center gap-1.5 text-[0.85rem] text-sage">
              <BadgeCheck className="h-4 w-4" /> Approved
            </p>
          )}
        </div>
      )}
      <p className="text-[0.85rem] text-ink-mute">Review</p>
      <h1 className="text-[1.3rem] font-bold">{summary ? "Your answers" : "Here\u2019s what you\u2019ve shared"}</h1>
      <ul className="mt-3 space-y-2">
        {PROMPTS.map((p, i) => {
          const st = promptState(view, p.id);
          const text = line(view, p.id);
          const voice = p.id !== "disclosure" && (view.core.answers[p.id]?.clipIds.length ?? 0) > 0;
          return (
            <li key={p.id}>
              <Link href={`/app/q/${p.id}`} className="flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${st === "answered" ? "bg-sage text-white" : "bg-sand-deep"}`}>
                  {st === "answered" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="text-[0.7rem] font-bold text-ink-mute">{i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[0.95rem] font-semibold">
                    {p.eyebrow} {p.sensitive && <Lock className="h-3 w-3 text-plum" />}
                  </span>
                  <span className="block truncate text-[0.85rem] text-ink-soft">{text ?? (st === "skipped" ? "Skipped" : "Not answered yet")}</span>
                  {voice && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-clay">
                      <Mic className="h-3 w-3" /> In your voice
                    </span>
                  )}
                </span>
                <PencilLine className="mt-1 h-4 w-4 shrink-0 text-ink-mute" />
              </Link>
            </li>
          );
        })}
      </ul>

    </MobilePage>
  );
}
