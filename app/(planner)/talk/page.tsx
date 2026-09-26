"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PROMPTS } from "@/lib/content/prompts";
import { usePlan } from "@/lib/client/PlanProvider";
import { promptStatus } from "@/components/talk/ChapterProgress";

// Resume the conversation at the first question not yet answered or skipped.
export default function TalkIndex() {
  const { view } = usePlan();
  const router = useRouter();
  useEffect(() => {
    if (!view) return;
    const next = PROMPTS.find((p) => promptStatus(view, p.id) === "todo");
    router.replace(next ? `/talk/${next.id}` : "/review");
  }, [view, router]);
  return null;
}
