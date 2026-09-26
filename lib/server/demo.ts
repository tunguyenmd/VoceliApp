import fs from "node:fs";
import path from "node:path";
import type { Answer, ClipMeta, PlanCore, PromptId, SpectrumValue, Word } from "@/lib/types";
import { appendAudit } from "./audit";
import { buildPassages } from "./ai/material";
import { aiEnabled } from "./ai/provider";
import { aiSummary, templateSummary } from "./ai/summary";
import { randomId } from "./crypto";
import { quoteTiming } from "@/lib/grounding";
import { attachClip, createPlan, createShare, mutateCore, publish, saveDisclosure, transcriptsFor, writeClipAudio, writeTranscript } from "./plans";

// Demo persona: "Hoa", 71, a fictional planner. Her recordings are synthetic (see scripts/make-demo-audio.mjs)
// and are labelled as such everywhere they play.

interface PersonaClip {
  file: string;
  durationMs: number;
  text: string;
  words: Word[];
}

interface Persona {
  firstName: string;
  state: string;
  answers: Partial<Record<PromptId, { selected?: string[]; spectrum?: number; text?: string }>>;
  disclosure: { choice: "tell_all" | "tell_diagnosis" | "family_first" | "dont_tell"; who?: string };
  share: { name: string; relationship: string };
  clips: Record<string, PersonaClip>;
}

function loadPersona(): Persona {
  const file = path.join(process.cwd(), "demo", "persona.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Persona;
}

export async function seedDemo(stage: "answers" | "complete", origin: string): Promise<{ planId: string; link?: string }> {
  const persona = loadPersona();
  const core = createPlan(persona.firstName);
  const planId = core.id;
  const now = new Date().toISOString();

  await mutateCore(planId, (c) => {
    c.profile.state = persona.state;
    c.profile.acknowledgedAt = now;
    c.profile.voiceConsentAt = now;
    c.retention.legacyContact = { name: persona.share.name };
    for (const [pid, a] of Object.entries(persona.answers) as [PromptId, NonNullable<Persona["answers"][PromptId]>][]) {
      c.answers[pid] = {
        promptId: pid,
        status: "answered",
        selected: a.selected,
        spectrum: (a.spectrum as SpectrumValue) ?? undefined,
        text: a.text,
        clipIds: [],
        updatedAt: now,
      } satisfies Answer;
    }
  });

  // Recordings and transcripts, encrypted exactly like real ones.
  const disclosureClipIds: string[] = [];
  for (const [owner, clip] of Object.entries(persona.clips)) {
    const audio = fs.readFileSync(path.join(process.cwd(), "demo", clip.file));
    const meta: ClipMeta = {
      id: randomId(12),
      owner: owner as PromptId,
      createdAt: now,
      durationMs: clip.durationMs,
      mime: "audio/mp4",
      bytes: audio.length,
      transcript: owner === "disclosure" ? "none" : "done",
      synthetic: true,
    };
    writeClipAudio(planId, meta, audio);
    if (owner === "disclosure") {
      disclosureClipIds.push(meta.id);
      await mutateCore(planId, (c) => {
        c.clips[meta.id] = meta;
      });
    } else {
      writeTranscript(planId, { clipId: meta.id, text: clip.text, words: clip.words, provider: "amazon-transcribe", createdAt: now });
      await mutateCore(planId, (c: PlanCore) => attachClip(c, meta));
    }
  }
  await saveDisclosure(planId, () => ({
    status: "answered",
    choice: persona.disclosure.choice,
    who: persona.disclosure.who,
    clipIds: disclosureClipIds,
    updatedAt: now,
  }));
  appendAudit(planId, "disclosure", { actor: { kind: "planner" }, action: "disclosure.updated" });

  if (stage === "answers") return { planId };

  // Complete stage: summary (AI when available), approval, first published version, and an invite for Mai.
  const { core: seeded } = await mutateCore(planId, () => undefined);
  let summary = templateSummary(seeded);
  if (aiEnabled()) {
    try {
      const answers = Object.values(seeded.answers).filter((a): a is Answer => !!a);
      const transcripts = transcriptsFor(planId, Object.keys(seeded.clips));
      const drafted = await aiSummary(buildPassages(answers, transcripts), seeded.profile.firstName);
      if (drafted.sections.length) {
        for (const q of drafted.quotes) {
          if (!q.clipId) continue;
          const t = quoteTiming(q.text, transcripts[q.clipId]?.words ?? []);
          if (t) Object.assign(q, t);
        }
        summary = drafted;
      }
    } catch (e) {
      console.error("[heard] demo summary fell back to template:", (e as Error).message);
    }
  }
  await mutateCore(planId, (c) => {
    c.summary = { ...summary, approvedAt: new Date().toISOString() };
  });
  await publish(planId);
  const { token } = await createShare(planId, {
    name: persona.share.name,
    relationship: persona.share.relationship,
    scopes: { summary: true, recordings: true, message: true, disclosure: true },
  });
  return { planId, link: `${origin}/f/${token}` };
}
