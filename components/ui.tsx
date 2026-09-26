"use client";

import { useId, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function Toggle({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void | Promise<unknown>;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const [pending, setPending] = useState(false);
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="flex items-center gap-2 font-semibold">
          {icon}
          {label}
        </label>
        {description && <p className="mt-1 text-[0.93rem] text-ink-soft">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          try {
            await onChange(!checked);
          } finally {
            setPending(false);
          }
        }}
        className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-sage" : "bg-sand-deep"} disabled:opacity-60`}
      >
        <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function Banner({ tone = "sand", icon, children, action }: { tone?: "sand" | "gold" | "sage" | "clay" | "plum"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const tones = {
    sand: "bg-sand text-ink",
    gold: "bg-gold-soft text-ink",
    sage: "bg-sage-soft text-ink",
    clay: "bg-clay-soft text-ink",
    plum: "bg-plum-soft text-ink",
  };
  return (
    <div className={`flex flex-col gap-3 rounded-2xl px-5 py-4 sm:flex-row sm:items-center ${tones[tone]}`}>
      <div className="flex flex-1 items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="flex-1">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="font-display text-[2.1rem] leading-tight sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-lg text-ink-soft">{children}</div>}
    </div>
  );
}

export function formatDate(iso?: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", opts);
}

export function formatDateTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatClock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
