"use client";

import { motion } from "motion/react";
import { Check, Lock, Sparkles, X } from "lucide-react";
import type { DisclosureChoice, OptionDef, SpectrumStop, SpectrumValue, Suggestion } from "@/lib/types";
import { DISCLOSURE_OPTIONS } from "@/lib/content/prompts";

export function ChipSelect({
  options,
  selected,
  otherText,
  suggestedIds,
  onToggle,
  onOtherText,
}: {
  options: OptionDef[];
  selected: string[];
  otherText: string;
  suggestedIds: string[];
  onToggle: (id: string) => void;
  onOtherText: (t: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2.5" role="group">
        {options.map((o) => {
          const on = selected.includes(o.id);
          const suggested = !on && suggestedIds.includes(o.id);
          return (
            <motion.button
              layout
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.id)}
              className={`chip ${suggested ? "chip-suggested" : ""}`}
              whileTap={{ scale: 0.96 }}
            >
              {on && <Check className="h-4 w-4" strokeWidth={3} />}
              {suggested && <Sparkles className="h-4 w-4 text-gold" />}
              {o.label}
            </motion.button>
          );
        })}
      </div>
      {selected.includes("other") && (
        <input className="field mt-4" placeholder="Tell us in a few words" value={otherText} maxLength={300} onChange={(e) => onOtherText(e.target.value)} />
      )}
    </div>
  );
}

export function ScenarioList({
  options,
  selected,
  otherText,
  suggestedIds,
  onToggle,
  onOtherText,
}: {
  options: OptionDef[];
  selected: string[];
  otherText: string;
  suggestedIds: string[];
  onToggle: (id: string) => void;
  onOtherText: (t: string) => void;
}) {
  return (
    <div className="space-y-2.5" role="group">
      {options.map((o) => {
        const on = selected.includes(o.id);
        const suggested = !on && suggestedIds.includes(o.id);
        return (
          <div key={o.id}>
            {o.exclusive && <div className="my-3 border-t border-line" aria-hidden="true" />}
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(o.id)}
              className={`flex w-full items-center gap-4 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition ${on ? "border-dusk bg-dusk/5" : suggested ? "border-dashed border-gold bg-gold-soft" : "border-line bg-white hover:border-ink-mute"}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-dusk bg-dusk text-white" : "border-sand-deep bg-white"}`}>
                {on && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <span className="flex-1 font-semibold">{o.label}</span>
              {suggested && <Sparkles className="h-4 w-4 shrink-0 text-gold" />}
            </button>
          </div>
        );
      })}
      {selected.includes("other") && (
        <input className="field mt-2" placeholder="Describe the situation" value={otherText} maxLength={300} onChange={(e) => onOtherText(e.target.value)} />
      )}
    </div>
  );
}

export function SpectrumSlider({
  stops,
  value,
  unsure,
  suggested,
  onChange,
  onUnsure,
}: {
  stops: SpectrumStop[];
  value: SpectrumValue | null;
  unsure: boolean;
  suggested?: SpectrumValue;
  onChange: (v: SpectrumValue) => void;
  onUnsure: (v: boolean) => void;
}) {
  const current = stops.find((s) => s.value === value);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[0.95rem] font-bold">
        <span>{stops[0].label}</span>
        <span>{stops[stops.length - 1].label}</span>
      </div>
      <div className="relative" role="radiogroup" aria-label="How your care should lean">
        <div className="absolute left-6 right-6 top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-clay/70 via-gold/70 to-sage/80" />
        <div className="relative flex justify-between">
          {stops.map((s) => {
            const on = value === s.value && !unsure;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${s.label}: ${s.description}`}
                onClick={() => {
                  onUnsure(false);
                  onChange(s.value);
                }}
                className="relative flex h-12 w-12 items-center justify-center rounded-full"
              >
                <span className="h-4 w-4 rounded-full bg-white shadow ring-2 ring-white" />
                {suggested === s.value && !on && <span className="absolute inset-1 animate-pulse rounded-full ring-4 ring-gold/70" />}
                {on && (
                  <motion.span
                    layoutId="spectrum-thumb"
                    className="absolute inset-0.5 rounded-full border-4 border-white bg-dusk shadow-lg"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 min-h-[5.5rem] rounded-2xl bg-sand p-4" aria-live="polite">
        {unsure ? (
          <p className="text-ink-soft">That&rsquo;s okay. Many people aren&rsquo;t sure yet. Your recording or notes can help your family understand why.</p>
        ) : current ? (
          <>
            <p className="font-display text-xl">{current.label}</p>
            <p className="text-ink-soft">{current.description}</p>
          </>
        ) : (
          <p className="text-ink-soft">Tap the spot that feels closest.</p>
        )}
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[0.95rem]">
        <input type="checkbox" className="h-5 w-5 accent-[#3d405b]" checked={unsure} onChange={(e) => onUnsure(e.target.checked)} />
        I&rsquo;m not sure yet
      </label>
    </div>
  );
}

export function DisclosureChoices({
  value,
  unsure,
  onChange,
  onUnsure,
}: {
  value: DisclosureChoice | null;
  unsure: boolean;
  onChange: (v: DisclosureChoice) => void;
  onUnsure: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2.5" role="radiogroup">
      {DISCLOSURE_OPTIONS.map((o) => {
        const on = value === o.id && !unsure;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              onUnsure(false);
              onChange(o.id);
            }}
            className={`flex w-full items-start gap-4 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition ${on ? "border-plum bg-plum-soft" : "border-line bg-white hover:border-ink-mute"}`}
          >
            <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-plum" : "border-sand-deep"}`}>
              {on && <span className="h-3 w-3 rounded-full bg-plum" />}
            </span>
            <span>
              <span className="block font-semibold">{o.label}</span>
              <span className="text-ink-soft">{o.description}</span>
            </span>
          </button>
        );
      })}
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[0.95rem]">
        <input type="checkbox" className="h-5 w-5 accent-[#6b5a8e]" checked={unsure} onChange={(e) => onUnsure(e.target.checked)} />
        I&rsquo;m not sure yet
      </label>
      <p className="flex items-center gap-2 pt-1 text-sm text-plum">
        <Lock className="h-4 w-4" /> Stored separately, under its own key, with its own access log. Never sent to AI.
      </p>
    </div>
  );
}

export function SuggestionTray({
  suggestions,
  labelFor,
  onAccept,
  onDismiss,
  fromEarlier,
}: {
  suggestions: Suggestion[];
  labelFor: (s: Suggestion) => string;
  onAccept: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void;
  fromEarlier: boolean;
}) {
  if (!suggestions.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.5rem] border border-gold/60 bg-gold-soft/60 p-5">
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <Sparkles className="h-5 w-5 text-gold" />
        {fromEarlier ? "From what you shared earlier" : "From what you just said"}
      </p>
      <ul className="space-y-3">
        {suggestions.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-semibold">{labelFor(s)}</p>
              <p className="text-[0.95rem] italic text-ink-soft">&ldquo;{s.quote}&rdquo;</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary min-h-0 px-4 py-2" onClick={() => onAccept(s)}>
                <Check className="h-4 w-4" /> Add
              </button>
              <button className="btn btn-quiet min-h-0 px-3 py-2" onClick={() => onDismiss(s)} aria-label="Not quite">
                <X className="h-4 w-4" /> Not quite
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-mute">Suggestions only use your own words. Nothing changes unless you add it.</p>
    </motion.div>
  );
}
