"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Download, Heart, Lock, Mic, Search, Siren } from "lucide-react";
import type { ClipMeta, PromptId, Quote } from "@/lib/types";
import { DISCLOSURE_VIEW_NOTE, NOT_A_LEGAL_DOCUMENT } from "@/lib/content/copy";
import { LIFE_EVENTS, PROMPT_BY_ID, PROMPTS } from "@/lib/content/prompts";
import { api } from "@/lib/client/api";
import type { FamilyView } from "@/lib/server/views";
import { SummaryCard } from "../SummaryCard";
import { AudioPlayer } from "../voice/AudioPlayer";
import { Spinner, formatDate } from "../ui";

interface AskResult {
  status: "addressed" | "related" | "not_addressed";
  answer: string;
  citations: Quote[];
  aboutDisclosure: boolean;
}

export function FamilyPlan({ view, firstName, canAsk }: { view: FamilyView; firstName: string; canAsk: boolean }) {
  const plan = view.plan;
  const shareId = view.share.id;
  const clipSrc = (id: string) => `/api/clips/${id}?s=${shareId}`;

  if (!plan) {
    return (
      <div className="card p-8 text-center">
        <h1 className="font-display text-3xl">Nothing to show yet.</h1>
        <p className="mt-3 text-ink-soft">{firstName} hasn&rsquo;t shared their plan yet. Check back soon.</p>
      </div>
    );
  }

  const clips: Record<string, ClipMeta> = Object.fromEntries(plan.clips.map((c) => [c.id, c]));
  const recorded = PROMPTS.filter((p) => p.id !== "family_message" && p.id !== "disclosure")
    .map((p) => ({ prompt: p, answer: plan.answers.find((a) => a.promptId === p.id) }))
    .filter((x) => x.answer && x.answer.clipIds.length > 0);
  const message = plan.answers.find((a) => a.promptId === "family_message" && a.clipIds.length > 0);
  const clarClips = plan.clarifications.filter((c) => c.clipIds.length || c.text);
  const reviewedAfter = plan.reviewedAfter ? LIFE_EVENTS.find((e) => e.id === plan.reviewedAfter!.type)?.label.toLowerCase() : null;

  return (
    <div className="space-y-8">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow mb-2">Shared with {view.share.name}</p>
        <h1 className="font-display text-[2.4rem] leading-tight sm:text-5xl">{firstName}&rsquo;s care wishes</h1>
        <p className="mt-3 text-lg text-ink-soft">
          Last reviewed {formatDate(plan.lastReviewedAt)}
          {reviewedAfter ? `, after ${reviewedAfter}` : ""}. In {firstName}&rsquo;s own words and voice.
        </p>
      </motion.header>

      {canAsk && <AskBox shareId={shareId} firstName={firstName} clipSrc={clipSrc} clips={clips} hasDisclosure={plan.hasDisclosure} />}

      {plan.summary && <SummaryCard summary={plan.summary} firstName={firstName} audience="family" clips={clips} clipSrc={clipSrc} lastReviewed={plan.lastReviewedAt} />}

      {plan.hasDisclosure && <DisclosureReveal shareId={shareId} firstName={firstName} clipSrc={clipSrc} />}

      {recorded.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 font-display text-3xl">
            <Mic className="h-6 w-6 text-clay" /> In {firstName}&rsquo;s voice
          </h2>
          <ul className="mt-4 space-y-3">
            {recorded.map(({ prompt, answer }) => (
              <li key={prompt.id} className="card p-5">
                <p className="eyebrow">{prompt.eyebrow}</p>
                <p className="mt-1 font-display text-xl leading-snug">{prompt.question}</p>
                <div className="mt-4 space-y-3">
                  {answer!.clipIds.map((id, i) => (
                    <ClipBlock key={id} clip={clips[id]} src={clipSrc(id)} label={i === 0 ? `Play ${firstName}'s answer` : `Part ${i + 1}`} transcript={view.transcripts[id]} />
                  ))}
                </div>
              </li>
            ))}
            {clarClips.map((c) => (
              <li key={c.noteId} className="card p-5">
                <p className="eyebrow">A follow-up {firstName} answered</p>
                <p className="mt-1 font-display text-xl leading-snug">{c.question}</p>
                {c.text && <p className="mt-3 rounded-xl bg-sand p-3">{c.text}</p>}
                <div className="mt-3 space-y-3">
                  {c.clipIds.map((id) => (
                    <ClipBlock key={id} clip={clips[id]} src={clipSrc(id)} label={`Play ${firstName}'s answer`} transcript={view.transcripts[id]} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {message && (
        <section className="card overflow-hidden">
          <div className="bg-gradient-to-br from-clay-soft to-gold-soft p-6 sm:p-8">
            <p className="eyebrow flex items-center gap-2">
              <Heart className="h-4 w-4 text-clay" /> A message for you
            </p>
            <h2 className="mt-2 font-display text-3xl">From {firstName}, to the people they love</h2>
            <div className="mt-5 space-y-3">
              {message.clipIds.map((id) => (
                <ClipBlock key={id} clip={clips[id]} src={clipSrc(id)} label="Listen" transcript={view.transcripts[id]} tone="clay" />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-[1.75rem] bg-dusk p-6 text-white sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Siren className="h-6 w-6 text-gold" /> If {firstName} is in the hospital
        </h2>
        <ul className="mt-3 space-y-2 text-white/85">
          <li>Show this page to the care team. It helps them understand what matters to {firstName}.</li>
          <li>Ask whether {firstName} has an advance directive or a POLST on file. Those are the legal documents.</li>
          <li>You don&rsquo;t have to decide alone. The care team, including palliative care, can help.</li>
        </ul>
        <p className="mt-4 text-sm text-white/60">{NOT_A_LEGAL_DOCUMENT}</p>
      </section>
    </div>
  );
}

function ClipBlock({ clip, src, label, transcript, tone = "dusk" }: { clip?: ClipMeta; src: string; label: string; transcript?: string; tone?: "dusk" | "clay" }) {
  const [saving, setSaving] = useState(false);
  if (!clip) return null;
  return (
    <div className="rounded-2xl bg-white/80 p-3 ring-1 ring-line">
      <AudioPlayer src={src} durationMs={clip.durationMs} label={label} tone={tone} />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1">
        {transcript && (
          <details className="text-[0.95rem] text-ink-soft">
            <summary className="cursor-pointer text-sm font-semibold text-ink-mute">Read the words</summary>
            <p className="mt-1">{transcript}</p>
          </details>
        )}
        <a
          href={`${src}&download=1`}
          onClick={() => {
            setSaving(true);
            setTimeout(() => setSaving(false), 1500);
          }}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-mute hover:text-ink"
          title="Please keep saved copies private."
        >
          {saving ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} Save a copy
        </a>
        {clip.synthetic && <span className="text-sm text-ink-mute">Demo voice (computer-generated)</span>}
      </div>
    </div>
  );
}

function DisclosureReveal({ shareId, firstName, clipSrc }: { shareId: string; firstName: string; clipSrc: (id: string) => string }) {
  const [data, setData] = useState<{ label: string | null; description: string | null; unsure: boolean; who: string | null; text: string | null; clipIds: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section id="being-told" className="card overflow-hidden border-plum/30">
      <div className="p-6 sm:p-8">
        <p className="eyebrow flex items-center gap-2 text-plum">
          <Lock className="h-4 w-4" /> Being told
        </p>
        <h2 className="mt-2 font-display text-3xl">How {firstName} wants to hear serious news</h2>
        <p className="mt-2 text-ink-soft">{DISCLOSURE_VIEW_NOTE}</p>
        <AnimatePresence mode="wait">
          {!data ? (
            <motion.button
              key="btn"
              exit={{ opacity: 0 }}
              className="btn mt-5 bg-plum text-white"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setData(await api(`/api/share-access/${shareId}/disclosure`, { method: "POST" }));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner /> : <Lock className="h-5 w-5" />} Show me
            </motion.button>
          ) : (
            <motion.div key="data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl bg-plum-soft p-5">
              <p className="font-display text-2xl">{data.unsure ? `${firstName} wasn't sure yet.` : data.label}</p>
              {data.description && !data.unsure && <p className="mt-1 text-ink-soft">{data.description}</p>}
              {data.who && (
                <p className="mt-3">
                  <span className="font-semibold">Who should be there, or hear it first:</span> {data.who}
                </p>
              )}
              {data.text && <p className="mt-3 italic">&ldquo;{data.text}&rdquo;</p>}
              {data.clipIds.map((id) => (
                <div key={id} className="mt-4">
                  <AudioPlayer src={clipSrc(id)} label={`Hear ${firstName}`} tone="plum" />
                </div>
              ))}
              <p className="mt-4 text-sm text-plum">Your view was recorded in {firstName}&rsquo;s access log.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function AskBox({ shareId, firstName, clipSrc, clips, hasDisclosure }: { shareId: string; firstName: string; clipSrc: (id: string) => string; clips: Record<string, ClipMeta>; hasDisclosure: boolean }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const examples = [`Would ${firstName} want to be kept on machines?`, `What makes a good day for ${firstName}?`, `Where does ${firstName} want to be cared for?`];

  async function ask(question: string) {
    setQ(question);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<AskResult>(`/api/share-access/${shareId}/ask`, { body: { question } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 3) void ask(q.trim());
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor="ask">
          Find what {firstName} said
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
          <input id="ask" className="field pl-12" placeholder={`What did ${firstName} say about…`} value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} />
        </div>
        <button className="btn btn-primary" disabled={busy || q.trim().length < 3} aria-label="Search">
          {busy ? <Spinner /> : <ArrowRight className="h-5 w-5" />}
        </button>
      </form>
      {!result && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button key={ex} className="rounded-full bg-sand px-3 py-1.5 text-[0.9rem] text-ink-soft hover:bg-sand-deep" onClick={() => ask(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
      {busy && <div className="shimmer mt-4 h-24 rounded-2xl" />}
      {error && <p className="mt-3 text-clay">{error}</p>}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <p className="text-[1.08rem]">{result.answer}</p>
            {result.citations.length > 0 && (
              <ul className="mt-4 space-y-3">
                {result.citations.map((c, i) => (
                  <li key={i} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                    {c.sourceId.startsWith("answer:") ? (
                      <p className="text-[1rem]">{choiceText(c.text)}</p>
                    ) : (
                      <p className="font-display text-[1.1rem]">&ldquo;{c.text}&rdquo;</p>
                    )}
                    <p className="mt-1 text-sm text-ink-mute">{citationLabel(c, clips)}</p>
                    {c.clipId && clips[c.clipId] && (
                      <div className="mt-3">
                        <AudioPlayer
                          src={clipSrc(c.clipId)}
                          segment={c.start !== undefined && c.end !== undefined ? { start: c.start, end: c.end } : undefined}
                          durationMs={clips[c.clipId].durationMs}
                          compact
                          tone="clay"
                          label={`Hear ${firstName} say it`}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {result.aboutDisclosure && hasDisclosure && (
              <a href="#being-told" className="mt-4 inline-flex items-center gap-2 font-semibold text-plum">
                <Lock className="h-4 w-4" /> See how {firstName} wants to hear serious news
              </a>
            )}
            <p className="mt-4 text-sm text-ink-mute">This only finds what {firstName} said. It can&rsquo;t tell you what to decide. For medical decisions, talk with the care team.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Structured answers are rendered for the model as "Selected: …" / "Chose 2 of 5, …"; show them as choices. */
function choiceText(text: string) {
  return text.replace(/^Selected:\s*/, "").replace(/^Chose \d of 5, /, "").replace(/\.$/, "");
}

function citationLabel(c: Quote, clips: Record<string, ClipMeta>) {
  const [kind, id] = c.sourceId.split(":");
  const owner = kind === "clip" ? clips[id]?.owner : id;
  const eyebrow = owner && owner !== "clarification" ? PROMPT_BY_ID[owner as PromptId]?.eyebrow : "A follow-up answer";
  return kind === "clip" ? `From a recording · ${eyebrow ?? ""}` : kind === "answer" ? `What they chose · ${eyebrow ?? ""}` : `In their words · ${eyebrow ?? ""}`;
}
