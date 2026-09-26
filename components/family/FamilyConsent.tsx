"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { HeartHandshake, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "../ui";

// The family member's own, explicit consent before anything is shown (spec §9, §11.2).
export function FamilyConsent({ token, firstName, recipient, points, version }: { token: string; firstName: string; recipient: string; points: string[]; version: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState<boolean[]>(points.map(() => false));
  const [name, setName] = useState(recipient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = checked.every(Boolean) && name.trim().length > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gold-soft">
        <HeartHandshake className="h-7 w-7 text-clay" />
      </span>
      <h1 className="mt-5 font-display text-[2.2rem] leading-tight">{firstName} has shared their care wishes with you.</h1>
      <p className="mt-3 text-lg text-ink-soft">
        {firstName} wants you to know what matters to them if they become very ill, including recordings in their own voice. Before you open it, please read and agree to the
        following. This is your own decision.
      </p>
      <div className="card mt-6 p-6">
        <ul className="space-y-3">
          {points.map((p, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 accent-[#3d405b]"
                  checked={checked[i]}
                  onChange={(e) => setChecked(checked.map((c, j) => (j === i ? e.target.checked : c)))}
                />
                <span>{p}</span>
              </label>
            </li>
          ))}
        </ul>
        <label className="mt-5 block">
          <span className="mb-1.5 block font-semibold">Type your name to agree</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        {error && <p className="mt-3 text-clay">{error}</p>}
        <button
          className="btn btn-primary mt-5 w-full sm:w-auto"
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/api/family/${token}`, { body: { typedName: name.trim(), agree: true } });
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : <ShieldCheck className="h-5 w-5" />} I agree. Open {firstName}&rsquo;s wishes
        </button>
      </div>
      <p className="mt-4 text-sm text-ink-mute">
        {firstName} will be able to see that you opened this. Consent version {version}.
      </p>
    </motion.div>
  );
}
