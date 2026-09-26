"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Heart, Lock, Sparkles } from "lucide-react";
import type { DisclosureChoice, PromptDef, PromptId, SpectrumValue, Suggestion } from "@/lib/types";
import type { PlannerView } from "@/lib/server/views";
import { CRISIS_RESOURCES } from "@/lib/content/copy";
import { PROMPT_BY_ID, PROMPTS, optionLabel, spectrumStop } from "@/lib/content/prompts";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { ChapterProgress } from "@/components/talk/ChapterProgress";
import { ChipSelect, DisclosureChoices, ScenarioList, SpectrumSlider, SuggestionTray } from "@/components/talk/inputs";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { Spinner } from "@/components/ui";

export default function TalkStep({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = use(params);
  const prompt = PROMPT_BY_ID[promptId as PromptId];
  const { view } = usePlan();
  if (!prompt) {
    return <div className="mx-auto max-w-3xl px-5 py-12">That question doesn&rsquo;t exist.</div>;
  }
  if (!view) return null;
  // Remount per question so local state starts from that question's saved answer.
  return <StepBody key={prompt.id} prompt={prompt} view={view} />;
}

function initialState(prompt: PromptDef, view: PlannerView) {
  if (prompt.kind === "disclosure") {
    const d = view.disclosure;
    return { selected: [] as string[], otherText: "", spectrum: null as SpectrumValue | null, unsure: !!d?.unsure, text: d?.text ?? "", choice: (d?.choice ?? null) as DisclosureChoice | null, who: d?.who ?? "" };
  }
  const a = view.core.answers[prompt.id];
  return {
    selected: a?.selected ?? [],
    otherText: a?.otherText ?? "",
    spectrum: ((a?.spectrum as SpectrumValue) ?? null) as SpectrumValue | null,
    unsure: !!a?.unsure,
    text: a?.text ?? "",
    choice: null as DisclosureChoice | null,
    who: "",
  };
}

function StepBody({ prompt, view }: { prompt: PromptDef; view: PlannerView }) {
  const act = usePlanAction();
  const router = useRouter();
  const [init] = useState(() => initialState(prompt, view));
  const [selected, setSelected] = useState<string[]>(init.selected);
  const [otherText, setOtherText] = useState(init.otherText);
  const [spectrum, setSpectrum] = useState<SpectrumValue | null>(init.spectrum);
  const [unsure, setUnsure] = useState(init.unsure);
  const [text, setText] = useState(init.text);
  const [choice, setChoice] = useState<DisclosureChoice | null>(init.choice);
  const [who, setWho] = useState(init.who);
  const [showText, setShowText] = useState(!!init.text);
  const [listening, setListening] = useState(false);
  const [laterCount, setLaterCount] = useState(0);
  const [distress, setDistress] = useState(false);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const index = PROMPTS.findIndex((p) => p.id === prompt?.id);
  const prev = index > 0 ? PROMPTS[index - 1] : null;
  const next = index < PROMPTS.length - 1 ? PROMPTS[index + 1] : null;

  const pending: Suggestion[] = view.core.suggestions.filter((s) => s.targetPromptId === prompt.id && s.state === "pending");
  const trayRef = useRef<HTMLDivElement>(null);
  const pendingKey = pending.map((p) => p.id).join(",");
  const seenPending = useRef(pendingKey);
  useEffect(() => {
    // Bring fresh suggestions into view (they appear above the recorder the person was just using).
    if (pendingKey && pendingKey !== seenPending.current) trayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    seenPending.current = pendingKey;
  }, [pendingKey]);

  const isDisclosure = prompt.kind === "disclosure";
  const clipIds = isDisclosure ? (view.disclosure?.clipIds ?? []) : (view.core.answers[prompt.id]?.clipIds ?? []);
  const live = view.features.stt && !isDisclosure;
  const fromEarlier = pending.length > 0 && pending.every((s) => s.sourcePromptId !== prompt.id);

  function body(status: "answered" | "skipped", over: Partial<{ selected: string[]; otherText: string; spectrum: SpectrumValue | null; unsure: boolean; text: string; choice: DisclosureChoice | null; who: string }> = {}) {
    const s = { selected, otherText, spectrum, unsure, text, choice, who, ...over };
    if (isDisclosure) return { status, choice: s.choice, unsure: s.unsure, who: s.who, text: s.text };
    return { status, selected: s.selected, otherText: s.otherText, spectrum: s.spectrum, unsure: s.unsure, text: s.text };
  }

  function hasContent(over: Parameters<typeof body>[1] = {}) {
    const s = { selected, otherText, spectrum, unsure, text, choice, who, ...over };
    return !!(s.selected.length || s.spectrum || s.unsure || s.text.trim() || s.choice || s.who.trim() || clipIds.length);
  }

  async function save(over: Parameters<typeof body>[1] = {}) {
    await act(`/api/answers/${prompt.id}`, { method: "PUT", body: body(hasContent(over) ? "answered" : "skipped", over) });
  }

  function toggle(id: string) {
    const opt = prompt.options?.find((o) => o.id === id);
    let nextSel: string[];
    if (selected.includes(id)) nextSel = selected.filter((x) => x !== id);
    else if (opt?.exclusive) nextSel = [id];
    else nextSel = [...selected.filter((x) => !prompt.options?.find((o) => o.id === x)?.exclusive), id];
    setSelected(nextSel);
    void save({ selected: nextSel });
  }

  async function understandClip(clipId: string) {
    if (!view.features.ai) return;
    setListening(true);
    try {
      const res = await act<{ suggestions: Suggestion[]; distress: boolean }>("/api/ai/understand", { body: { clipId } });
      if (res.distress) setDistress(true);
      setLaterCount(res.suggestions.filter((s) => s.targetPromptId !== prompt.id).length);
    } catch {
      // Suggestions are optional; the answer is already saved.
    } finally {
      setListening(false);
    }
  }

  async function accept(s: Suggestion) {
    if (s.kind === "option" && s.optionId) {
      const nextSel = s.optionId === "none" ? ["none"] : [...selected.filter((x) => x !== "none" && x !== s.optionId), s.optionId];
      setSelected(nextSel);
    }
    if (s.kind === "spectrum" && s.value) {
      setSpectrum(s.value);
      setUnsure(false);
    }
    await act(`/api/suggestions/${s.id}`, { body: { action: "accept" } });
  }

  async function go(to: string | null, mode: "continue" | "skip" | "back") {
    setBusy(true);
    try {
      if (mode === "skip") await act(`/api/answers/${prompt.id}`, { method: "PUT", body: body("skipped") });
      else if (mode === "continue" || hasContent()) await save();
      // Typed answers get the same "we'll fill that in" help as recordings, in the background.
      if (mode === "continue" && view.features.ai && !isDisclosure && text.trim().split(/\s+/).length >= 6) {
        void act("/api/ai/understand", { body: { promptId: prompt.id, text } }).catch(() => {});
      }
      router.push(to ?? "/review");
    } finally {
      setBusy(false);
    }
  }

  const labelFor = (s: Suggestion) =>
    s.kind === "spectrum" ? `Lean: ${spectrumStop(s.value)?.label ?? ""}` : optionLabel(s.targetPromptId, s.optionId ?? "");

  return (
    <div className="mx-auto max-w-3xl px-5 pt-6 sm:pt-10">
      <ChapterProgress view={view} current={prompt.id} />

      <AnimatePresence mode="wait">
        <motion.div key={prompt.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
          <section className={`card p-6 sm:p-8 ${isDisclosure ? "border-plum/30" : ""}`}>
            <p className={`eyebrow mb-3 flex items-center gap-2 ${isDisclosure ? "text-plum" : ""}`}>
              {isDisclosure && <Lock className="h-3.5 w-3.5" />}
              {prompt.eyebrow}
              {prompt.optional && <span className="rounded-full bg-sand px-2 py-0.5 text-[0.7rem] tracking-normal normal-case">Optional</span>}
            </p>
            <h1 className="font-display text-[1.9rem] leading-tight sm:text-[2.4rem]">{prompt.question}</h1>
            {prompt.help && <p className="mt-3 text-ink-soft">{prompt.help}</p>}

            {pending.length > 0 && (
              <div className="mt-6 scroll-mt-24" ref={trayRef}>
                <SuggestionTray
                  suggestions={pending}
                  labelFor={labelFor}
                  onAccept={accept}
                  onDismiss={(s) => act(`/api/suggestions/${s.id}`, { body: { action: "dismiss" } })}
                  fromEarlier={fromEarlier}
                />
              </div>
            )}

            <div className="mt-6">
              {prompt.kind === "chips" && (
                <ChipSelect
                  options={prompt.options!}
                  selected={selected}
                  otherText={otherText}
                  suggestedIds={pending.filter((s) => s.kind === "option").map((s) => s.optionId!)}
                  onToggle={toggle}
                  onOtherText={setOtherText}
                />
              )}
              {prompt.kind === "scenarios" && (
                <ScenarioList
                  options={prompt.options!}
                  selected={selected}
                  otherText={otherText}
                  suggestedIds={pending.filter((s) => s.kind === "option").map((s) => s.optionId!)}
                  onToggle={toggle}
                  onOtherText={setOtherText}
                />
              )}
              {prompt.kind === "spectrum" && (
                <SpectrumSlider
                  stops={prompt.stops!}
                  value={spectrum}
                  unsure={unsure}
                  suggested={pending.find((s) => s.kind === "spectrum")?.value}
                  onChange={(v) => {
                    setSpectrum(v);
                    void save({ spectrum: v, unsure: false });
                  }}
                  onUnsure={(v) => {
                    setUnsure(v);
                    void save({ unsure: v });
                  }}
                />
              )}
              {isDisclosure && (
                <>
                  <DisclosureChoices
                    value={choice}
                    unsure={unsure}
                    onChange={(v) => {
                      setChoice(v);
                      void save({ choice: v, unsure: false });
                    }}
                    onUnsure={(v) => {
                      setUnsure(v);
                      void save({ unsure: v });
                    }}
                  />
                  <label className="mt-5 block">
                    <span className="mb-2 block font-semibold">Who should be with you, or hear it first? (optional)</span>
                    <input className="field" value={who} maxLength={200} onChange={(e) => setWho(e.target.value)} onBlur={() => save()} />
                  </label>
                </>
              )}
              {prompt.kind === "legacy" && prompt.starters && (
                <div className="flex flex-wrap gap-2">
                  <span className="mr-1 self-center text-sm font-semibold text-ink-mute">Ideas:</span>
                  {prompt.starters.map((s) => (
                    <span key={s} className="rounded-full bg-sand px-3 py-1.5 text-[0.9rem] text-ink-soft">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="mt-5" aria-label="Answer in your own voice">
            <VoicePanel
              owner={prompt.id}
              limitSec={prompt.recordLimitSec}
              targetSec={prompt.targetSec}
              cue={prompt.voiceCue}
              clipIds={clipIds}
              live={live}
              tone={isDisclosure ? "plum" : "clay"}
              privateNote={isDisclosure ? "Not transcribed, to keep this private" : undefined}
              onTypeInstead={() => {
                setShowText(true);
                setTimeout(() => textRef.current?.focus(), 50);
              }}
              onTranscript={isDisclosure ? undefined : understandClip}
            />
            {listening && (
              <p className="mt-3 flex items-center justify-center gap-2 text-[0.95rem] text-ink-mute" aria-live="polite">
                <Spinner className="h-4 w-4" /> Listening for anything that fits your answers…
              </p>
            )}
            {!listening && laterCount > 0 && (
              <p className="mt-3 flex items-center justify-center gap-2 text-[0.95rem] text-ink-soft" aria-live="polite">
                <Sparkles className="h-4 w-4 text-gold" /> Noted {laterCount} thing{laterCount > 1 ? "s" : ""} for later questions. You&rsquo;ll confirm them there.
              </p>
            )}
          </section>

          {distress && (
            <div className="mt-5 rounded-[1.5rem] bg-plum-soft p-5" role="alert">
              <p className="flex items-center gap-2 font-semibold">
                <Heart className="h-5 w-5 text-plum" /> {CRISIS_RESOURCES.title}
              </p>
              <p className="mt-1 text-ink-soft">{CRISIS_RESOURCES.body}</p>
              <a className="mt-2 inline-block font-semibold text-plum underline" href={CRISIS_RESOURCES.link} target="_blank" rel="noreferrer">
                988lifeline.org
              </a>
            </div>
          )}

          {(showText || text) && (
            <section className="mt-5">
              <label className="block">
                <span className="mb-2 block font-semibold">{prompt.kind === "reflection" || prompt.kind === "legacy" ? "Your answer" : "Anything you'd like to add"}</span>
                <textarea
                  ref={textRef}
                  className="field min-h-[8rem]"
                  value={text}
                  maxLength={4000}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => save()}
                  placeholder="Write as much or as little as you like."
                />
              </label>
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="no-print mt-8">
        <div className="flex items-center gap-2 rounded-full border border-line bg-white p-2 shadow-[var(--shadow-soft)]">
          <button className="btn btn-quiet" disabled={busy || !prev} onClick={() => go(prev ? `/talk/${prev.id}` : null, "back")} aria-label="Previous question">
            <ArrowLeft className="h-5 w-5" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex-1" />
          <button className="btn btn-quiet" disabled={busy} onClick={() => go(next ? `/talk/${next.id}` : null, "skip")}>
            Skip
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => go(next ? `/talk/${next.id}` : null, "continue")}>
            {busy ? <Spinner /> : null}
            {next ? "Continue" : "Review"}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
