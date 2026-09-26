"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, Check, FileHeart, PenLine, Printer, RefreshCw, Sparkles } from "lucide-react";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { SummaryCard } from "@/components/SummaryCard";
import { Banner, PageHeader, Spinner, formatDate } from "@/components/ui";

export default function SummaryPage() {
  const { view } = usePlan();
  const act = usePlanAction();
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!view) return null;
  const summary = view.core.summary;

  async function generate() {
    setGenerating(true);
    setNote(null);
    try {
      const r = await act<{ fallback?: string }>("/api/ai/summary", { method: "POST" });
      if (r.fallback === "ai-unavailable") setNote("AI drafting wasn't available, so this was built directly from your answers.");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 sm:pt-12">
      <PageHeader eyebrow="Values summary" title="Your wishes, on one page.">
        This is what your family will see first, alongside your recordings. Read it, change anything that doesn&rsquo;t sound like you, and approve it.
      </PageHeader>

      {!summary && (
        <div className="card flex flex-col items-center p-8 text-center sm:p-12">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gold-soft">
            <FileHeart className="h-8 w-8 text-clay" />
          </span>
          <p className="mt-5 max-w-md text-ink-soft">
            {view.features.ai
              ? "Heard will draft a short summary in your voice using only what you said and chose. Every line links back to your own answers."
              : "Heard will build a short summary directly from the choices you made."}
          </p>
          <button className="btn btn-primary mt-6" onClick={generate} disabled={generating}>
            {generating ? <Spinner /> : <Sparkles className="h-5 w-5" />}
            {generating ? "Writing your summary…" : "Create my summary"}
          </button>
          {generating && <div className="shimmer mt-8 h-40 w-full rounded-3xl" />}
        </div>
      )}

      {summary && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {note && (
            <div className="mb-4">
              <Banner tone="gold">{note}</Banner>
            </div>
          )}
          {summary.droppedCount > 0 && !summary.editedByUser && (
            <div className="no-print mb-4">
              <Banner tone="sage" icon={<BadgeCheck className="h-5 w-5 text-sage" />}>
                We removed {summary.droppedCount} draft line{summary.droppedCount > 1 ? "s" : ""} that couldn&rsquo;t be traced to your own answers.
              </Banner>
            </div>
          )}
          <SummaryCard
            summary={summary}
            firstName={view.core.profile.firstName}
            audience="planner"
            clips={view.core.clips}
            clipSrc={(id) => `/api/clips/${id}`}
            lastReviewed={view.core.lastReviewedAt}
            editing={editing}
            onEditHeadline={(text) => act("/api/ai/summary", { method: "PATCH", body: { headline: text } })}
            onEditSentence={(section, index, text) => act("/api/ai/summary", { method: "PATCH", body: { sentences: [{ section, index, text }] } })}
          />

          <div className="no-print mt-6 flex flex-wrap items-center gap-2">
            {editing ? (
              <button className="btn btn-primary" onClick={() => setEditing(false)}>
                <Check className="h-5 w-5" /> Done editing
              </button>
            ) : (
              <>
                {summary.approvedAt ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-sage-soft px-4 py-2 font-semibold text-sage">
                    <BadgeCheck className="h-5 w-5" /> Approved {formatDate(summary.approvedAt)}
                  </span>
                ) : (
                  <button className="btn btn-primary" onClick={() => act("/api/ai/summary", { method: "PATCH", body: { approve: true } })}>
                    <Check className="h-5 w-5" /> This sounds like me
                  </button>
                )}
                <button className="btn btn-outline" onClick={() => setEditing(true)}>
                  <PenLine className="h-5 w-5" /> Edit
                </button>
                <button className="btn btn-quiet" onClick={generate} disabled={generating}>
                  {generating ? <Spinner /> : <RefreshCw className="h-5 w-5" />} Redo
                </button>
                <button className="btn btn-quiet" onClick={() => window.print()}>
                  <Printer className="h-5 w-5" /> Print
                </button>
              </>
            )}
          </div>

          {summary.approvedAt && !editing && (
            <div className="no-print mt-10 flex flex-col items-center gap-2 text-center">
              <Link href="/share" className="btn btn-primary">
                Share with family <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/next-steps" className="text-[0.95rem] font-semibold text-dusk underline-offset-4 hover:underline">
                Or see how to make your wishes official in your state
              </Link>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
