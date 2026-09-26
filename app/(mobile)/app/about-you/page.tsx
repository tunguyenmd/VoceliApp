"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Users, User } from "lucide-react";
import { useLinh, useLinhScreen } from "@/lib/client/LinhProvider";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { MobilePage } from "@/components/mobile/MobileFrame";
import { Spinner } from "@/components/ui";

const LANGUAGES = [
  { id: "en", label: "English", ready: true },
  { id: "es", label: "Español", ready: false },
  { id: "vi", label: "Tiếng Việt", ready: false },
  { id: "zh", label: "中文", ready: false },
  { id: "tl", label: "Tagalog", ready: false },
];

// Spec §3: decision style (individual vs family-centered) and language. The MVP runs individual mode in English;
// the other choices are recorded and shown as coming soon rather than half-working.
export default function AboutYou() {
  const { view } = usePlan();
  const act = usePlanAction();
  const linh = useLinh();
  const router = useRouter();
  useLinhScreen("about");
  const profile = view?.core.profile;
  const [name, setName] = useState(profile?.firstName ?? "");
  const [style, setStyle] = useState<"self" | "family" | null>(profile?.decisionStyle ?? null);
  const [language, setLanguage] = useState(profile?.language ?? "en");
  const [busy, setBusy] = useState(false);

  async function next() {
    setBusy(true);
    try {
      await act("/api/plan", { method: "PATCH", body: { firstName: name.trim(), decisionStyle: style, language: "en" } });
      void linh.notify(`[name:${name.trim()}]`);
      router.push(view?.core.profile.acknowledgedAt ? "/app/q/reflect_health" : "/app/begin");
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { id: "self" as const, icon: User, title: "On my own", text: "I decide, then share." },
    { id: "family" as const, icon: Users, title: "With my family", text: "We decide together." },
  ];

  return (
    <MobilePage
      actions={
        <button className="btn btn-primary w-full" onClick={next} disabled={!name.trim() || !style || busy}>
          {busy ? <Spinner /> : null} Continue <ArrowRight className="h-5 w-5" />
        </button>
      }
    >
      <p className="text-[0.85rem] text-ink-mute">About you</p>
      <label className="mt-2 block">
        <span className="mb-1.5 block text-[1.15rem] font-bold">What should I call you?</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" maxLength={40} />
      </label>

      <p className="mt-6 text-[0.85rem] text-ink-mute">Decision style</p>
      <h2 className="text-[1.15rem] font-bold">How do you make big decisions?</h2>
      <div className="mt-3 space-y-2.5" role="radiogroup">
        {options.map((o) => {
          const on = style === o.id;
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={on}
              onClick={() => setStyle(o.id)}
              className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${on ? "border-plum/60 bg-plum-soft" : "border-line bg-white"}`}
            >
              <o.icon className={`mt-0.5 h-5 w-5 ${on ? "text-plum" : "text-ink-mute"}`} />
              <span className="flex-1">
                <span className={`block text-[1.05rem] font-bold ${on ? "text-plum" : ""}`}>{o.title}</span>
                <span className="text-ink-soft">{o.text}</span>
              </span>
              {on && <Check className="h-5 w-5 text-plum" />}
            </button>
          );
        })}
      </div>
      {style === "family" && (
        <p className="mt-3 rounded-2xl bg-sand p-3 text-[0.88rem] text-ink-soft">
          A family version of this conversation is coming soon. For now I&rsquo;ll guide you, and at the end you can share everything with your family.
        </p>
      )}

      <label className="mt-6 block">
        <span className="text-[0.85rem] text-ink-mute">Language</span>
        <select className="field mt-1.5" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} disabled={!l.ready}>
              {l.label}
              {l.ready ? "" : " (coming soon)"}
            </option>
          ))}
        </select>
      </label>
    </MobilePage>
  );
}
