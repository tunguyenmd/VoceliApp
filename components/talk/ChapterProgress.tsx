"use client";

import Link from "next/link";
import type { PlannerView } from "@/lib/server/views";
import type { PromptId } from "@/lib/types";
import { CHAPTERS, PROMPTS } from "@/lib/content/prompts";

export function promptStatus(view: PlannerView, id: PromptId): "answered" | "skipped" | "todo" {
  if (id === "disclosure") return (view.disclosure?.status as "answered" | "skipped") ?? "todo";
  return view.core.answers[id]?.status ?? "todo";
}

export function ChapterProgress({ view, current }: { view: PlannerView; current: PromptId }) {
  const currentChapter = PROMPTS.find((p) => p.id === current)?.chapter;
  return (
    <nav aria-label="Conversation progress" className="mb-6">
      <ol className="flex gap-2">
        {CHAPTERS.map((ch) => {
          const prompts = PROMPTS.filter((p) => p.chapter === ch.id);
          const active = ch.id === currentChapter;
          return (
            <li key={ch.id} className="min-w-0 flex-1">
              <div className="flex gap-1">
                {prompts.map((p) => {
                  const st = promptStatus(view, p.id);
                  return (
                    <Link
                      key={p.id}
                      href={`/talk/${p.id}`}
                      aria-label={`${p.eyebrow}${st === "answered" ? " (answered)" : st === "skipped" ? " (skipped)" : ""}`}
                      aria-current={p.id === current ? "step" : undefined}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${p.id === current ? "bg-clay" : st === "answered" ? "bg-dusk" : st === "skipped" ? "bg-sand-deep" : "bg-sand-deep/60"}`}
                    />
                  );
                })}
              </div>
              <p className={`mt-2 hidden truncate text-[0.78rem] font-bold uppercase tracking-wider sm:block ${active ? "text-ink" : "text-ink-mute"}`}>{ch.title}</p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
