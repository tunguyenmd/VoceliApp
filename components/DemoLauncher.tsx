"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, FlaskConical } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "./ui";

export function DemoLauncher() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenter, setPresenter] = useState("Tam");

  async function liveDemo() {
    setBusy("live");
    setError(null);
    try {
      await api("/api/plan", { method: "POST", body: { firstName: presenter.trim() || "Friend" } });
      await api("/api/plan", { method: "PATCH", body: { acknowledged: true, voiceConsent: true } });
      router.push("/live?demo=short");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function seed(stage: "answers" | "complete") {
    setBusy(stage);
    setError(null);
    try {
      const r = await api<{ link?: string }>("/api/demo", { body: { action: "seed", stage } });
      if (r.link) setLink(r.link);
      else router.push("/review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-5 pb-12">
      <div className="rounded-[1.75rem] border-2 border-dashed border-line p-6">
        <p className="eyebrow mb-2 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" /> Demo
        </p>
        <div className="mb-6 rounded-2xl bg-dusk p-5 text-white">
          <p className="font-semibold">2-minute live demo with Linh</p>
          <p className="mt-1 text-[0.95rem] text-white/75">Starts a fresh plan in your name and opens the short path: what matters most, the private question, and a message to family.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="field w-48 py-2 text-ink" value={presenter} onChange={(e) => setPresenter(e.target.value)} aria-label="Your first name" maxLength={40} />
            <button className="btn bg-gold text-ink" onClick={liveDemo} disabled={!!busy}>
              {busy === "live" ? <Spinner /> : null} Start the live demo
            </button>
          </div>
        </div>
        <p className="text-ink-soft">
          Load Hoa, a fictional 71-year-old planner, with recordings in a computer-generated voice.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => seed("complete")} disabled={!!busy}>
            {busy === "complete" ? <Spinner /> : null} Hoa&rsquo;s finished plan + Mai&rsquo;s invite
          </button>
          <button className="btn btn-outline" onClick={() => seed("answers")} disabled={!!busy}>
            {busy === "answers" ? <Spinner /> : null} Hoa&rsquo;s answers only (run AI live)
          </button>
        </div>
        {error && <p className="mt-3 text-clay">{error}</p>}
        {link && (
          <div className="mt-5 rounded-2xl bg-sand p-4">
            <p className="font-semibold">Mai&rsquo;s private link (open on a phone or another browser):</p>
            <p className="mt-1 break-all font-mono text-sm">{link}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn btn-outline min-h-0 py-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(link).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
              </button>
              <button className="btn btn-primary min-h-0 py-2" onClick={() => router.push("/plan")}>
                Open Hoa&rsquo;s plan
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
