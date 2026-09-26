"use client";

import { useState } from "react";
import { ClipboardList, ExternalLink, Landmark, MessageCircleHeart, Printer, Stethoscope } from "lucide-react";
import type { PromptId } from "@/lib/types";
import { POLST_ABOUT, POLST_SECTIONS } from "@/lib/content/polst";
import { PROMPT_BY_ID, optionLabel, spectrumStop } from "@/lib/content/prompts";
import { STATE_GUIDES, US_STATES, caringInfoUrl } from "@/lib/content/states";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { PageHeader, formatDate } from "@/components/ui";

export default function NextSteps() {
  const { view } = usePlan();
  const act = usePlanAction();
  const [showPolst, setShowPolst] = useState(false);
  if (!view) return null;
  const state = view.core.profile.state ?? "CA";
  const guide = STATE_GUIDES[state];
  const stateName = US_STATES.find((s) => s.code === state)?.name ?? state;

  function told(pid: PromptId): string | null {
    const a = view!.core.answers[pid];
    if (!a || a.status !== "answered") return null;
    if (pid === "care_spectrum") {
      if (a.unsure) return "How much treatment: not sure yet.";
      const s = spectrumStop(a.spectrum);
      return s ? `How much treatment: "${s.label}". ${s.description}` : null;
    }
    const labels = (a.selected ?? []).filter((x) => x !== "other").map((x) => optionLabel(pid, x));
    if (!labels.length) return null;
    return `${PROMPT_BY_ID[pid].eyebrow}: ${labels.join("; ")}.`;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 sm:pt-12">
      <PageHeader eyebrow="Next steps" title="Make your wishes count.">
        Your summary helps your family understand you. To make your wishes legally official, you&rsquo;ll also complete your state&rsquo;s own form.
      </PageHeader>

      <section className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Landmark className="h-6 w-6 text-dusk" /> Your advance directive
          </h2>
          <label className="flex items-center gap-2 text-[0.95rem] font-semibold">
            I live in
            <select className="field w-auto py-2" value={state} onChange={(e) => act("/api/plan", { method: "PATCH", body: { state: e.target.value } })}>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {guide ? (
          <div className="mt-5 space-y-4">
            <p>
              In {stateName}, the legal document is called an <strong>{guide.documentName}</strong>. You can name a health care agent (someone to speak for you) and write down your
              wishes.
            </p>
            <div>
              <h3 className="font-semibold">To make it valid</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-6 text-ink-soft">
                {guide.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="font-semibold">If you use witnesses</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6 text-ink-soft">
                {guide.witnessRules.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            {guide.special && <p className="rounded-2xl bg-gold-soft p-4">{guide.special}</p>}
            <p className="text-sm text-ink-mute">
              Source:{" "}
              <a className="underline" href={guide.source.url} target="_blank" rel="noreferrer">
                {guide.source.label}
              </a>
              , checked {formatDate(guide.verifiedAt)}. This is general information, not legal advice.
            </p>
          </div>
        ) : (
          <p className="mt-5 text-ink-soft">
            Every state has its own advance directive form and its own signing rules. Some need witnesses, some need a notary, and some need both. The free form for {stateName} includes
            step-by-step instructions.
          </p>
        )}
        <a className="btn btn-primary mt-6" href={caringInfoUrl(state)} target="_blank" rel="noreferrer">
          Get the free {stateName} form <ExternalLink className="h-4 w-4" />
        </a>
        <p className="mt-2 text-sm text-ink-mute">Free state forms from CaringInfo, a program of the National Alliance for Care at Home.</p>
      </section>

      <section className="card mt-6 p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Stethoscope className="h-6 w-6 text-plum" /> Getting ready for a POLST conversation
        </h2>
        <p className="mt-3">{POLST_ABOUT.what}</p>
        <p className="mt-3 text-ink-soft">{POLST_ABOUT.notYet}</p>
        {guide?.polst && <p className="mt-3 text-ink-soft">{guide.polst}</p>}
        <p className="mt-3 text-sm text-ink-mute">{POLST_ABOUT.names}</p>
        {!showPolst ? (
          <button className="btn btn-outline mt-5" onClick={() => setShowPolst(true)}>
            <ClipboardList className="h-5 w-5" /> Prepare for the conversation
          </button>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border-2 border-dashed border-plum/40 bg-plum-soft/40 p-4 text-center font-bold uppercase tracking-wider text-plum">
              Draft for discussion with your clinician. Not a medical order.
            </div>
            {POLST_SECTIONS.map((s) => {
              const lines = s.related.map(told).filter(Boolean) as string[];
              const leaning = view.core.polstPrep?.[s.id];
              return (
                <div key={s.id} className="rounded-2xl p-5 ring-1 ring-line">
                  <h3 className="font-display text-xl">{s.title}</h3>
                  <p className="mt-1 text-ink-soft">{s.explain}</p>
                  {lines.length > 0 && (
                    <div className="mt-3 rounded-xl bg-sand p-3">
                      <p className="text-sm font-bold uppercase tracking-wider text-ink-mute">What you told Heard</p>
                      <ul className="mt-1 space-y-1 text-[0.95rem]">
                        {lines.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="mt-3 text-sm font-bold uppercase tracking-wider text-ink-mute">Questions to ask</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.95rem]">
                    {s.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm font-bold uppercase tracking-wider text-ink-mute">Where I&rsquo;m leaning today (optional)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.leanings.map((l) => (
                      <button
                        key={l}
                        className="chip min-h-0 py-2 text-[0.92rem]"
                        aria-pressed={leaning === l}
                        onClick={() => act("/api/plan", { method: "PATCH", body: { polstPrep: { [s.id]: leaning === l ? "" : l } } })}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <button className="btn btn-outline no-print" onClick={() => window.print()}>
              <Printer className="h-5 w-5" /> Print to bring to your appointment
            </button>
          </div>
        )}
      </section>

      <section className="card mt-6 p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <MessageCircleHeart className="h-6 w-6 text-clay" /> Talk with your family
        </h2>
        <ul className="mt-3 space-y-2 text-ink-soft">
          <li>Pick a calm moment, not a crisis. A holiday meal, a walk, or a phone call works.</li>
          <li>Share your private link first, so they can listen in their own time.</li>
          <li>It&rsquo;s okay if it feels hard. Saying &ldquo;I want you to know what matters to me&rdquo; is enough to begin.</li>
          <li>Tell your clinician too, and bring your summary to your next visit.</li>
        </ul>
      </section>
    </div>
  );
}
