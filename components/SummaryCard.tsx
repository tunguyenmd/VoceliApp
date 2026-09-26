"use client";

import { useState } from "react";
import { BadgeCheck, Mic, PenLine, Quote as QuoteIcon } from "lucide-react";
import type { ClipMeta, PromptId, SummaryDoc } from "@/lib/types";
import { NOT_A_LEGAL_DOCUMENT } from "@/lib/content/copy";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { AudioPlayer } from "./voice/AudioPlayer";
import { formatDate } from "./ui";

export function sourceLabel(sourceId: string, clips: Record<string, ClipMeta>): string {
  const [kind, id] = sourceId.split(":");
  if (kind === "clip") {
    const owner = clips[id]?.owner;
    return owner === "clarification" ? "your recorded follow-up" : `your recording: ${PROMPT_BY_ID[owner as PromptId]?.eyebrow ?? "answer"}`;
  }
  if (kind === "text") return `what you wrote: ${PROMPT_BY_ID[id as PromptId]?.eyebrow ?? "answer"}`;
  if (kind === "answer") return `your choices: ${PROMPT_BY_ID[id as PromptId]?.eyebrow ?? "answer"}`;
  if (kind === "clarify") return "your follow-up answer";
  return "your answers";
}

export function SummaryCard({
  summary,
  firstName,
  audience,
  clips,
  clipSrc,
  lastReviewed,
  editing,
  onEditHeadline,
  onEditSentence,
}: {
  summary: SummaryDoc;
  firstName: string;
  audience: "planner" | "family";
  clips: Record<string, ClipMeta>;
  clipSrc: (clipId: string) => string;
  lastReviewed?: string;
  editing?: boolean;
  onEditHeadline?: (text: string) => void;
  onEditSentence?: (section: string, index: number, text: string) => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const quotes = summary.quotes.filter((q) => !q.clipId || clips[q.clipId]);

  return (
    <article className="card overflow-hidden">
      <div className="relative bg-gradient-to-br from-dusk to-[#4a3f6b] px-6 pb-8 pt-7 text-white sm:px-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-clay/30 blur-3xl" />
        <p className="relative text-[0.8rem] font-bold uppercase tracking-[0.14em] text-white/70">
          {audience === "family" ? `${firstName}'s care wishes` : "Your values summary"}
        </p>
        {editing ? (
          <textarea
            className="relative mt-3 w-full rounded-xl bg-white/10 p-3 font-display text-2xl text-white outline-none ring-1 ring-white/30 focus:ring-gold"
            defaultValue={summary.headline.text}
            onBlur={(e) => onEditHeadline?.(e.target.value)}
            rows={2}
          />
        ) : (
          <h2 className="relative mt-3 font-display text-[1.8rem] leading-snug sm:text-[2.2rem]">{summary.headline.text}</h2>
        )}
        {lastReviewed && <p className="relative mt-4 text-sm text-white/70">Last reviewed {formatDate(lastReviewed)}</p>}
      </div>

      <div className="space-y-7 px-6 py-7 sm:px-10">
        {summary.sections.map((section) => (
          <section key={section.id}>
            <h3 className="eyebrow mb-2">{section.title}</h3>
            <div className="space-y-2">
              {section.sentences.map((s, i) =>
                editing ? (
                  <textarea
                    key={i}
                    className="field text-[1.05rem]"
                    defaultValue={s.text}
                    rows={2}
                    onBlur={(e) => onEditSentence?.(section.id, i, e.target.value)}
                  />
                ) : (
                  <div key={i}>
                    <p className="text-[1.12rem] leading-relaxed">{s.text}</p>
                    {showSources && s.sources.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {s.sources.map((src) => (
                          <span key={src} className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-0.5 text-[0.78rem] font-semibold text-ink-soft">
                            {src.startsWith("clip:") ? <Mic className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />}
                            {sourceLabel(src, clips)}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ),
              )}
            </div>
          </section>
        ))}

        {quotes.length > 0 && (
          <section>
            <h3 className="eyebrow mb-3">{audience === "family" ? `In ${firstName}'s own words` : "In my own words"}</h3>
            <ul className="space-y-3">
              {quotes.map((q, i) => (
                <li key={i} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                  <p className="flex gap-2 font-display text-[1.15rem] leading-snug">
                    <QuoteIcon className="mt-1 h-4 w-4 shrink-0 text-clay" />
                    <span>{q.text}</span>
                  </p>
                  {q.clipId && (
                    <div className="mt-3">
                      <AudioPlayer
                        src={clipSrc(q.clipId)}
                        segment={q.start !== undefined && q.end !== undefined ? { start: q.start, end: q.end } : undefined}
                        durationMs={clips[q.clipId]?.durationMs}
                        compact
                        tone="clay"
                        label={audience === "family" ? `Hear ${firstName} say it` : "Hear yourself say it"}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="border-t border-line bg-paper/70 px-6 py-5 sm:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            {summary.generator === "ai" ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> : <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-sage" />}
            <span>
              {summary.generator === "ai"
                ? `Every sentence is traced to ${audience === "family" ? `${firstName}'s` : "your"} own answers.`
                : `Built directly from ${audience === "family" ? `${firstName}'s` : "your"} answers.`}
              {summary.editedByUser ? ` Edited by ${audience === "family" ? firstName : "you"}.` : ""}
            </span>
          </p>
          {!editing && (
            <button className="no-print text-sm font-semibold text-dusk underline-offset-4 hover:underline" onClick={() => setShowSources((v) => !v)}>
              {showSources ? "Hide sources" : "Show where each line came from"}
            </button>
          )}
        </div>
        <p className="mt-3 text-[0.8rem] text-ink-mute">{NOT_A_LEGAL_DOCUMENT}</p>
      </footer>
    </article>
  );
}
