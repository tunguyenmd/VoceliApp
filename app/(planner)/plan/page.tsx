"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CalendarHeart, CheckCircle2, FileHeart, History, Landmark, MessageCircleHeart, Sparkles, Users } from "lucide-react";
import type { LifeEventType } from "@/lib/types";
import { LIFE_EVENTS, PROMPTS } from "@/lib/content/prompts";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { promptStatus } from "@/components/talk/ChapterProgress";
import { Banner, Spinner, formatDate } from "@/components/ui";

export default function PlanHome() {
  const { view } = usePlan();
  const act = usePlanAction();
  const [publishing, setPublishing] = useState(false);
  if (!view) return null;
  const { core } = view;
  const answered = PROMPTS.filter((p) => promptStatus(view, p.id) === "answered").length;
  const touched = PROMPTS.filter((p) => promptStatus(view, p.id) !== "todo").length;
  const activeShares = core.shares.filter((s) => s.status === "active").length;
  const invited = core.shares.filter((s) => s.status === "invited").length;
  const lastEvent = core.events[core.events.length - 1];
  const eventDue = lastEvent && core.nextReviewAt === lastEvent.createdAt;

  async function markReviewed() {
    setPublishing(true);
    try {
      await act("/api/publish", { method: "POST" });
    } finally {
      setPublishing(false);
    }
  }

  const cards = [
    {
      href: touched === PROMPTS.length ? "/review" : "/talk",
      icon: MessageCircleHeart,
      title: "Your conversation",
      status: touched === 0 ? "Not started" : `${answered} of ${PROMPTS.length} answered`,
      cta: touched === 0 ? "Begin" : touched === PROMPTS.length ? "Review" : "Continue",
      progress: touched / PROMPTS.length,
    },
    {
      href: "/summary",
      icon: FileHeart,
      title: "Values summary",
      status: !core.summary ? "Not created yet" : core.summary.approvedAt ? `Approved ${formatDate(core.summary.approvedAt)}` : "Draft, waiting for your approval",
      cta: core.summary ? "Open" : "Create",
    },
    {
      href: "/share",
      icon: Users,
      title: "Family",
      status: activeShares || invited ? `${activeShares} with access${invited ? `, ${invited} invited` : ""}` : "Not shared yet",
      cta: "Manage",
    },
    {
      href: "/next-steps",
      icon: Landmark,
      title: "Make it official",
      status: "State forms and POLST preparation",
      cta: "See steps",
    },
  ];

  const timeline = [
    ...core.versions.map((v) => ({ at: v.publishedAt, text: `Shared version ${v.version} with family`, kind: "version" as const })),
    ...core.events.map((e) => ({ at: e.createdAt, text: `${LIFE_EVENTS.find((x) => x.id === e.type)?.label}${e.note ? `: ${e.note}` : ""}`, kind: "event" as const })),
    { at: core.profile.createdAt, text: "Started your plan", kind: "start" as const },
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mx-auto max-w-4xl px-5 pt-8 sm:pt-12">
      {core.retention.memorialMode ? (
        <div className="mb-8">
          <Banner tone="plum">This plan is in memorial mode. It is preserved as it was last shared, and family access continues.</Banner>
        </div>
      ) : null}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow mb-2">My plan</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Hi, {core.profile.firstName}.</h1>
        <p className="mt-3 text-lg text-ink-soft">
          {core.lastReviewedAt
            ? `Last reviewed ${formatDate(core.lastReviewedAt)}. Next check-in ${formatDate(core.nextReviewAt)}.`
            : "Take your time. Everything saves as you go."}
        </p>
      </motion.div>

      {view.reviewDue && (
        <div className="mt-6">
          <Banner
            tone="gold"
            icon={<CalendarHeart className="h-6 w-6 text-clay" />}
            action={
              <div className="flex flex-wrap gap-2">
                <Link href="/review" className="btn btn-primary min-h-0 py-2">
                  Review my answers
                </Link>
                <button className="btn btn-outline min-h-0 py-2" onClick={markReviewed} disabled={publishing}>
                  {publishing ? <Spinner /> : null} Still right
                </button>
              </div>
            }
          >
            <p className="font-semibold">Time for a check-in.</p>
            <p className="text-ink-soft">
              {eventDue
                ? `You noted ${LIFE_EVENTS.find((x) => x.id === lastEvent.type)?.label.toLowerCase()}. Wishes often change after big moments like this.`
                : "It's been a year. People's wishes change, so we check in once a year to keep what your family sees current."}
            </p>
          </Banner>
        </div>
      )}

      {view.features.live && !core.retention.memorialMode && (
        <Link href="/live" className="group mt-8 flex flex-col overflow-hidden rounded-[1.75rem] bg-dusk text-white shadow-[var(--shadow-lift)] sm:flex-row">
          <img src="/linh-portrait.jpg" alt="" className="h-48 w-full object-cover sm:h-auto sm:w-56" />
          <div className="flex flex-1 flex-col justify-center p-6 sm:p-8">
            <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-gold">New · Talk it through</p>
            <h2 className="mt-2 font-display text-3xl">Prefer to talk? Linh can guide you.</h2>
            <p className="mt-2 text-white/80">
              Linh is an AI assistant, not a doctor or healthcare professional. She asks the questions out loud, one at a time, and saves your answers, in your own voice, as you go.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 font-semibold text-gold">
              Start a conversation <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((c, i) => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
            <Link href={c.href} className="card group flex h-full flex-col p-6 transition hover:shadow-[var(--shadow-lift)]">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand text-dusk">
                <c.icon className="h-6 w-6" />
              </span>
              <h2 className="mt-4 font-display text-2xl">{c.title}</h2>
              <p className="mt-1 flex-1 text-ink-soft">{c.status}</p>
              {c.progress !== undefined && (
                <div className="mt-4 h-2 rounded-full bg-sand">
                  <div className="h-2 rounded-full bg-dusk transition-all" style={{ width: `${Math.round(c.progress * 100)}%` }} />
                </div>
              )}
              <span className="mt-4 inline-flex items-center gap-1 font-semibold text-dusk">
                {c.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        <LifeEventCard />
        <section className="card p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <History className="h-5 w-5 text-ink-mute" /> History
          </h2>
          <ol className="mt-4 space-y-3">
            {timeline.slice(0, 8).map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${t.kind === "version" ? "bg-sage" : t.kind === "event" ? "bg-gold" : "bg-sand-deep"}`} />
                <span>
                  <span className="block text-[0.95rem]">{t.text}</span>
                  <span className="text-sm text-ink-mute">{formatDate(t.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function LifeEventCard() {
  const { view } = usePlan();
  const act = usePlanAction();
  const [type, setType] = useState<LifeEventType | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  if (!view) return null;

  return (
    <section className="card p-6 lg:col-span-3">
      <h2 className="flex items-center gap-2 font-display text-xl">
        <Sparkles className="h-5 w-5 text-gold" /> Has something changed?
      </h2>
      <p className="mt-1 text-ink-soft">A diagnosis, a hospital stay, a new grandchild, a loss. Big moments can change what matters. Log one and we&rsquo;ll check in now instead of waiting a year.</p>
      {saved ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-sage-soft p-4">
          <CheckCircle2 className="h-5 w-5 text-sage" /> Noted. Your plan is ready for a check-in whenever you are.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {LIFE_EVENTS.map((e) => (
              <button key={e.id} className="chip min-h-0 py-2 text-[0.92rem]" aria-pressed={type === e.id} onClick={() => setType(type === e.id ? null : e.id)}>
                {e.label}
              </button>
            ))}
          </div>
          {type && (
            <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">When</span>
                <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">A few words (optional)</span>
                <input className="field" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await act("/api/events", { body: { type, date, note: note || undefined } });
                  setSaved(true);
                  setType(null);
                  setNote("");
                }}
              >
                Log it
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
