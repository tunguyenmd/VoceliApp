"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlannerView } from "@/lib/server/views";
import { api } from "./api";

interface PlanContextValue {
  view: PlannerView | null;
  loading: boolean;
  setView: (v: PlannerView | null) => void;
  refresh: () => Promise<void>;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<PlannerView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ plan: PlannerView | null }>("/api/plan");
      setView(r.plan);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ view, loading, setView, refresh }), [view, loading, refresh]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside PlanProvider");
  return ctx;
}

/** Call an API that returns { plan } and push the new plan into context. */
export function usePlanAction() {
  const { setView } = usePlan();
  return useCallback(
    async <T = unknown,>(path: string, init: { method?: string; body?: unknown; raw?: BodyInit } = {}) => {
      const res = await api<T & { plan?: PlannerView | null }>(path, init);
      if (res && typeof res === "object" && "plan" in res && res.plan !== undefined) setView(res.plan ?? null);
      return res as T;
    },
    [setView],
  );
}
