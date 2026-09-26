"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { AlertTriangle, Check, Copy, Download, Lock, Mail, MessageSquare, RefreshCw, UserPlus, UserX, Users } from "lucide-react";
import type { ShareScopes } from "@/lib/types";
import { SHARE_WARNING } from "@/lib/content/copy";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import type { PublicShare } from "@/lib/server/views";
import { Banner, PageHeader, Spinner, formatDate, formatDateTime } from "@/components/ui";

const RELATIONSHIPS = ["Daughter", "Son", "Spouse or partner", "Sibling", "Parent", "Friend", "Other family", "Other"];

const SCOPE_INFO: { key: keyof ShareScopes; label: string; hint: string; sensitive?: boolean }[] = [
  { key: "summary", label: "Summary card", hint: "Your values summary." },
  { key: "recordings", label: "Your recordings", hint: "Your answers in your own voice, with transcripts." },
  { key: "message", label: "Message to your family", hint: "Your separate, longer message." },
  { key: "disclosure", label: "How you want to hear serious news", hint: "Your diagnosis and prognosis preference. Each view is logged.", sensitive: true },
];

export default function SharePage() {
  const { view } = usePlan();
  const act = usePlanAction();
  const [publishing, setPublishing] = useState(false);
  if (!view) return null;
  const latest = view.core.versions[view.core.versions.length - 1];
  const shares = [...view.core.shares].reverse();

  async function publish() {
    setPublishing(true);
    try {
      await act("/api/publish", { method: "POST" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 sm:pt-12">
      <PageHeader eyebrow="Family" title="Share with the people you trust.">
        Each person gets their own private link. You decide exactly what they can see, and you can turn off their access at any time.
      </PageHeader>

      <div className="mb-6">
        {latest ? (
          view.unpublishedChanges ? (
            <Banner
              tone="gold"
              icon={<RefreshCw className="h-5 w-5 text-gold" />}
              action={
                <button className="btn btn-primary min-h-0 py-2" onClick={publish} disabled={publishing}>
                  {publishing ? <Spinner /> : null} Update what family sees
                </button>
              }
            >
              You&rsquo;ve made changes since you last shared (version {latest.version}, {formatDate(latest.publishedAt)}). Family members still see the earlier version.
            </Banner>
          ) : (
            <Banner tone="sage" icon={<Check className="h-5 w-5 text-sage" />}>
              Family members see version {latest.version}, shared {formatDate(latest.publishedAt)}. It&rsquo;s up to date.
            </Banner>
          )
        ) : (
          <Banner tone="sand" icon={<Users className="h-5 w-5 text-ink-mute" />}>
            Nothing is shared yet. Your first invite shares your plan as it is now. Later changes stay private until you update.
          </Banner>
        )}
        {!view.core.summary?.approvedAt && (
          <p className="mt-3 text-sm text-ink-mute">Tip: approve your summary card first so family members see it.</p>
        )}
      </div>

      <InviteForm />

      {shares.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl">People with access</h2>
          <ul className="mt-4 space-y-3">
            {shares.map((s) => (
              <ShareRow key={s.id} share={s} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InviteForm() {
  const act = usePlanAction();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0]);
  const [scopes, setScopes] = useState<ShareScopes>({ summary: true, recordings: true, message: true, disclosure: false });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; name: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await act<{ link: string }>("/api/shares", { body: { name, relationship, scopes, acknowledgedNoRetract: true } });
      setCreated({ link: r.link, name });
      setName("");
      setAck(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6 sm:p-8">
      <AnimatePresence mode="wait">
        {created ? (
          <motion.div key="created" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <InviteLink link={created.link} name={created.name} onDone={() => setCreated(null)} />
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2 className="flex items-center gap-2 font-display text-2xl">
              <UserPlus className="h-6 w-6 text-clay" /> Invite someone
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block font-semibold">Their name</span>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-semibold">They are my…</span>
                <select className="field" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                  {RELATIONSHIPS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="mt-6">
              <legend className="mb-2 font-semibold">What they can see</legend>
              <div className="space-y-2">
                {SCOPE_INFO.map((s) => (
                  <label key={s.key} className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 ${scopes[s.key] ? (s.sensitive ? "bg-plum-soft ring-plum/30" : "bg-sand ring-line") : "bg-white ring-line"}`}>
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 accent-[#3d405b]"
                      checked={scopes[s.key]}
                      onChange={(e) => setScopes({ ...scopes, [s.key]: e.target.checked })}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        {s.label} {s.sensitive && <Lock className="h-4 w-4 text-plum" />}
                      </span>
                      <span className="text-[0.93rem] text-ink-soft">{s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-gold-soft p-4">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[#3d405b]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span className="text-[0.97rem]">
                <AlertTriangle className="mr-1 inline h-4 w-4 text-gold" />
                {SHARE_WARNING}
              </span>
            </label>
            <p className="mt-3 text-sm text-ink-mute">They&rsquo;ll be asked to give their own consent before they can see anything.</p>

            {error && <p className="mt-3 text-clay">{error}</p>}
            <button className="btn btn-primary mt-5" disabled={!name.trim() || !ack || busy || !Object.values(scopes).some(Boolean)}>
              {busy ? <Spinner /> : <UserPlus className="h-5 w-5" />} Create private link
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </section>
  );
}

function InviteLink({ link, name, onDone }: { link: string; name: string; onDone: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#25283a", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, [link]);
  const message = `I've written down my care wishes and recorded some of them in my own voice. Here is your private link: ${link}`;
  return (
    <div>
      <h2 className="font-display text-2xl">Here&rsquo;s {name}&rsquo;s private link</h2>
      <p className="mt-1 text-ink-soft">Send it however you like. For your privacy we only show this link once; you can always create a new one.</p>
      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {qr ? <img src={qr} alt={`QR code for ${name}'s link`} className="h-44 w-44 rounded-2xl ring-1 ring-line" /> : <div className="shimmer h-44 w-44 rounded-2xl" />}
        <div className="w-full min-w-0 flex-1">
          <div className="break-all rounded-2xl bg-sand p-4 font-mono text-[0.85rem]">{link}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn btn-primary min-h-0 py-2"
              onClick={async () => {
                await navigator.clipboard.writeText(link).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
            </button>
            <a className="btn btn-outline min-h-0 py-2" href={`sms:?&body=${encodeURIComponent(message)}`}>
              <MessageSquare className="h-4 w-4" /> Text
            </a>
            <a className="btn btn-outline min-h-0 py-2" href={`mailto:?subject=${encodeURIComponent("My care wishes")}&body=${encodeURIComponent(message)}`}>
              <Mail className="h-4 w-4" /> Email
            </a>
          </div>
        </div>
      </div>
      <button className="btn btn-quiet mt-6" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

function ShareRow({ share }: { share: PublicShare }) {
  const act = usePlanAction();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const status = share.status === "active" ? { label: "Has access", cls: "bg-sage-soft text-sage" } : share.status === "invited" ? { label: "Invited", cls: "bg-gold-soft text-ink" } : { label: "Access off", cls: "bg-sand text-ink-mute" };
  const accepted = share.consents[share.consents.length - 1];

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dusk font-display text-lg text-white">{share.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {share.name} <span className="font-normal text-ink-mute">· {share.relationship}</span>
          </p>
          <p className="text-[0.93rem] text-ink-soft">
            {accepted ? `Gave consent ${formatDate(accepted.acceptedAt)}` : `Invited ${formatDate(share.createdAt)}`}
            {share.lastAccessAt && share.status === "active" ? ` · Last visit ${formatDateTime(share.lastAccessAt)}` : ""}
            {share.revokedAt ? ` · Turned off ${formatDate(share.revokedAt)}` : ""}
          </p>
          {share.savedCopies > 0 && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[0.9rem] text-ink-soft">
              <Download className="h-4 w-4" /> Saved {share.savedCopies} cop{share.savedCopies === 1 ? "y" : "ies"} to their device
            </p>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${status.cls}`}>{status.label}</span>
      </div>

      {share.status !== "revoked" && (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {SCOPE_INFO.map((s) =>
              editing ? (
                <button
                  key={s.key}
                  className={`chip min-h-0 py-1.5 text-[0.88rem]`}
                  aria-pressed={share.scopes[s.key]}
                  onClick={() => act(`/api/shares/${share.id}`, { method: "PATCH", body: { scopes: { ...share.scopes, [s.key]: !share.scopes[s.key] } } })}
                >
                  {s.label}
                </button>
              ) : share.scopes[s.key] ? (
                <span key={s.key} className={`rounded-full px-3 py-1 text-[0.85rem] font-semibold ${s.sensitive ? "bg-plum-soft text-plum" : "bg-sand text-ink-soft"}`}>
                  {s.label}
                </span>
              ) : null,
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-quiet min-h-0 py-2" onClick={() => setEditing((v) => !v)}>
              {editing ? "Done" : "Change what they see"}
            </button>
            {confirm ? (
              <span className="flex flex-wrap items-center gap-2 rounded-2xl bg-clay-soft px-3 py-2">
                <span className="text-[0.93rem]">Turn off {share.name}&rsquo;s access now? Copies they saved stay with them.</span>
                <button className="btn min-h-0 bg-clay py-1.5 text-white" onClick={() => act(`/api/shares/${share.id}`, { method: "DELETE" })}>
                  Turn off
                </button>
                <button className="btn btn-quiet min-h-0 py-1.5" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn btn-quiet min-h-0 py-2 text-clay" onClick={() => setConfirm(true)}>
                <UserX className="h-4 w-4" /> Turn off access
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
