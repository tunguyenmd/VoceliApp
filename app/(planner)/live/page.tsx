"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { RemoteTrack } from "livekit-client";
import { ArrowRight, Check, Keyboard, Lock, Mic, MicOff, PhoneOff, Send, ShieldCheck, Sparkles } from "lucide-react";
import type { DisclosureChoice, PromptId } from "@/lib/types";
import { VOICE_NOTICE } from "@/lib/content/copy";
import { PROMPTS, optionLabel, spectrumStop } from "@/lib/content/prompts";
import { api } from "@/lib/client/api";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { VoiceRoom, type TranscriptSegment } from "@/lib/client/voiceRoom";
import { promptStatus } from "@/components/talk/ChapterProgress";
import { DisclosureChoices } from "@/components/talk/inputs";
import { Spinner } from "@/components/ui";
import { AudioPlayer } from "@/components/voice/AudioPlayer";
import type { PlannerView } from "@/lib/server/views";

const PRIVATE_DONE = "[private-question-done]";
/** The 2-minute demo path: the most visual question, the private one, and the message to family. */
const SHORT_DEMO: PromptId[] = ["matters_most", "disclosure", "family_message"];
const ROLE_LINE = "AI assistant · not a doctor or healthcare professional";

type Phase = "intro" | "connecting" | "live" | "ended";

/** Captions show the newest part of a long utterance so they never cover Linh's face. */
function tail(text: string, max = 170): string {
  return text.length > max ? `…${text.slice(-max).replace(/^\S*\s/, "")}` : text;
}

function answerSummary(view: PlannerView, id: PromptId): string | null {
  const a = view.core.answers[id];
  if (!a || a.status !== "answered") return null;
  if (a.selected?.length) return a.selected.filter((x) => x !== "other").map((x) => optionLabel(id, x)).concat(a.otherText ? [a.otherText] : []).join(" · ");
  if (a.spectrum) return spectrumStop(a.spectrum)?.label ?? null;
  if (a.unsure) return "Not sure yet";
  const spoken = a.clipIds.map((c) => view.transcripts[c]).find(Boolean);
  if (spoken) return `“${spoken.length > 90 ? `${spoken.slice(0, 90)}…` : spoken}”`;
  return a.text ? `“${a.text.slice(0, 90)}”` : null;
}

export default function LivePage() {
  return (
    <Suspense fallback={null}>
      <LiveConversation />
    </Suspense>
  );
}

function LiveConversation() {
  const short = useSearchParams().get("demo") === "short";
  const { view, refresh } = usePlan();
  const act = usePlanAction();
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [agentState, setAgentState] = useState("initializing");
  const [video, setVideo] = useState<RemoteTrack | null>(null);
  const [lines, setLines] = useState<TranscriptSegment[]>([]);
  const [mic, setMic] = useState(true);
  const [typed, setTyped] = useState("");
  const [showType, setShowType] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const roomRef = useRef<VoiceRoom | null>(null);
  const videoEl = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoEl.current;
    if (!video || !el) return;
    video.attach(el);
    return () => {
      video.detach(el);
    };
  }, [video]);

  // Watch the plan fill in while Linh saves answers.
  useEffect(() => {
    if (phase !== "live") return;
    const t = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(t);
  }, [phase, refresh]);

  // Recordings finish uploading a few seconds after the last answer; keep refreshing briefly after the call.
  useEffect(() => {
    if (phase !== "ended") return;
    let n = 0;
    const t = window.setInterval(() => {
      void refresh();
      if (++n >= 8) window.clearInterval(t);
    }, 2000);
    return () => window.clearInterval(t);
  }, [phase, refresh]);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  const onTranscript = useCallback((seg: TranscriptSegment) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === seg.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = seg;
        return next;
      }
      return [...prev.slice(-30), seg];
    });
  }, []);

  if (!view) return null;
  const inPlay = short ? PROMPTS.filter((p) => SHORT_DEMO.includes(p.id)) : PROMPTS;
  const current = inPlay.find((p) => promptStatus(view, p.id) === "todo");
  const consented = !!view.core.profile.voiceConsentAt;

  async function start() {
    setError(null);
    setPhase("connecting");
    try {
      const { serverUrl, participantToken } = await api<{ serverUrl: string; participantToken: string }>("/api/livekit/token", {
        method: "POST",
        body: short ? { focus: SHORT_DEMO } : {},
      });
      const vr = new VoiceRoom();
      roomRef.current = vr;
      setStartedAt(new Date().toISOString());
      setLines([]);
      await vr.connect(serverUrl, participantToken, {
        onTranscript,
        onAgentState: setAgentState,
        onVideoTrack: setVideo,
        onDisconnect: () => {
          setPhase("ended");
          void refresh();
        },
        // Linh leaves the room a few seconds after her goodbye: close the call for the person too.
        onAgentLeft: () => void end(),
      });
      setMic(true);
      setPhase("live");
    } catch (e) {
      setError((e as Error).message || "Couldn't start the conversation.");
      setPhase("intro");
    }
  }

  async function end() {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setVideo(null);
    setPhase("ended");
    void refresh();
  }

  async function sendTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || !roomRef.current) return;
    await roomRef.current.sendText(text);
    onTranscript({ id: `typed-${Date.now()}`, who: "you", text, final: true });
    setTyped("");
  }

  const lastLinh = [...lines].reverse().find((l) => l.who === "linh");
  const lastYou = [...lines].reverse().find((l) => l.who === "you");
  const answered = inPlay.filter((p) => promptStatus(view, p.id) === "answered").length;
  const sessionClips = Object.values(view.core.clips)
    .filter((c) => c.live && startedAt && c.createdAt >= startedAt && c.owner !== "clarification")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="mx-auto max-w-6xl px-5 pt-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Talk it through</p>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">A conversation with Linh</h1>
        </div>
        <p className="text-ink-soft">
          {short && <span className="mr-2 rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold text-ink">Short demo · {inPlay.length} of {PROMPTS.length} questions</span>}
          {answered} of {inPlay.length} answered
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Stage */}
        <section>
          <div className="relative overflow-hidden rounded-[1.75rem] bg-dusk-deep shadow-[var(--shadow-lift)]">
            <div className="relative aspect-video">
              {phase === "live" || phase === "connecting" ? (
                <>
                  <video ref={videoEl} autoPlay playsInline muted className={`h-full w-full object-cover transition-opacity duration-700 ${video ? "opacity-100" : "opacity-0"}`} />
                  {!video && (
                    <div className="absolute inset-0">
                      {phase === "live" && agentState !== "initializing" ? (
                        // Voice-only (no avatar configured or it couldn't join): show Linh's portrait, softly breathing.
                        <img src="/linh.jpg" alt="Linh" className={`h-full w-full object-cover transition ${agentState === "speaking" ? "scale-[1.015]" : ""}`} />
                      ) : (
                        <>
                          <img src="/linh.jpg" alt="" className="h-full w-full object-cover opacity-60 blur-[2px]" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                            <Spinner className="h-8 w-8" />
                            <p className="text-lg font-semibold">{phase === "connecting" ? "Connecting…" : "Linh is joining…"}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <img src="/linh.jpg" alt="Linh, your AI assistant" className="h-full w-full object-cover" />
              )}
              {/* Linh's role is always on screen, so everyone watching knows what she is. */}
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/55 px-3.5 py-1.5 text-[0.85rem] font-semibold text-white backdrop-blur">
                <Sparkles className="h-4 w-4 text-gold" /> Linh · {ROLE_LINE}
              </div>
              {phase === "live" && (
                <div className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-[0.8rem] font-semibold capitalize text-white backdrop-blur" aria-live="polite">
                  {agentState === "speaking" ? "Speaking" : agentState === "thinking" ? "Thinking…" : agentState === "listening" ? "Listening" : "Getting ready"}
                </div>
              )}
              {phase === "live" && (lastLinh || lastYou) && (
                <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-5 pb-4 pt-12 text-white" aria-live="polite">
                  {lastLinh && (
                    <p className="line-clamp-2 text-[1.05rem] leading-snug">
                      <span className="font-bold text-gold">Linh: </span>
                      {tail(lastLinh.text)}
                    </p>
                  )}
                  {lastYou && (
                    <p className="line-clamp-1 text-[0.95rem] leading-snug text-white/80">
                      <span className="font-bold">You: </span>
                      {tail(lastYou.text)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {phase === "intro" && (
              <motion.div key="intro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card mt-5 p-6">
                <h2 className="font-display text-2xl">Meet Linh</h2>
                <p className="mt-2 text-ink-soft">
                  Linh is an <strong className="text-ink">AI assistant, not a doctor or any kind of healthcare professional</strong>. She&rsquo;ll ask the same gentle
                  questions as the written conversation, one at a time, and save your answers to your plan as you go. You can skip anything, type instead of talking, or
                  stop at any time. Nothing is shared until you choose who sees it.
                </p>
                <ul className="mt-4 space-y-2 text-[0.95rem] text-ink-soft">
                  <li className="flex gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> The question about how you&rsquo;d want to hear serious news stays on your screen; Linh never hears or records it.
                  </li>
                  <li className="flex gap-2">
                    <Mic className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                    {consented ? "Your spoken answers are saved as recordings in your own voice, encrypted, for the people you choose." : "You haven't turned on voice recording, so Linh will save your answers as text only."}
                  </li>
                  <li className="flex gap-2">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> The conversation runs through LiveKit and OpenAI models. It isn&rsquo;t used to train them.
                  </li>
                </ul>
                {!consented && (
                  <div className="mt-4 rounded-2xl bg-sand p-4 text-[0.93rem] text-ink-soft">
                    <p className="font-semibold text-ink">Want your family to hear your answers in your voice?</p>
                    <p className="mt-1">{VOICE_NOTICE.points[1]}</p>
                    <button className="btn btn-outline mt-3 min-h-0 py-2" onClick={() => act("/api/plan", { method: "PATCH", body: { voiceConsent: true } })}>
                      I agree to record my voice
                    </button>
                  </div>
                )}
                {!view.features.live && <p className="mt-4 rounded-xl bg-clay-soft px-4 py-3">Live conversation isn&rsquo;t configured on this server (LiveKit keys missing).</p>}
                {error && <p className="mt-4 rounded-xl bg-clay-soft px-4 py-3">{error}</p>}
                <button className="btn btn-primary mt-5" onClick={start} disabled={!view.features.live}>
                  <Mic className="h-5 w-5" /> Start talking with Linh
                </button>
              </motion.div>
            )}

            {phase === "live" && (
              <motion.div key="controls" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className={`btn ${mic ? "btn-outline" : "bg-clay text-white"}`}
                    onClick={async () => {
                      await roomRef.current?.setMicEnabled(!mic);
                      setMic(!mic);
                    }}
                    aria-pressed={!mic}
                  >
                    {mic ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />} {mic ? "Mute" : "Unmute"}
                  </button>
                  <button className="btn btn-outline" onClick={() => setShowType((v) => !v)}>
                    <Keyboard className="h-5 w-5" /> Type instead
                  </button>
                  <div className="flex-1" />
                  <button className="btn bg-clay text-white" onClick={end}>
                    <PhoneOff className="h-5 w-5" /> End
                  </button>
                </div>
                {showType && (
                  <form onSubmit={sendTyped} className="mt-3 flex gap-2">
                    <input className="field" autoFocus placeholder="Type your answer…" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={1000} />
                    <button className="btn btn-primary" aria-label="Send">
                      <Send className="h-5 w-5" />
                    </button>
                  </form>
                )}
              </motion.div>
            )}

            {phase === "ended" && (
              <motion.div key="ended" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mt-5 p-6">
                <h2 className="font-display text-2xl">Thank you for sharing.</h2>
                <p className="mt-2 text-ink-soft">Everything Linh saved is in your plan. Look it over, change anything, and decide who can see it.</p>
                {sessionClips.length > 0 && (
                  <div className="mt-5">
                    <p className="eyebrow mb-2 flex items-center gap-2">
                      <Mic className="h-4 w-4 text-clay" /> What your family will hear: you, not Linh
                    </p>
                    <ul className="space-y-2">
                      {sessionClips.map((c) => (
                        <li key={c.id} className="rounded-2xl bg-paper p-3 ring-1 ring-line">
                          <AudioPlayer src={`/api/clips/${c.id}`} durationMs={c.durationMs} label={PROMPTS.find((p) => p.id === c.owner)?.eyebrow ?? "Your answer"} tone="clay" compact />
                          {view.transcripts[c.id] && <p className="mt-1.5 pl-1 text-[0.9rem] italic text-ink-soft">&ldquo;{view.transcripts[c.id]}&rdquo;</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/review" className="btn btn-primary">
                    Review my answers <ArrowRight className="h-5 w-5" />
                  </Link>
                  <button className="btn btn-outline" onClick={() => setPhase("intro")}>
                    Talk again
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* The plan, filling in */}
        <aside className="card h-fit p-5 sm:p-6">
          <h2 className="font-display text-xl">Your plan, filling in</h2>
          <p className="mt-1 text-sm text-ink-mute">Linh saves each answer as you go. You can change anything later.</p>
          <ol className="mt-4 space-y-2.5">
            {inPlay.map((p) => {
              const st = promptStatus(view, p.id);
              const isCurrent = phase === "live" && current?.id === p.id;
              const summary = p.id === "disclosure" ? (st === "answered" ? "Answered privately on screen" : null) : answerSummary(view, p.id);
              const clips = p.id === "disclosure" ? [] : (view.core.answers[p.id]?.clipIds ?? []);
              const liveClips = clips.filter((id) => view.core.clips[id]?.live).length;
              return (
                <li key={p.id} className={`rounded-2xl p-3.5 transition ${isCurrent ? "bg-gold-soft ring-2 ring-gold/60" : st === "answered" ? "bg-sage-soft/60" : "bg-paper"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${st === "answered" ? "bg-sage text-white" : st === "skipped" ? "bg-sand-deep" : isCurrent ? "bg-gold text-white" : "bg-sand-deep/60"}`}>
                      {st === "answered" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : isCurrent ? <Sparkles className="h-3.5 w-3.5" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold">
                        {p.eyebrow} {p.sensitive && <Lock className="h-3.5 w-3.5 text-plum" />}
                      </p>
                      {summary && <p className="text-[0.92rem] text-ink-soft">{summary}</p>}
                      {st === "skipped" && <p className="text-[0.92rem] text-ink-mute">Skipped</p>}
                      {liveClips > 0 && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-clay">
                          <Mic className="h-3 w-3" /> Saved in your voice
                        </p>
                      )}
                    </div>
                  </div>
                  {isCurrent && p.id === "disclosure" && <PrivateQuestion room={roomRef} />}
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}

/** The disclosure question is answered here, on screen only; Linh is told it's done, never what was chosen. */
function PrivateQuestion({ room }: { room: React.RefObject<VoiceRoom | null> }) {
  const act = usePlanAction();
  const [choice, setChoice] = useState<DisclosureChoice | null>(null);
  const [unsure, setUnsure] = useState(false);
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish(status: "answered" | "skipped") {
    setBusy(true);
    try {
      await act("/api/answers/disclosure", { method: "PUT", body: status === "skipped" ? { status } : { status, choice, unsure, who } });
      await room.current?.sendText(PRIVATE_DONE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-plum/30">
      <p className="font-display text-lg leading-snug">If you were diagnosed with a serious illness, how would you want to hear about it?</p>
      <p className="mb-3 mt-1 text-sm text-plum">Just between you and your plan. Linh won&rsquo;t hear or record this.</p>
      <DisclosureChoices value={choice} unsure={unsure} onChange={setChoice} onUnsure={setUnsure} />
      <input className="field mt-3" placeholder="Who should be with you, or hear it first? (optional)" value={who} onChange={(e) => setWho(e.target.value)} maxLength={200} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn min-h-0 bg-plum py-2 text-white" disabled={busy || (!choice && !unsure)} onClick={() => finish("answered")}>
          {busy ? <Spinner /> : <Check className="h-4 w-4" />} Save and continue
        </button>
        <button className="btn btn-quiet min-h-0 py-2" disabled={busy} onClick={() => finish("skipped")}>
          Skip this one
        </button>
      </div>
    </div>
  );
}
