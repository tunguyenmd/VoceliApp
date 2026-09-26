"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Keyboard, Lock, MessageCircleQuestion, Mic, PencilLine, ScanSearch, Scale } from "lucide-react";
import type { ClarityNote } from "@/lib/types";
import { CHAPTERS, PROMPTS, disclosureLabel, optionLabel, spectrumStop } from "@/lib/content/prompts";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { PageHeader, Spinner } from "@/components/ui";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { promptStatus } from "@/components/talk/ChapterProgress";
import type { PlannerView } from "@/lib/server/views";

function answerLine(view: PlannerView, id: (typeof PROMPTS)[number]["id"]): string | null {
  if (id === "disclosure") {
    const d = view.disclosure;
    if (!d || d.status !== "answered") return null;
    return d.unsure ? "Not sure yet" : (disclosureLabel(d.choice)?.label ?? (d.clipIds.length ? "Recorded" : d.text ? "Written" : null));
  }
  const a = view.core.answers[id];
  if (!a || a.status !== "answered") return null;
  if (a.selected?.length) {
    const labels = a.selected.filter((x) => x !== "other").map((x) => optionLabel(id, x));
    if (a.selected.includes("other") && a.otherText) labels.push(a.otherText);
    return labels.join(" · ");
  }
  if (a.spectrum) return spectrumStop(a.spectrum)?.label ?? null;
  if (a.unsure) return "Not sure yet";
  if (a.text) return a.text.length > 140 ? `${a.text.slice(0, 140)}…` : a.text;
  const spoken = a.clipIds.map((c) => view.transcripts[c]).find(Boolean);
  if (spoken) return `\u201c${spoken.length > 140 ? `${spoken.slice(0, 140)}…` : spoken}\u201d`;
  return a.clipIds.length ? "Recorded in your voice" : null;
}

export default function ReviewPage() {
  const { view } = usePlan();
  const act = usePlanAction();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  if (!view) return null;

  const notes = view.core.clarity.filter((n) => n.state !== "dismissed");
  const answeredCount = PROMPTS.filter((p) => promptStatus(view, p.id) === "answered").length;

  async function runCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      const r = await act<{ skipped?: string }>("/api/ai/clarity", { method: "POST" });
      if (r.skipped === "ai-unavailable") setCheckError("The clarity check isn't available right now. You can still continue.");
    } catch (e) {
      setCheckError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 sm:pt-12">
      <PageHeader eyebrow="Review" title="Here's what you've shared.">
        {answeredCount} of {PROMPTS.length} answered. Anything you skipped is fine to leave; you can come back any time.
      </PageHeader>

      <div className="space-y-6">
        {CHAPTERS.map((ch) => (
          <section key={ch.id} className="card p-5 sm:p-6">
            <h2 className="font-display text-2xl">{ch.title}</h2>
            <ul className="mt-3 divide-y divide-line">
              {PROMPTS.filter((p) => p.chapter === ch.id).map((p) => {
                const st = promptStatus(view, p.id);
                const line = answerLine(view, p.id);
                const clipCount = p.id === "disclosure" ? (view.disclosure?.clipIds.length ?? 0) : (view.core.answers[p.id]?.clipIds.length ?? 0);
                return (
                  <li key={p.id} className="flex items-start gap-4 py-3.5">
                    <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${st === "answered" ? "bg-sage text-white" : "bg-sand-deep"}`}>
                      {st === "answered" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        {p.eyebrow}
                        {p.sensitive && <Lock className="h-3.5 w-3.5 text-plum" />}
                      </p>
                      <p className="text-ink-soft">{line ?? (st === "skipped" ? "Skipped" : "Not answered yet")}</p>
                      {clipCount > 0 && (
                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-clay">
                          <Mic className="h-3.5 w-3.5" /> {clipCount} recording{clipCount > 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <Link href={`/talk/${p.id}`} className="btn btn-quiet min-h-0 px-3 py-1.5 text-[0.9rem]">
                      <PencilLine className="h-4 w-4" /> {st === "answered" ? "Edit" : "Answer"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-10">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-gold-soft to-sand p-6 sm:p-8">
            <p className="eyebrow mb-2 flex items-center gap-2">
              <ScanSearch className="h-4 w-4" /> Clarity check
            </p>
            <h2 className="font-display text-3xl leading-tight">Will your family know what you meant?</h2>
            <p className="mt-2 text-ink-soft">
              Wishes are often hard to follow at the bedside because a few words can be read two ways. Heard reads your answers the way a
              loving family member might and points out anything unclear. It never judges your choices, and it doesn&rsquo;t look at questions you skipped.
            </p>
            {view.features.ai ? (
              <button className="btn btn-primary mt-5" onClick={runCheck} disabled={checking}>
                {checking ? <Spinner /> : <ScanSearch className="h-5 w-5" />}
                {checking ? "Reading your answers…" : view.core.clarityCheckedAt ? "Check again" : "Run the clarity check"}
              </button>
            ) : (
              <p className="mt-4 text-sm text-ink-mute">AI assistance is off, so the clarity check isn&rsquo;t available. You can turn it on in Privacy.</p>
            )}
            {checkError && <p className="mt-3 text-[0.95rem] text-clay">{checkError}</p>}
          </div>

          <div className={`space-y-4 p-5 sm:p-6 ${!checking && !view.core.clarityCheckedAt && notes.length === 0 ? "hidden" : ""}`}>
            {checking && (
              <div className="space-y-3" aria-busy="true">
                <div className="shimmer h-24 rounded-2xl" />
                <div className="shimmer h-24 rounded-2xl" />
              </div>
            )}
            {!checking && view.core.clarityCheckedAt && notes.length === 0 && (
              <p className="flex items-center gap-2 rounded-2xl bg-sage-soft p-4">
                <Check className="h-5 w-5 text-sage" /> Nothing unclear stood out. Your family should be able to follow your wishes.
              </p>
            )}
            <AnimatePresence>
              {!checking && notes.map((n) => <ClarityCard key={n.id} note={n} />)}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <Link href="/summary" className="btn btn-primary">
          Create my values summary <ArrowRight className="h-5 w-5" />
        </Link>
        <p className="text-sm text-ink-mute">You&rsquo;ll see it and approve it before anyone else does.</p>
      </div>
    </div>
  );
}

function ClarityCard({ note }: { note: ClarityNote }) {
  const { view } = usePlan();
  const act = usePlanAction();
  const [mode, setMode] = useState<"idle" | "voice" | "text">("idle");
  const [text, setText] = useState(note.response?.text ?? "");
  const answered = note.state === "answered";
  if (!view) return null;

  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={`rounded-2xl p-5 ring-1 ${answered ? "bg-sage-soft/60 ring-sage/30" : "bg-white ring-line"}`}>
      <p className="mb-1 flex items-center gap-2 text-[0.8rem] font-bold uppercase tracking-wider text-ink-mute">
        {note.kind === "tension" ? <Scale className="h-4 w-4 text-gold" /> : <MessageCircleQuestion className="h-4 w-4 text-gold" />}
        {note.kind === "tension" ? "Two answers that could pull different ways" : "Words that could be read two ways"}
      </p>
      <h3 className="font-display text-xl">{note.title}</h3>
      <p className="mt-1 text-ink-soft">{note.body}</p>
      {note.quotes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {note.quotes.map((q, i) => (
            <li key={i} className="border-l-4 border-gold/60 pl-3 italic text-ink-soft">
              &ldquo;{q.text}&rdquo;
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 font-semibold">{note.followUp}</p>

      {answered && note.response?.text && mode !== "text" && <p className="mt-2 rounded-xl bg-white p-3">{note.response.text}</p>}

      {mode === "voice" || (note.response?.clipIds.length ?? 0) > 0 ? (
        <div className="mt-3">
          <VoicePanel
            owner="clarification"
            clarificationId={note.id}
            limitSec={90}
            targetSec={45}
            cue="Answer in a sentence or two."
            clipIds={note.response?.clipIds ?? []}
            live={view.features.stt}
          />
        </div>
      ) : null}

      {mode === "text" && (
        <div className="mt-3">
          <textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="In your own words…" />
          <div className="mt-2 flex gap-2">
            <button
              className="btn btn-primary min-h-0 py-2"
              onClick={async () => {
                await act(`/api/clarity/${note.id}`, { body: { action: "answer", text } });
                setMode("idle");
              }}
            >
              Save
            </button>
            <button className="btn btn-quiet min-h-0 py-2" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-outline min-h-0 py-2" onClick={() => setMode("voice")}>
            <Mic className="h-4 w-4" /> Answer by voice
          </button>
          <button className="btn btn-outline min-h-0 py-2" onClick={() => setMode("text")}>
            <Keyboard className="h-4 w-4" /> {answered && note.response?.text ? "Edit" : "Type an answer"}
          </button>
          {!answered && (
            <button className="btn btn-quiet min-h-0 py-2" onClick={() => act(`/api/clarity/${note.id}`, { body: { action: "dismiss" } })}>
              It&rsquo;s fine as is
            </button>
          )}
        </div>
      )}
    </motion.article>
  );
}
