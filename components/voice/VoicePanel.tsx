"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Keyboard, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { ClipMeta, ClipOwner } from "@/lib/types";
import { VOICE_NOTICE } from "@/lib/content/copy";
import { usePlan, usePlanAction } from "@/lib/client/PlanProvider";
import { recordingSupported, useRecorder, type RecordingResult } from "@/lib/client/useRecorder";
import { formatClock, Spinner } from "../ui";
import { AudioPlayer } from "./AudioPlayer";
import { RecordButton } from "./RecordButton";
import { Waveform } from "./Waveform";

interface Props {
  owner: ClipOwner;
  clarificationId?: string;
  limitSec: number;
  targetSec: number;
  cue: string;
  clipIds: string[];
  live: boolean;
  tone?: "clay" | "plum";
  onTypeInstead?: () => void;
  onTranscript?: (clipId: string) => void;
  privateNote?: string;
}

export function VoicePanel(props: Props) {
  const { view } = usePlan();
  const act = usePlanAction();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continueFrom, setContinueFrom] = useState<string | null>(null);
  const [offerContinue, setOfferContinue] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [lastCaption, setLastCaption] = useState("");

  const panelRef = useRef<HTMLDivElement>(null);
  const recorder = useRecorder({
    limitSec: props.limitSec,
    live: props.live,
    onComplete: (r) => void upload(r),
  });

  if (!view) return null;
  const consented = !!view.core.profile.voiceConsentAt;
  const clips = props.clipIds.map((id) => view.core.clips[id]).filter(Boolean) as ClipMeta[];
  const recording = recorder.status === "recording" || recorder.status === "starting";

  async function upload(r: RecordingResult) {
    setSaving(true);
    setError(null);
    setLastCaption(recorder.caption);
    try {
      const form = new FormData();
      const ext = r.mime.includes("mp4") ? "m4a" : r.mime.includes("ogg") ? "ogg" : "webm";
      form.append("file", r.blob, `clip.${ext}`);
      form.append("owner", props.owner);
      form.append("durationMs", String(Math.round(r.durationMs)));
      if (r.autoSaved) form.append("autoSaved", "1");
      if (continueFrom) form.append("continuationOf", continueFrom);
      if (props.clarificationId) form.append("clarificationId", props.clarificationId);
      if (r.sttSessionId) form.append("sttSessionId", r.sttSessionId);
      const res = await act<{ clip: ClipMeta; transcript: { text: string } | null }>("/api/clips", { raw: form });
      setContinueFrom(null);
      setOfferContinue(r.autoSaved ? res.clip.id : null);
      if (res.transcript?.text) props.onTranscript?.(res.clip.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setLastCaption("");
    }
  }

  async function removeClip(id: string) {
    await act(`/api/clips/${id}`, { method: "DELETE" });
  }

  async function replaceAll() {
    setConfirmReplace(false);
    for (const c of clips) await removeClip(c.id);
    setContinueFrom(null);
    beginRecording();
  }

  function beginRecording() {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    void recorder.start();
  }

  function startContinuation(fromId: string) {
    setContinueFrom(fromId);
    setOfferContinue(null);
    beginRecording();
  }

  if (!consented) return <VoiceConsent />;

  if (!recordingSupported()) {
    return (
      <div className="rounded-2xl bg-sand p-5 text-ink-soft">
        This browser can&rsquo;t record audio. You can type your answer instead
        {props.onTypeInstead && (
          <button className="ml-1 font-semibold text-dusk underline" onClick={props.onTypeInstead}>
            here
          </button>
        )}
        .
      </div>
    );
  }

  const caption = recording ? recorder.caption : lastCaption;

  return (
    <div ref={panelRef} className="scroll-mt-24 rounded-[1.5rem] border border-line bg-paper/60 p-5 sm:p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <RecordButton
          recording={recording}
          busy={saving || recorder.status === "finishing"}
          elapsedMs={recorder.elapsedMs}
          limitSec={props.limitSec}
          targetSec={props.targetSec}
          label={recording ? "Stop recording" : clips.length ? "Record more" : "Record your answer"}
          onClick={() => {
            if (recording) void recorder.stop();
            else if (clips.length) startContinuation(clips[clips.length - 1].id);
            else beginRecording();
          }}
        />
        <div className="min-h-[1.5rem] text-[0.95rem] font-semibold tabular-nums text-ink-soft" aria-live="polite">
          {recording ? (
            <>
              {formatClock(recorder.elapsedMs)} <span className="font-normal text-ink-mute">/ {formatClock(props.limitSec * 1000)}</span>
            </>
          ) : saving || recorder.status === "finishing" ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-4 w-4" /> Saving your recording…
            </span>
          ) : clips.length ? (
            "Tap to add more, or record again below"
          ) : (
            props.cue
          )}
        </div>
        {recording && <Waveform analyser={recorder.analyser} active color={props.tone === "plum" ? "#6b5a8e" : "#c8643f"} className="max-w-sm" />}
        {props.live && caption && (
          <p className="max-w-lg text-[0.98rem] italic text-ink-soft" aria-live="polite">
            &ldquo;{caption.length > 220 ? `…${caption.slice(-220)}` : caption}&rdquo;
          </p>
        )}
        {props.privateNote && !recording && (
          <p className="inline-flex items-center gap-1.5 text-sm text-plum">
            <Lock className="h-3.5 w-3.5" /> {props.privateNote}
          </p>
        )}
      </div>

      {recorder.error && <p className="mt-4 rounded-xl bg-clay-soft px-4 py-3 text-[0.95rem]">{recorder.error}</p>}
      {error && <p className="mt-4 rounded-xl bg-clay-soft px-4 py-3 text-[0.95rem]">{error}</p>}

      <AnimatePresence>
        {offerContinue && !recording && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-gold-soft p-4 text-center sm:flex-row sm:text-left">
            <p className="flex-1">We saved your recording at the {formatClock(props.limitSec * 1000)} limit so nothing was lost. Want to keep going?</p>
            <button className="btn btn-primary" onClick={() => startContinuation(offerContinue)}>
              <Plus className="h-5 w-5" /> Continue in a new clip
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {clips.length > 0 && (
        <ul className="mt-6 space-y-3">
          {clips.map((c, i) => (
            <li key={c.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-line">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <AudioPlayer src={`/api/clips/${c.id}`} durationMs={c.durationMs} label={i === 0 ? "Your answer" : `Part ${i + 1}`} compact tone={props.tone === "plum" ? "plum" : "dusk"} />
                </div>
                <button className="btn btn-quiet h-10 min-h-0 w-10 p-0" aria-label="Delete this recording" onClick={() => removeClip(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {c.autoSaved && <p className="mt-2 text-sm text-ink-mute">Saved automatically at the time limit.</p>}
              {c.synthetic && <p className="mt-2 text-sm text-ink-mute">Demo voice (computer-generated).</p>}
              {view.transcripts[c.id] && (
                <details className="mt-2 text-[0.95rem] text-ink-soft">
                  <summary className="cursor-pointer select-none text-sm font-semibold text-ink-mute">Transcript</summary>
                  <p className="mt-1">{view.transcripts[c.id]}</p>
                </details>
              )}
              {c.transcript === "failed" && <p className="mt-2 text-sm text-ink-mute">We couldn&rsquo;t make a transcript this time. Your recording is saved.</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {props.onTypeInstead && (
          <button className="btn btn-quiet" onClick={props.onTypeInstead}>
            <Keyboard className="h-5 w-5" /> Type instead
          </button>
        )}
        {clips.length > 0 && !recording && !confirmReplace && (
          <button className="btn btn-quiet" onClick={() => setConfirmReplace(true)}>
            <RotateCcw className="h-5 w-5" /> Record again
          </button>
        )}
        {confirmReplace && (
          <span className="flex items-center gap-2 rounded-full bg-sand px-3 py-1.5">
            <span className="text-[0.95rem]">Replace what you recorded?</span>
            <button className="btn btn-primary min-h-0 px-4 py-1.5" onClick={replaceAll}>
              Replace
            </button>
            <button className="btn btn-quiet min-h-0 px-3 py-1.5" onClick={() => setConfirmReplace(false)}>
              Keep
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function VoiceConsent() {
  const act = usePlanAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[1.5rem] border border-dashed border-line bg-paper/60 p-5 text-center">
      {!open ? (
        <>
          <p className="text-ink-soft">Want your family to hear this in your own voice?</p>
          <button className="btn btn-outline mt-3" onClick={() => setOpen(true)}>
            Turn on voice recording
          </button>
        </>
      ) : (
        <div className="text-left">
          <ul className="space-y-2 text-[0.95rem] text-ink-soft">
            {VOICE_NOTICE.points.map((p) => (
              <li key={p} className="flex gap-2">
                <Lock className="mt-1 h-4 w-4 shrink-0 text-sage" /> {p}
              </li>
            ))}
          </ul>
          <button className="btn btn-primary mt-4" onClick={() => act("/api/plan", { method: "PATCH", body: { voiceConsent: true } })}>
            I agree to record my voice
          </button>
        </div>
      )}
    </div>
  );
}
