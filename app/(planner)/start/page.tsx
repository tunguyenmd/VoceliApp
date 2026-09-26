"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, AudioLines, Clock3, FileText, HeartHandshake, Lock, SkipForward, Sparkles } from "lucide-react";
import { NOT_A_LEGAL_DOCUMENT, VOICE_NOTICE } from "@/lib/content/copy";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { Toggle } from "@/components/ui";

type Step = "name" | "about" | "voice" | "help";

export default function StartPage() {
  const { view, loading } = usePlan();
  if (loading) return null;
  // Decide the starting step once, from the plan as it was when the page opened.
  return <StartFlow initialView={view} />;
}

function StartFlow({ initialView }: { initialView: ReturnType<typeof usePlan>["view"] }) {
  const { view } = usePlan();
  const act = usePlanAction();
  const router = useRouter();
  const [firstStep] = useState<Step | "done">(() => {
    const p = initialView?.core.profile;
    if (!p) return "name";
    if (p.voiceConsentAt && p.acknowledgedAt) return "done";
    return p.acknowledgedAt ? "voice" : "about";
  });
  const [step, setStep] = useState<Step>(firstStep === "done" ? "help" : firstStep);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    if (firstStep === "done") router.replace("/plan");
  }, [firstStep, router]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const steps: Step[] = ["name", "about", "voice", "help"];
  const index = steps.indexOf(step);

  return (
    <div className="mx-auto max-w-2xl px-5 pt-8 sm:pt-14">
      <div className="mb-8 flex gap-2" aria-hidden="true">
        {steps.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= index ? "bg-dusk" : "bg-sand-deep"}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={step}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {step === "name" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                void run(async () => {
                  await act("/api/plan", { method: "POST", body: { firstName: name.trim() } });
                  setStep("about");
                });
              }}
            >
              <p className="eyebrow mb-3">Welcome</p>
              <h1 className="font-display text-4xl leading-tight sm:text-5xl">Let&rsquo;s make sure you&rsquo;re heard.</h1>
              <p className="mt-4 text-lg text-ink-soft">
                We&rsquo;ll talk through what matters most to you, one gentle question at a time. What should we call you?
              </p>
              <label className="mt-8 block">
                <span className="mb-2 block font-semibold">Your first name</span>
                <input className="field text-lg" autoFocus autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              </label>
              <button className="btn btn-primary mt-6 w-full sm:w-auto" disabled={!name.trim() || busy}>
                Continue <ArrowRight className="h-5 w-5" />
              </button>
            </form>
          )}

          {step === "about" && (
            <div>
              <p className="eyebrow mb-3">Before we begin</p>
              <h1 className="font-display text-4xl leading-tight">A conversation, not a form.</h1>
              <ul className="mt-8 space-y-5">
                <Point icon={Clock3} title="About 15 minutes" text="You can stop at any time and pick up where you left off." />
                <Point icon={SkipForward} title="Skip anything" text="Every question is optional. Skipping never counts against you." />
                <Point icon={HeartHandshake} title="Share when you're ready" text="Nothing is shared with anyone until you choose who sees it." />
                <Point icon={FileText} title="What you'll have at the end" text={NOT_A_LEGAL_DOCUMENT} />
              </ul>
              <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-2xl bg-sand p-4">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[#3d405b]" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                <span>I understand this helps me prepare and share my wishes, and is not a legal document or medical order.</span>
              </label>
              <button
                className="btn btn-primary mt-6 w-full sm:w-auto"
                disabled={!understood || busy}
                onClick={() => run(async () => {
                  await act("/api/plan", { method: "PATCH", body: { acknowledged: true } });
                  setStep("voice");
                })}
              >
                Continue <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {step === "voice" && (
            <div>
              <p className="eyebrow mb-3">Your voice</p>
              <h1 className="font-display text-4xl leading-tight">Your family will hear it from you.</h1>
              <p className="mt-4 text-lg text-ink-soft">
                For each question you can record a short answer in your own voice. Later, the people you choose can listen to it.
              </p>
              <div className="card mt-8 p-6">
                <div className="mb-4 flex items-center gap-2 font-semibold">
                  <AudioLines className="h-5 w-5 text-clay" /> How we treat your recordings
                </div>
                <ul className="space-y-3 text-[0.97rem] text-ink-soft">
                  {VOICE_NOTICE.points.map((p) => (
                    <li key={p} className="flex gap-3">
                      <Lock className="mt-1 h-4 w-4 shrink-0 text-sage" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await act("/api/plan", { method: "PATCH", body: { voiceConsent: true } });
                    setStep("help");
                  })}
                >
                  I agree to record my voice <ArrowRight className="h-5 w-5" />
                </button>
                <button className="btn btn-quiet" onClick={() => setStep("help")}>
                  I&rsquo;d rather type for now
                </button>
              </div>
            </div>
          )}

          {step === "help" && view && <HelpStep onDone={() => router.push("/talk/reflect_health")} />}
        </motion.section>
      </AnimatePresence>
      {error && <p className="mt-4 rounded-xl bg-clay-soft px-4 py-3 text-clay">{error}</p>}
    </div>
  );
}

function HelpStep({ onDone }: { onDone: () => void }) {
  const { view } = usePlan();
  const act = usePlanAction();
  if (!view) return null;
  const p = view.core.profile;
  return (
    <div>
      <p className="eyebrow mb-3">Optional help</p>
      <h1 className="font-display text-4xl leading-tight">Heard can listen along.</h1>
      <p className="mt-4 text-lg text-ink-soft">These are on by default. You approve everything they suggest, and you can turn them off any time in Privacy.</p>
      <div className="mt-8 space-y-4">
        <div className="card p-5">
          <Toggle
            checked={p.transcription}
            onChange={(v) => act("/api/plan", { method: "PATCH", body: { transcription: v } })}
            label="Live captions and transcripts"
            description={`Shows your words as you speak and saves them as text, protected like your audio. ${view.processing.sttKind === "none" ? "(Not available on this server.)" : `Processed by ${view.processing.stt}.`}`}
          />
        </div>
        <div className="card p-5">
          <Toggle
            checked={p.aiAssist}
            onChange={(v) => act("/api/plan", { method: "PATCH", body: { aiAssist: v } })}
            label="AI assistance"
            description={`Suggests answers from your own words, points out anything your family might find unclear, and drafts your summary. ${view.processing.aiKind === "none" ? "(Not available on this server.)" : `Runs on ${view.processing.ai}; your words are not stored or used for training.`}`}
            icon={<Sparkles className="h-5 w-5 text-gold" />}
          />
        </div>
      </div>
      <button className="btn btn-primary mt-8 w-full sm:w-auto" onClick={onDone}>
        Start the conversation <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function Point({ icon: Icon, title, text }: { icon: typeof Clock3; title: string; text: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sand text-dusk">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-ink-soft">{text}</span>
      </span>
    </li>
  );
}
