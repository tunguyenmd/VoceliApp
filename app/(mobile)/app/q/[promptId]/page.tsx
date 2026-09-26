"use client";

import { use, useEffect, useRef, useState } from "react";
import { Check, Lock, Sparkles } from "lucide-react";
import type { DisclosureChoice, PromptDef, PromptId, SpectrumValue, Suggestion } from "@/lib/types";
import type { PlannerView } from "@/lib/server/views";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import { useLinh, useLinhScreen } from "@/lib/client/LinhProvider";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { MobilePage } from "@/components/mobile/MobileFrame";
import { DisclosureChoices, ScenarioList, SpectrumSlider } from "@/components/talk/inputs";
import { AudioPlayer } from "@/components/voice/AudioPlayer";
import { formatClock } from "@/components/ui";

export default function QuestionScreen({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = use(params);
  const prompt = PROMPT_BY_ID[promptId as PromptId];
  const { view } = usePlan();
  if (!prompt) return <MobilePage>That question doesn&rsquo;t exist.</MobilePage>;
  if (!view) return null;
  return <QuestionBody key={prompt.id} prompt={prompt} view={view} />;
}

function initial(prompt: PromptDef, view: PlannerView) {
  if (prompt.kind === "disclosure") {
    const d = view.disclosure;
    return { selected: [] as string[], otherText: "", spectrum: null as SpectrumValue | null, unsure: !!d?.unsure, text: d?.text ?? "", choice: (d?.choice ?? null) as DisclosureChoice | null, who: d?.who ?? "" };
  }
  const a = view.core.answers[prompt.id];
  return { selected: a?.selected ?? [], otherText: a?.otherText ?? "", spectrum: ((a?.spectrum as SpectrumValue) ?? null) as SpectrumValue | null, unsure: !!a?.unsure, text: a?.text ?? "", choice: null as DisclosureChoice | null, who: "" };
}

// One question. The assistant asks it aloud and the person answers by talking; when she saves the answer, the
// choices it matched light up here, and she moves the app on by herself. No buttons: the choices can still be
// tapped, and the keyboard in the waveform bar is there for anyone who'd rather type.
function QuestionBody({ prompt, view }: { prompt: PromptDef; view: PlannerView }) {
  const act = usePlanAction();
  const isPrivate = prompt.kind === "disclosure";
  const linh = useLinh();
  useLinhScreen(prompt.id, { private: isPrivate });

  const [init] = useState(() => initial(prompt, view));
  const [selected, setSelected] = useState<string[]>(init.selected);
  const [otherText, setOtherText] = useState(init.otherText);
  const [spectrum, setSpectrum] = useState<SpectrumValue | null>(init.spectrum);
  const [unsure, setUnsure] = useState(init.unsure);
  const [text] = useState(init.text);
  const [choice, setChoice] = useState<DisclosureChoice | null>(init.choice);
  const [who, setWho] = useState(init.who);

  // She saved what the person said: show it here, and make the newly marked choices pop.
  const rev = linh.synced[prompt.id] ?? 0;
  const [seenRev, setSeenRev] = useState(rev);
  const [fromLinh, setFromLinh] = useState(false);
  const [marked, setMarked] = useState<string[]>([]);
  if (rev !== seenRev) {
    const fresh = initial(prompt, view);
    setSeenRev(rev);
    setMarked(fresh.selected.filter((id) => !selected.includes(id)));
    setSelected(fresh.selected);
    setOtherText(fresh.otherText);
    setSpectrum(fresh.spectrum);
    setUnsure(fresh.unsure);
    setFromLinh(true);
  }

  // The private question: once a choice is tapped, tell her (never what it was) so she can move on.
  const toldDone = useRef(false);
  useEffect(() => {
    if (!isPrivate || (!choice && !unsure) || toldDone.current) return;
    const t = window.setTimeout(() => {
      toldDone.current = true;
      linh.notify("[private-question-done]");
    }, 1500);
    return () => window.clearTimeout(t);
  }, [choice, unsure, isPrivate, linh]);

  const flow = view.flow.length ? view.flow : [prompt.id];
  const index = Math.max(0, flow.indexOf(prompt.id));
  const clipIds = isPrivate ? (view.disclosure?.clipIds ?? []) : (view.core.answers[prompt.id]?.clipIds ?? []);
  const clips = clipIds.map((id) => view.core.clips[id]).filter(Boolean);
  const pending: Suggestion[] = view.core.suggestions.filter((s) => s.targetPromptId === prompt.id && s.state === "pending");
  const suggestedIds = pending.filter((s) => s.kind === "option").map((s) => s.optionId!);

  function body(status: "answered" | "skipped", over: Partial<{ selected: string[]; spectrum: SpectrumValue | null; unsure: boolean; choice: DisclosureChoice | null }> = {}) {
    const s = { selected, otherText, spectrum, unsure, text, choice, who, ...over };
    if (isPrivate) return { status, choice: s.choice, unsure: s.unsure, who: s.who, text: s.text };
    return { status, selected: s.selected, otherText: s.otherText, spectrum: s.spectrum, unsure: s.unsure, text: s.text };
  }
  function hasContent(over: Partial<{ selected: string[]; spectrum: SpectrumValue | null; unsure: boolean; choice: DisclosureChoice | null }> = {}) {
    const s = { selected, spectrum, unsure, choice, ...over };
    return !!(s.selected.length || s.spectrum || s.unsure || text.trim() || s.choice || who.trim() || clips.length);
  }
  async function save(over: Parameters<typeof body>[1] = {}) {
    await act(`/api/answers/${prompt.id}`, { method: "PUT", body: body(hasContent(over) ? "answered" : "skipped", over) });
  }

  function toggle(id: string) {
    const opt = prompt.options?.find((o) => o.id === id);
    let next: string[];
    if (selected.includes(id)) next = selected.filter((x) => x !== id);
    else if (opt?.exclusive) next = [id];
    else next = [...selected.filter((x) => !prompt.options?.find((o) => o.id === x)?.exclusive), id];
    setSelected(next);
    void save({ selected: next });
  }

  return (
    <MobilePage>
      <div className="flex items-center gap-3">
        <p className="shrink-0 text-[0.8rem] font-semibold text-ink-mute">
          Question {index + 1} of {flow.length}
        </p>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-deep" aria-hidden="true">
          <div className="h-full rounded-full bg-dusk transition-[width] duration-700" style={{ width: `${((index + (fromLinh ? 1 : 0)) / flow.length) * 100}%` }} />
        </div>
      </div>
      <p className={`mt-3 flex items-center gap-1.5 text-[0.78rem] font-bold uppercase tracking-wider ${isPrivate ? "text-plum" : "text-ink-mute"}`}>
        {isPrivate && <Lock className="h-3.5 w-3.5" />} {prompt.eyebrow}
        {prompt.optional && <span className="rounded-full bg-sand px-2 py-0.5 text-[0.65rem] normal-case tracking-normal">Optional</span>}
      </p>
      <h1 className={`mt-1 font-bold leading-snug ${prompt.question.length > 140 ? "text-[1.08rem]" : "text-[1.25rem]"}`}>{prompt.question}</h1>
      {isPrivate && (
        <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-plum-soft px-3 py-2 text-[0.85rem] text-plum">
          <Lock className="h-4 w-4" /> I&rsquo;m not listening on this screen. Tap your answer; it stays private, with its own access log.
        </p>
      )}

      {pending.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-gold-soft px-3 py-2 text-[0.85rem]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> From what you said: tap a highlighted answer to add it.
        </p>
      )}

      <div className="mt-4">
        {prompt.kind === "chips" && (
          <div className="flex flex-wrap gap-2" role="group">
            {prompt.options!.map((o) => {
              const on = selected.includes(o.id);
              const suggested = !on && suggestedIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  aria-pressed={on}
                  onClick={() => toggle(o.id)}
                  className={`inline-flex min-h-[2.6rem] items-center gap-1.5 rounded-full border-[1.5px] px-4 text-left text-[0.95rem] font-semibold transition ${on ? "border-plum/40 bg-plum-soft text-plum" : suggested ? "border-dashed border-gold bg-gold-soft" : "border-line bg-white"} ${on && marked.includes(o.id) ? "marked-pop" : ""}`}
                >
                  {on && <Check className="h-4 w-4" strokeWidth={3} />}
                  {suggested && <Sparkles className="h-4 w-4 text-gold" />}
                  {o.label}
                </button>
              );
            })}
            {selected.includes("other") && otherText && <p className="mt-1 w-full rounded-2xl bg-plum-soft px-4 py-2 text-[0.92rem] text-plum">&ldquo;{otherText}&rdquo;</p>}
          </div>
        )}
        {prompt.kind === "scenarios" && <ScenarioList options={prompt.options!} selected={selected} otherText={otherText} suggestedIds={suggestedIds} onToggle={toggle} onOtherText={setOtherText} />}
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
        {isPrivate && (
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
            <input className="field mt-3" placeholder="Who should be with you, or hear it first? (optional)" value={who} onChange={(e) => setWho(e.target.value)} onBlur={() => save()} maxLength={200} />
          </>
        )}
        {prompt.kind === "legacy" && prompt.starters && (
          <div className="flex flex-wrap gap-1.5">
            {prompt.starters.map((s) => (
              <span key={s} className="rounded-full bg-sand px-3 py-1 text-[0.82rem] text-ink-soft">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {clips.length > 0 && (
        <ul className="mt-4 space-y-2">
          {clips.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white p-3 ring-1 ring-line">
              <AudioPlayer src={`/api/clips/${c.id}`} durationMs={c.durationMs} label={`In your own voice · ${formatClock(c.durationMs)}`} compact tone={isPrivate ? "plum" : "clay"} />
              {view.transcripts[c.id] && <p className="mt-1.5 line-clamp-2 pl-1 text-[0.82rem] italic text-ink-soft">&ldquo;{view.transcripts[c.id]}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}

      {fromLinh && !isPrivate && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.85rem] font-semibold text-sage">
          <Check className="h-4 w-4 shrink-0" strokeWidth={3} /> Marked from what you said.
        </p>
      )}
    </MobilePage>
  );
}
