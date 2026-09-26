import type { Answer, ClipMeta, DisclosurePref, PlanCore, PromptId, PublishedPlan, Share, ShareScopes } from "@/lib/types";
import { processingDescription, demoMode, mobileFlow } from "./config";
import { liveConfigured } from "./live";
import { aiEnabled } from "./ai/provider";
import { sttEnabled } from "./stt/transcribe";
import { latestPublished, loadDisclosure, planNow, readTranscript } from "./plans";
import * as vault from "./vault";

export type PublicShare = Omit<Share, "tokenHash">;

export interface PlannerView {
  core: Omit<PlanCore, "shares"> & { shares: PublicShare[] };
  disclosure: DisclosurePref | null;
  transcripts: Record<string, string>;
  now: string;
  reviewDue: boolean;
  unpublishedChanges: boolean;
  processing: ReturnType<typeof processingDescription>;
  features: { ai: boolean; stt: boolean; demo: boolean; live: boolean };
  /** The questions the mobile app asks, in order. */
  flow: PromptId[];
}

function stripShare(s: Share): PublicShare {
  const { tokenHash: _t, ...rest } = s;
  void _t;
  return rest;
}

/** Everything the planner's own browser needs. Their own data, decrypted server-side for them only. */
export function plannerView(core: PlanCore): PlannerView {
  const disclosure = loadDisclosure(core.id);
  const transcripts: Record<string, string> = {};
  for (const clip of Object.values(core.clips)) {
    if (clip.owner === "disclosure" || clip.transcript !== "done") continue;
    const t = readTranscript(core.id, clip.id);
    if (t) transcripts[clip.id] = t.text;
  }
  const now = planNow(core);
  const published = latestPublished(core);
  return {
    core: { ...core, shares: core.shares.map(stripShare) },
    disclosure,
    transcripts,
    now: now.toISOString(),
    reviewDue: !!core.nextReviewAt && new Date(core.nextReviewAt) <= now,
    unpublishedChanges: hasUnpublishedChanges(core, published),
    processing: processingDescription(),
    features: { ai: aiEnabled() && core.profile.aiAssist, stt: sttEnabled() && core.profile.transcription, demo: demoMode(), live: liveConfigured() },
    flow: mobileFlow(),
  };
}

function answerFingerprint(a: Answer) {
  return JSON.stringify([a.promptId, a.status, a.selected ?? [], a.otherText ?? "", a.spectrum ?? null, !!a.unsure, a.text ?? "", a.clipIds]);
}

function hasUnpublishedChanges(core: PlanCore, published: PublishedPlan | null): boolean {
  const current = Object.values(core.answers).filter((a): a is Answer => !!a && a.promptId !== "disclosure");
  if (!published) return current.some((a) => a.status === "answered");
  const before = new Map(published.answers.map((a) => [a.promptId, answerFingerprint(a)]));
  if (current.length !== published.answers.length) return true;
  if (current.some((a) => before.get(a.promptId) !== answerFingerprint(a))) return true;
  const summaryChanged = (core.summary?.approvedAt ?? "") !== (published.summary?.approvedAt ?? "");
  const answeredNotes = core.clarity.filter((n) => n.state === "answered").length;
  return summaryChanged || answeredNotes !== published.clarifications.length;
}

// ---------- family ----------

export interface FamilyView {
  share: { id: string; name: string; relationship: string; scopes: ShareScopes };
  plan: PublishedPlan | null;
  transcripts: Record<string, string>;
  memorial: boolean;
}

export function clipAllowedForShare(clip: ClipMeta, published: PublishedPlan, scopes: ShareScopes): boolean {
  if (!published.clips.some((c) => c.id === clip.id)) return false;
  if (clip.owner === "family_message") return scopes.message;
  return scopes.recordings;
}

/** What a family member may see: the latest published version, filtered by the scopes of their share. */
export function familyView(core: PlanCore, share: Share): FamilyView {
  const published = latestPublished(core);
  const scopes = share.scopes;
  let plan: PublishedPlan | null = null;
  const transcripts: Record<string, string> = {};
  if (published) {
    const clips = published.clips.filter((c) => clipAllowedForShare(c, published, scopes));
    const clipIds = new Set(clips.map((c) => c.id));
    const answers = published.answers
      .filter((a) => (a.promptId === "family_message" ? scopes.message : true))
      .map((a) => ({ ...a, clipIds: a.clipIds.filter((id) => clipIds.has(id)) }));
    plan = {
      ...published,
      summary: scopes.summary ? published.summary : undefined,
      answers: scopes.summary || scopes.recordings ? answers : answers.filter((a) => a.promptId === "family_message"),
      clarifications: published.clarifications.map((c) => ({ ...c, clipIds: c.clipIds.filter((id) => clipIds.has(id)) })),
      clips,
      hasDisclosure: published.hasDisclosure && scopes.disclosure,
    };
    for (const id of clipIds) {
      const t = readTranscript(core.id, id);
      if (t) transcripts[id] = t.text;
    }
  }
  return {
    share: { id: share.id, name: share.name, relationship: share.relationship, scopes },
    plan,
    transcripts,
    memorial: core.retention.memorialMode,
  };
}

export function publishedDisclosure(planId: string, version: number): DisclosurePref | null {
  return vault.readJson<DisclosurePref>(planId, "disclosure", `disclosure-versions/${version}`);
}
