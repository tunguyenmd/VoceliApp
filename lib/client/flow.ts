import type { PromptId } from "@/lib/types";
import type { PlannerView } from "@/lib/server/views";
import { PROMPTS } from "@/lib/content/prompts";

// Where the mobile app should take someone next, from the state of their plan.
export function promptState(view: PlannerView, id: PromptId): "answered" | "skipped" | "todo" {
  if (id === "disclosure") return (view.disclosure?.status as "answered" | "skipped") ?? "todo";
  return view.core.answers[id]?.status ?? "todo";
}

export function nextAppRoute(view: PlannerView | null): string {
  if (!view) return "/app/about-you";
  const p = view.core.profile;
  if (!p.firstName || !p.decisionStyle) return "/app/about-you";
  if (!p.acknowledgedAt) return "/app/begin";
  const todo = PROMPTS.find((q) => promptState(view, q.id) === "todo");
  return todo ? `/app/q/${todo.id}` : "/app/review";
}

export function questionRoute(index: number): string {
  const q = PROMPTS[index];
  return q ? `/app/q/${q.id}` : "/app/review";
}
