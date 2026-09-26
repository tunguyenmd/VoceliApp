"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, ArrowRight, Check, Copy, Lock, UserPlus } from "lucide-react";
import type { ShareScopes } from "@/lib/types";
import { SHARE_WARNING } from "@/lib/content/copy";
import { useLinhScreen } from "@/lib/client/LinhProvider";
import { usePlanAction } from "@/lib/client/PlanProvider";
import { MobilePage } from "@/components/mobile/MobileFrame";
import { Spinner } from "@/components/ui";

const SCOPES: { key: keyof ShareScopes; label: string; sensitive?: boolean }[] = [
  { key: "summary", label: "Summary card" },
  { key: "recordings", label: "My recordings" },
  { key: "message", label: "Message to my family" },
  { key: "disclosure", label: "How I want to hear serious news", sensitive: true },
];

// Spec §9: granular, revocable sharing; the recipient consents separately; the planner is told that revoking
// can't take back copies already saved.
export default function Share() {
  const act = usePlanAction();
  const router = useRouter();
  useLinhScreen("share");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("Daughter");
  const [scopes, setScopes] = useState<ShareScopes>({ summary: true, recordings: true, message: true, disclosure: false });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 320, color: { dark: "#25283a", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, [link]);

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      const r = await act<{ link: string }>("/api/shares", { body: { name, relationship, scopes, acknowledgedNoRetract: true } });
      setLink(r.link);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    return (
      <MobilePage
        actions={
          <button className="btn btn-primary w-full" onClick={() => router.push("/app/done")}>
            Done <ArrowRight className="h-5 w-5" />
          </button>
        }
      >
        <p className="text-[0.85rem] text-ink-mute">Share</p>
        <h1 className="text-[1.3rem] font-bold">{name}&rsquo;s private link</h1>
        <p className="mt-1 text-[0.9rem] text-ink-soft">{name} will give their own consent before they can see anything.</p>
        <div className="mt-4 flex flex-col items-center gap-3">
          {qr ? <img src={qr} alt={`QR code for ${name}'s link`} className="h-44 w-44 rounded-2xl ring-1 ring-line" /> : <div className="shimmer h-44 w-44 rounded-2xl" />}
          <button
            className="btn btn-outline w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
          </button>
          <p className="break-all text-center font-mono text-[0.7rem] text-ink-mute">{link}</p>
        </div>
      </MobilePage>
    );
  }

  return (
    <MobilePage
      actions={
        <>
          <button className="btn btn-primary w-full" onClick={invite} disabled={!name.trim() || !ack || busy}>
            {busy ? <Spinner /> : <UserPlus className="h-5 w-5" />} Create private link
          </button>
          <button className="btn btn-quiet w-full" onClick={() => router.push("/app/done")}>
            Not now
          </button>
        </>
      }
    >
      <p className="text-[0.85rem] text-ink-mute">Share</p>
      <h1 className="text-[1.3rem] font-bold">Who should hear your wishes?</h1>
      <div className="mt-3 space-y-2">
        <input className="field" placeholder="Their name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <select className="field" aria-label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          {["Daughter", "Son", "Spouse or partner", "Sibling", "Friend", "Other"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <p className="mt-4 text-[0.85rem] font-semibold">They can see</p>
      <div className="mt-2 space-y-1.5">
        {SCOPES.map((s) => (
          <label key={s.key} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${scopes[s.key] ? (s.sensitive ? "bg-plum-soft ring-plum/30" : "bg-sand ring-line") : "bg-white ring-line"}`}>
            <input type="checkbox" className="h-5 w-5 accent-[#3d405b]" checked={scopes[s.key]} onChange={(e) => setScopes({ ...scopes, [s.key]: e.target.checked })} />
            <span className="flex items-center gap-1.5 text-[0.95rem]">
              {s.label} {s.sensitive && <Lock className="h-3.5 w-3.5 text-plum" />}
            </span>
          </label>
        ))}
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-gold-soft p-3">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#3d405b]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span className="text-[0.85rem]">
          <AlertTriangle className="mr-1 inline h-4 w-4 text-gold" />
          {SHARE_WARNING}
        </span>
      </label>
      {error && <p className="mt-2 text-[0.85rem] text-clay">{error}</p>}
    </MobilePage>
  );
}
