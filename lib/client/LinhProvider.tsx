"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RemoteTrack } from "livekit-client";
import { api } from "./api";
import { usePlan } from "./PlanProvider";
import type { PlannerView } from "@/lib/server/views";
import { VoiceRoom, type PlanEvent, type TranscriptSegment } from "./voiceRoom";

// One live session with the voice assistant for the whole mobile app. The app joins her room as soon as it opens
// (so her video is ready), and the Play tap starts the conversation: it unlocks audio, gives consent to keep answers in
// the person's own voice, opens the microphone, and tells her to begin. From then on she leads: she moves the app from
// question to question ("goto" events) and saves answers, which the open screen shows as they arrive. Pages tell her
// which screen is open, and the private screen holds the microphone closed so she can't hear it.

export type LinhPhase = "idle" | "connecting" | "ready" | "live" | "ended" | "error";

interface LinhContextValue {
  phase: LinhPhase;
  /** The person tapped Play (the conversation is under way). */
  started: boolean;
  error: string | null;
  agentState: string;
  video: RemoteTrack | null;
  lastLinh: string;
  lastYou: string;
  held: boolean;
  micLive: boolean;
  micError: string | null;
  /** For the live waveform: her voice, the person's microphone, and the audio context created by the Play tap. */
  agentAudio: MediaStreamTrack | null;
  micAudio: MediaStreamTrack | null;
  audioContext: AudioContext | null;
  /** Per question, how many times she has saved an answer this session (screens re-read the plan when it changes). */
  synced: Record<string, number>;
  play: () => void;
  disconnect: () => Promise<void>;
  holdMic: (reason: string, on: boolean) => void;
  showScreen: (screen: string) => void;
  notify: (text: string) => void;
}

const LinhContext = createContext<LinhContextValue | null>(null);

export function screenRoute(screen: string): string {
  if (screen === "welcome") return "/";
  if (screen === "done" || screen === "share" || screen === "review") return `/app/${screen}`;
  return `/app/q/${screen}`;
}

export function LinhProvider({ children }: { children: ReactNode }) {
  const { refresh, setView } = usePlan();
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<LinhPhase>("idle");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentState, setAgentState] = useState("initializing");
  const [video, setVideo] = useState<RemoteTrack | null>(null);
  const [lastLinh, setLastLinh] = useState("");
  const [lastYou, setLastYou] = useState("");
  const [holds, setHolds] = useState<string[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [agentAudio, setAgentAudio] = useState<MediaStreamTrack | null>(null);
  const [micAudio, setMicAudio] = useState<MediaStreamTrack | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [synced, setSynced] = useState<Record<string, number>>({});
  const roomRef = useRef<VoiceRoom | null>(null);
  const screenRef = useRef<string | null>(null);
  const sentRef = useRef<string | null>(null);
  const outbox = useRef<string[]>([]);
  const startedRef = useRef(false);
  const mountRef = useRef(0);
  // She joins a few seconds after the person; anything sent before her session runs would be lost.
  const readyRef = useRef(false);

  const send = useCallback(async (text: string) => {
    try {
      await roomRef.current?.sendText(text);
    } catch {
      /* the next screen change resends */
    }
  }, []);

  /** Sends the open screen (latest wins), then queued events in order, once she is listening for them. */
  const flush = useCallback(() => {
    if (!roomRef.current || !readyRef.current) return;
    const screen = screenRef.current;
    if (screen && sentRef.current !== screen) {
      sentRef.current = screen;
      void send(`[screen:${screen}]`);
    }
    for (const text of outbox.current.splice(0)) void send(text);
  }, [send]);

  const notify = useCallback(
    (text: string) => {
      outbox.current.push(text);
      flush();
    },
    [flush],
  );

  const onTranscript = useCallback((seg: TranscriptSegment) => {
    if (seg.who === "linh") setLastLinh(seg.text);
    else setLastYou(seg.text);
  }, []);

  const onAgentState = useCallback(
    (state: string) => {
      setAgentState(state);
      if (!readyRef.current && state !== "initializing") {
        readyRef.current = true;
        flush();
      }
    },
    [flush],
  );

  const onPlanEvent = useCallback(
    async (ev: PlanEvent) => {
      if (ev.type === "goto" && ev.screen) {
        // She is moving on: open that screen without telling her about it (she opened it herself).
        screenRef.current = sentRef.current = ev.screen;
        router.push(screenRoute(ev.screen));
        return;
      }
      await refresh().catch(() => {});
      const id = ev.questionId;
      if (ev.type === "answer" && id) setSynced((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
    },
    [refresh, router],
  );

  const reset = useCallback(() => {
    roomRef.current = null;
    sentRef.current = null;
    readyRef.current = false;
    setVideo(null);
    setAgentAudio(null);
    setMicAudio(null);
    setMicOn(false);
  }, []);

  /** The call is over (or never started): Play shows again, and brings her back. */
  const stop = useCallback((next: "ended" | "error") => {
    startedRef.current = false;
    setStarted(false);
    setPhase(next);
  }, []);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    reset();
    if (room) await room.disconnect();
    stop("ended");
  }, [reset, stop]);

  /** Mic on, consent recorded, and "[start]" queued: the conversation begins as soon as she is ready. */
  const begin = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      // The Play screen says answers are kept in the person's own voice; the tap is their go-ahead.
      const r = await api<{ plan: PlannerView }>("/api/plan", { method: "PATCH", body: { acknowledged: true, voiceConsent: true } });
      setView(r.plan);
    } catch {
      /* answers are still saved as text */
    }
    try {
      await room.setMicEnabled(true);
      setMicOn(true);
      setMicAudio(room.micTrack());
      setMicError(null);
    } catch {
      setMicError("Microphone blocked. You can type instead.");
    }
    notify("[voice-consent]");
    notify("[start]");
    setPhase("live");
  }, [notify, setView]);

  const connect = useCallback(
    async (fresh: boolean) => {
      if (roomRef.current) return;
      const mount = mountRef.current;
      sentRef.current = null;
      readyRef.current = false;
      setError(null);
      setPhase("connecting");
      const room = new VoiceRoom();
      roomRef.current = room;
      try {
        if (fresh) {
          // Opening the app starts a new conversation.
          const r = await api<{ plan: PlannerView }>("/api/plan", { body: {} });
          if (mount !== mountRef.current) throw new Error("stale");
          setView(r.plan);
        }
        const { serverUrl, participantToken } = await api<{ serverUrl: string; participantToken: string }>("/api/livekit/token", {
          method: "POST",
          body: { mode: "guide" },
        });
        if (mount !== mountRef.current) throw new Error("stale");
        await room.connect(
          serverUrl,
          participantToken,
          {
            onTranscript,
            onAgentState,
            onVideoTrack: setVideo,
            onAgentAudio: setAgentAudio,
            onPlanEvent: (ev) => void onPlanEvent(ev),
            onDisconnect: () => {
              if (roomRef.current !== room) return;
              reset();
              stop("ended");
            },
          },
          { mic: false },
        );
        if (mount !== mountRef.current || roomRef.current !== room) throw new Error("stale");
        if (fresh) void refresh().catch(() => {});
        if (startedRef.current) await begin();
        else setPhase("ready");
        flush();
      } catch (e) {
        void room.disconnect().catch(() => {});
        if (roomRef.current === room) roomRef.current = null;
        if ((e as Error).message === "stale") return;
        setError((e as Error).message || "Couldn't connect.");
        stop("error");
      }
    },
    [begin, flush, onAgentState, onPlanEvent, onTranscript, refresh, reset, setView, stop],
  );

  // Join as soon as the app opens. Opening it at the start ("/") begins a fresh conversation; any other screen (after
  // a reload) picks up the plan in progress.
  useEffect(() => {
    const mounts = mountRef;
    const mount = ++mounts.current;
    const timer = window.setTimeout(() => void connect(pathname === "/"), 0);
    return () => {
      window.clearTimeout(timer);
      if (mounts.current === mount) mounts.current++;
      const room = roomRef.current;
      reset();
      void room?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(() => {
    // Inside the tap: browsers only let a page play sound, and analyse it, after a gesture.
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx && !audioContext) {
      try {
        const ctx = new Ctx();
        void ctx.resume();
        setAudioContext(ctx);
      } catch {
        /* the waveform falls back to a gentle animation */
      }
    }
    void roomRef.current?.startAudio().catch(() => {});
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    if (phase === "ready") void begin();
    else if (phase === "ended" || phase === "error") void connect(false);
    // Still connecting: connect() calls begin() when it's done.
  }, [audioContext, begin, connect, phase]);

  // The microphone is open once the conversation has started, except while a page holds it closed.
  const held = holds.length > 0;
  const micLive = phase === "live" && micOn && !held;
  useEffect(() => {
    const room = roomRef.current;
    if (phase !== "live" || !micOn || !room) return;
    room
      .setMicEnabled(!held)
      .then(() => setMicAudio(held ? null : room.micTrack())) // a reopened microphone is a new track
      .catch(() => {});
  }, [held, micOn, phase]);

  const value = useMemo<LinhContextValue>(
    () => ({
      phase,
      started,
      error,
      agentState,
      video,
      lastLinh,
      lastYou,
      held,
      micLive,
      micError,
      agentAudio,
      micAudio,
      audioContext,
      synced,
      play,
      disconnect,
      holdMic: (reason, on) => setHolds((hs) => (on ? (hs.includes(reason) ? hs : [...hs, reason]) : hs.filter((h) => h !== reason))),
      showScreen: (screen) => {
        screenRef.current = screen;
        flush();
      },
      notify,
    }),
    [phase, started, error, agentState, video, lastLinh, lastYou, held, micLive, micError, agentAudio, micAudio, audioContext, synced, play, disconnect, flush, notify],
  );
  return <LinhContext.Provider value={value}>{children}</LinhContext.Provider>;
}

export function useLinh() {
  const ctx = useContext(LinhContext);
  if (!ctx) throw new Error("useLinh must be used inside LinhProvider");
  return ctx;
}

/** Tell her which screen is open; `private` also closes the microphone while the screen is shown. */
export function useLinhScreen(screen: string, opts: { private?: boolean } = {}) {
  const { showScreen, holdMic } = useLinh();
  useEffect(() => {
    showScreen(screen);
  }, [screen, showScreen]);
  useEffect(() => {
    if (!opts.private) return;
    holdMic("private", true);
    return () => holdMic("private", false);
  }, [opts.private, holdMic]);
}
