"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Cpu, Download, Eye, FastForward, FileLock2, Flower2, HardDrive, KeyRound, Lock, Mic, ShieldCheck, ShieldX, Trash2, UserCheck, UserX } from "lucide-react";
import type { AuditEntry, ChainStatus } from "@/lib/types";
import { api } from "@/lib/client/api";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { PageHeader, Spinner, Toggle, formatDateTime } from "@/components/ui";

interface AuditPayload {
  access: AuditEntry[];
  disclosure: AuditEntry[];
  status: { access: ChainStatus; disclosure: ChainStatus };
  atRest: { core: string | null; disclosure: string | null };
}

const ACTION_ICON: Record<string, typeof Eye> = {
  "share.created": UserCheck,
  "share.accepted": UserCheck,
  "share.revoked": UserX,
  "share.changed": UserCheck,
  "access.denied": ShieldX,
  "recording.played": Mic,
  "recording.saved": Download,
  "plan.published": FileLock2,
  "plan.viewed": Eye,
  "plan.asked": Eye,
  "disclosure.viewed": Eye,
};

export default function PrivacyPage() {
  const { view } = usePlan();
  const act = usePlanAction();
  const router = useRouter();
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => api<AuditPayload>("/api/audit").then(setAudit).catch(() => {}), []);
  useEffect(() => {
    void load();
  }, [load, view?.core.shares.length, view?.core.versions.length]);

  if (!view) return null;
  const { core } = view;

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 sm:pt-12">
      <PageHeader eyebrow="Privacy" title="You decide who hears you.">
        Your recordings and your wishes are sensitive health information, so we treat them that way, even though no clinician is involved.
      </PageHeader>

      <section className="card p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <KeyRound className="h-6 w-6 text-dusk" /> Locked three ways
        </h2>
        <p className="mt-2 text-ink-soft">Everything is encrypted at rest (AES-256-GCM) and in transit. Your plan uses three separate keys, so one never unlocks another.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: FileLock2, title: "Your answers", text: "Choices, summary, sharing settings." },
            { icon: Mic, title: "Your voice", text: "Recordings and transcripts, which are a second copy of your words." },
            { icon: Lock, title: "Being told", text: "Your diagnosis preference, with its own access log. Never sent to AI." },
          ].map((k) => (
            <div key={k.title} className="rounded-2xl bg-sand p-4">
              <k.icon className="h-5 w-5 text-dusk" />
              <p className="mt-2 font-semibold">{k.title}</p>
              <p className="text-[0.9rem] text-ink-soft">{k.text}</p>
            </div>
          ))}
        </div>
        {audit?.atRest.core && (
          <div className="mt-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-mute">
              <HardDrive className="h-4 w-4" /> What your plan looks like on our disk
            </p>
            <code className="mt-2 block break-all rounded-xl bg-ink px-4 py-3 text-[0.78rem] leading-relaxed text-sage-soft">{audit.atRest.core.match(/.{1,2}/g)?.join(" ")} …</code>
          </div>
        )}
      </section>

      <section className="card mt-6 p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Cpu className="h-6 w-6 text-dusk" /> Help from AI, on your terms
        </h2>
        <div className="mt-5 space-y-5">
          <Toggle
            checked={core.profile.aiAssist}
            onChange={(v) => act("/api/plan", { method: "PATCH", body: { aiAssist: v } })}
            label="AI assistance"
            description={`${view.processing.ai}. Requests are sent with retention turned off, and they are not used to train models. Suggestions only quote your own words, and nothing changes unless you approve it.`}
          />
          <Toggle
            checked={core.profile.transcription}
            onChange={(v) => act("/api/plan", { method: "PATCH", body: { transcription: v } })}
            label="Live captions and transcripts"
            description={`${view.processing.stt}. Transcripts are encrypted like your recordings. Your diagnosis preference recording is never transcribed.`}
          />
        </div>
        <p className="mt-5 rounded-2xl bg-sand p-4 text-[0.93rem] text-ink-soft">
          No advertising or analytics trackers run on this site. We never create a voiceprint or an artificial copy of your voice.
        </p>
      </section>

      <section className="card mt-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Eye className="h-6 w-6 text-dusk" /> Who has seen what
          </h2>
          {audit && <ChainBadge status={audit.status.access} />}
        </div>
        <AuditList entries={audit?.access} empty="No one has accessed your plan yet." />
      </section>

      <section className="card mt-6 border-plum/30 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Lock className="h-6 w-6 text-plum" /> Your diagnosis preference log
          </h2>
          {audit && <ChainBadge status={audit.status.disclosure} />}
        </div>
        <p className="mt-2 text-ink-soft">Because this choice shapes what your family tells you in a crisis, every change and every view of it is recorded here, separately.</p>
        <AuditList entries={audit?.disclosure} empty="No one has viewed it." />
      </section>

      <RetentionSection />

      <section className="card mt-6 border-clay/30 p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Trash2 className="h-6 w-6 text-clay" /> Delete my plan
        </h2>
        <p className="mt-2 text-ink-soft">
          {core.retention.onAccountDelete === "revoke_all"
            ? "Deleting destroys your plan's encryption keys, so every copy on our servers becomes unreadable, and family access ends immediately. Copies family members saved to their own devices stay with them."
            : "Your drafts and private answers will be erased. What you already shared stays available to the people you chose."}
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-semibold">Type your first name to confirm</span>
          <input className="field max-w-xs" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
        </label>
        <button
          className="btn mt-3 bg-clay text-white"
          disabled={confirmDelete.trim().toLowerCase() !== core.profile.firstName.toLowerCase() || deleting}
          onClick={async () => {
            setDeleting(true);
            await api("/api/plan", { method: "DELETE" });
            router.replace("/");
          }}
        >
          {deleting ? <Spinner /> : <Trash2 className="h-5 w-5" />} Delete everything
        </button>
      </section>

      {view.features.demo && <DemoTools onChange={load} />}
    </div>
  );
}

function ChainBadge({ status }: { status: ChainStatus }) {
  return status.ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-sm font-semibold text-sage" title={`Chain head ${status.head}`}>
      <ShieldCheck className="h-4 w-4" /> Tamper check passed · {status.entries} {status.entries === 1 ? "entry" : "entries"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-3 py-1 text-sm font-semibold text-clay">
      <ShieldX className="h-4 w-4" /> Log altered at entry {status.brokenAt}
    </span>
  );
}

function AuditList({ entries, empty }: { entries?: AuditEntry[]; empty: string }) {
  if (!entries) return <div className="shimmer mt-4 h-20 rounded-2xl" />;
  if (!entries.length) return <p className="mt-4 text-ink-mute">{empty}</p>;
  return (
    <ol className="mt-4 space-y-3">
      {entries.slice(0, 30).map((e) => {
        const Icon = ACTION_ICON[e.action] ?? Clock;
        const who = e.actor.kind === "planner" ? "You" : e.actor.kind === "family" ? e.actor.name : "Heard";
        return (
          <li key={e.seq} className="flex gap-3">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${e.actor.kind === "family" ? "bg-gold-soft" : "bg-sand"}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.95rem]">
                <span className="font-semibold">{who}</span> · {describe(e)}
              </p>
              <p className="text-[0.8rem] text-ink-mute">
                {formatDateTime(e.ts)} · #{e.seq} · <span className="font-mono">{e.hash.slice(0, 10)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function describe(e: AuditEntry): string {
  if (e.detail) return e.detail;
  const map: Record<string, string> = {
    "plan.published": `Shared an updated version${e.resource ? ` (${e.resource})` : ""}`,
    "disclosure.updated": "Updated the preference",
    "disclosure.skipped": "Skipped the question",
    "disclosure.recorded": "Recorded an answer",
    "settings.changed": "Changed settings",
  };
  return map[e.action] ?? e.action;
}

function RetentionSection() {
  const { view } = usePlan();
  const act = usePlanAction();
  const [legacyName, setLegacyName] = useState(view?.core.retention.legacyContact?.name ?? "");
  if (!view) return null;
  const r = view.core.retention;
  return (
    <section className="card mt-6 p-6 sm:p-8">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <Flower2 className="h-6 w-6 text-dusk" /> Your plan over time
      </h2>
      <fieldset className="mt-5">
        <legend className="font-semibold">If I delete my account</legend>
        <div className="mt-2 space-y-2">
          {[
            { v: "revoke_all", label: "End everyone's access and erase everything", hint: "Recommended." },
            { v: "keep_shared", label: "Keep what I already shared available to my family", hint: "Drafts and private answers are still erased." },
          ].map((o) => (
            <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 ${r.onAccountDelete === o.v ? "bg-sand ring-dusk/40" : "ring-line"}`}>
              <input
                type="radio"
                name="onDelete"
                className="mt-1 h-5 w-5 accent-[#3d405b]"
                checked={r.onAccountDelete === o.v}
                onChange={() => act("/api/plan", { method: "PATCH", body: { retention: { onAccountDelete: o.v } } })}
              />
              <span>
                <span className="block font-semibold">{o.label}</span>
                <span className="text-[0.93rem] text-ink-soft">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-6">
        <p className="font-semibold">Legacy contact</p>
        <p className="text-[0.93rem] text-ink-soft">
          The person who can tell us you have died. We then keep your plan as it is, in memorial mode, so your family can keep listening, and we stop reminders.
        </p>
        <div className="mt-2 flex gap-2">
          <input className="field max-w-xs" placeholder="Their name" value={legacyName} onChange={(e) => setLegacyName(e.target.value)} />
          <button className="btn btn-outline" onClick={() => act("/api/plan", { method: "PATCH", body: { retention: { legacyContact: legacyName.trim() ? { name: legacyName.trim() } : null } } })}>
            Save
          </button>
        </div>
      </div>
      <div className="mt-6">
        <label className="font-semibold">
          If I stop signing in for{" "}
          <select
            className="field inline-block w-auto py-1.5"
            value={r.inactiveYears}
            onChange={(e) => act("/api/plan", { method: "PATCH", body: { retention: { inactiveYears: Number(e.target.value) } } })}
          >
            {[2, 3, 5].map((y) => (
              <option key={y} value={y}>
                {y} years
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-[0.93rem] text-ink-soft">…we&rsquo;ll check in with you, then with your legacy contact, before anything changes. Nothing is ever deleted silently.</p>
      </div>
    </section>
  );
}

function DemoTools({ onChange }: { onChange: () => void }) {
  const act = usePlanAction();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (action: string) => {
    setBusy(action);
    try {
      await act("/api/demo", { body: { action } });
      onChange();
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="no-print mt-6 rounded-[1.75rem] border-2 border-dashed border-line p-6">
      <p className="eyebrow mb-3">Demo tools</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-outline min-h-0 py-2" onClick={() => run("advance-year")} disabled={!!busy}>
          <FastForward className="h-4 w-4" /> Jump ahead one year
        </button>
        <button className="btn btn-outline min-h-0 py-2" onClick={() => run("reset-clock")} disabled={!!busy}>
          <Clock className="h-4 w-4" /> Back to today
        </button>
        <button className="btn btn-outline min-h-0 py-2" onClick={() => run("memorial")} disabled={!!busy}>
          <Flower2 className="h-4 w-4" /> Toggle memorial mode
        </button>
      </div>
    </section>
  );
}
