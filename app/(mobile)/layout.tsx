"use client";

import { usePathname } from "next/navigation";
import { PlanProvider } from "@/lib/client/PlanProvider";
import { LinhProvider } from "@/lib/client/LinhProvider";
import { LinhStage } from "@/components/mobile/LinhStage";
import { LiveWave } from "@/components/mobile/LiveWave";
import { MobileFrame } from "@/components/mobile/MobileFrame";

// The Voceli mobile app. The assistant stays mounted at the top across every page, so the live call never drops while
// she moves the person through the screens beneath her, and the live waveform at the bottom shows the conversation is
// on. On the first screen she fills the phone and the page floats over her.
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const full = usePathname() === "/";
  return (
    <PlanProvider>
      <LinhProvider>
        <MobileFrame>
          <LinhStage size={full ? "full" : "compact"} />
          <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col">
            <div aria-hidden="true" className={`shrink-0 transition-[height] duration-700 ease-out ${full ? "h-0" : "h-[28%]"}`} />
            <div className={`flex min-h-0 flex-1 flex-col ${full ? "pointer-events-none" : "pointer-events-auto bg-paper"}`}>{children}</div>
            <LiveWave tone={full ? "dark" : "light"} />
          </div>
        </MobileFrame>
      </LinhProvider>
    </PlanProvider>
  );
}
