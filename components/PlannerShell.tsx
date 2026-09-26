"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FileHeart, Home, MessageCircleHeart, ShieldCheck, Users, Video } from "lucide-react";
import { usePlan } from "@/lib/client/PlanProvider";
import { Wordmark } from "./Logo";

const NAV = [
  { href: "/plan", label: "My plan", icon: Home, match: ["/plan", "/next-steps"] },
  { href: "/live", label: "Talk with Linh", icon: Video, match: ["/live"], desktopOnly: true },
  { href: "/talk", label: "Conversation", icon: MessageCircleHeart, match: ["/talk", "/review"] },
  { href: "/summary", label: "Summary", icon: FileHeart, match: ["/summary"] },
  { href: "/share", label: "Family", icon: Users, match: ["/share"] },
  { href: "/privacy", label: "Privacy", icon: ShieldCheck, match: ["/privacy"] },
];

export function PlannerShell({ children }: { children: ReactNode }) {
  const { view, loading } = usePlan();
  const pathname = usePathname();
  const router = useRouter();
  const onStart = pathname === "/start";

  useEffect(() => {
    if (!loading && !view && !onStart) router.replace("/start");
  }, [loading, view, onStart, router]);

  const showNav = !!view && !onStart && !!view.core.profile.voiceConsentAt;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href={view ? "/plan" : "/"} aria-label="Heard home">
            <Wordmark />
          </Link>
          {showNav && (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              {NAV.map((n) => {
                const active = n.match.some((m) => pathname.startsWith(m));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-4 py-2 text-[0.95rem] font-semibold transition ${active ? "bg-dusk text-white" : "text-ink-soft hover:bg-sand"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <main className={`flex-1 ${showNav ? "pb-28 md:pb-12" : "pb-12"}`}>
        {loading && !onStart ? <ShellSkeleton /> : children}
      </main>

      {showNav && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {NAV.filter((n) => !n.desktopOnly).map((n) => {
              const active = n.match.some((m) => pathname.startsWith(m));
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-semibold ${active ? "text-dusk" : "text-ink-mute"}`}
                >
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-5 py-10" aria-busy="true" aria-label="Loading">
      <div className="shimmer h-8 w-1/2 rounded-full" />
      <div className="shimmer h-40 rounded-[1.75rem]" />
      <div className="shimmer h-24 rounded-[1.75rem]" />
    </div>
  );
}
