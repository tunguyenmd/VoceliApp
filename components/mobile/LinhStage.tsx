"use client";

import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { useLinh } from "@/lib/client/LinhProvider";
import { Spinner } from "@/components/ui";

// The assistant, always at the top of the app: a still portrait until her live Tavus video arrives. On the first
// screen she fills the phone, with a see-through Play button in the middle; Play starts the conversation (and brings
// her back after a dropped call). Captions show what she says for anyone who can't hear (on the first screen, the page
// shows them). The stage sits behind the page, so its height can glide between full screen and the top of the phone.

// The still shown until her video arrives: the same face as the avatar (set at build time next to TAVUS_FACE_ID).
const PORTRAIT = process.env.NEXT_PUBLIC_HEARD_PORTRAIT || "/linh-v2.jpg";

function tail(text: string, max = 140): string {
  return text.length > max ? `…${text.slice(-max).replace(/^\S*\s/, "")}` : text;
}

export function LinhStage({ size }: { size: "full" | "compact" }) {
  const { phase, started, video, lastLinh, play } = useLinh();
  const videoEl = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoEl.current;
    if (!video || !el) return;
    video.attach(el);
    return () => {
      video.detach(el);
    };
  }, [video]);

  const live = phase === "live";
  const showPlay = !started;
  const starting = started && !live;
  return (
    <div
      className={`absolute inset-x-0 top-0 z-0 overflow-hidden bg-dusk-deep transition-[height] duration-700 ease-out ${size === "full" ? "h-full" : "h-[28%]"}`}
      aria-label="Your AI assistant"
    >
      <img
        src={PORTRAIT}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${video ? "opacity-0" : "opacity-100"} ${!live ? "linh-breathe" : ""}`}
      />
      <video ref={videoEl} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${video ? "opacity-100" : "opacity-0"}`} />

      {showPlay && (
        <button
          onClick={play}
          aria-label={phase === "error" || phase === "ended" ? "Start the conversation again" : "Start the conversation"}
          className="play-glass absolute left-1/2 top-1/2 z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        >
          <Play className="ml-1.5 h-10 w-10 fill-white/90 text-white/90" strokeWidth={1.5} />
        </button>
      )}
      {starting && (
        <div className="absolute left-1/2 top-1/2 z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
          <Spinner className="h-8 w-8 text-white/90" />
        </div>
      )}
      {(phase === "error" || phase === "ended") && (
        <p className="absolute inset-x-0 top-[calc(50%+4rem)] z-10 text-center text-[0.8rem] font-semibold text-white/90 drop-shadow">
          {phase === "error" ? "Couldn’t connect. Tap play to try again." : "Tap play to continue."}
        </p>
      )}

      {live && lastLinh && size === "compact" && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-4 pb-3 pt-10" aria-live="polite">
          <p className="line-clamp-2 text-[0.88rem] leading-snug text-white">{tail(lastLinh)}</p>
        </div>
      )}
    </div>
  );
}
