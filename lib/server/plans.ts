import type {
  Answer,
  ClipMeta,
  DisclosurePref,
  LifeEvent,
  PlanCore,
  PublishedClarification,
  PublishedPlan,
  Share,
  ShareScopes,
  Transcript,
} from "@/lib/types";
import { appendAudit } from "./audit";
import { randomId, randomToken, sha256Hex } from "./crypto";
import { withLock } from "./lock";
import * as vault from "./vault";

export class NotFoundError extends Error {
  name = "NotFoundError";
}

export function newPlanCore(id: string, firstName = ""): PlanCore {
  const now = new Date().toISOString();
  return {
    id,
    profile: { firstName, createdAt: now, aiAssist: true, transcription: true },
    answers: {},
    clips: {},
    suggestions: [],
    clarity: [],
    shares: [],
    events: [],
    retention: { onAccountDelete: "revoke_all", memorialMode: false, inactiveYears: 3 },
    versions: [],
  };
}

export function createPlan(firstName = ""): PlanCore {
  const id = randomId(12);
  vault.createKeyring(id);
  const core = newPlanCore(id, firstName);
  vault.writeJson(id, "core", "core", core);
  return core;
}

export function loadCore(planId: string): PlanCore | null {
  if (!vault.planExists(planId)) return null;
  return vault.readJson<PlanCore>(planId, "core", "core");
}

export function requireCore(planId: string): PlanCore {
  const core = loadCore(planId);
  if (!core) throw new NotFoundError("Plan not found");
  return core;
}

/** Read-modify-write of the encrypted plan under a per-plan lock. Keep slow work (AI calls) outside `fn`. */
export async function mutateCore<T>(planId: string, fn: (core: PlanCore) => T | Promise<T>): Promise<{ core: PlanCore; result: T }> {
  return withLock(`plan:${planId}`, async () => {
    const core = requireCore(planId);
    const result = await fn(core);
    vault.writeJson(planId, "core", "core", core);
    return { core, result };
  });
}

/** The plan's notion of "now". The demo can shift it forward to show the annual check-in. */
export function planNow(core: Pick<PlanCore, "clockOffsetDays">): Date {
  return new Date(Date.now() + (core.clockOffsetDays ?? 0) * 86_400_000);
}

// ---------- disclosure preference (own key, own file, own log) ----------

export function loadDisclosure(planId: string): DisclosurePref | null {
  return vault.readJson<DisclosurePref>(planId, "disclosure", "disclosure");
}

export async function saveDisclosure(planId: string, update: (current: DisclosurePref) => DisclosurePref) {
  return withLock(`disclosure:${planId}`, async () => {
    const current = loadDisclosure(planId) ?? { status: "skipped", clipIds: [], updatedAt: new Date().toISOString() };
    const next = update(current);
    vault.writeJson(planId, "disclosure", "disclosure", next);
    return next;
  });
}

// ---------- clips & transcripts ----------

function clipDomain(meta: Pick<ClipMeta, "owner">): vault.KeyDomain {
  return meta.owner === "disclosure" ? "disclosure" : "voice";
}

export function writeClipAudio(planId: string, meta: ClipMeta, audio: Buffer) {
  vault.writeBlob(planId, clipDomain(meta), `clips/${vault.assertId(meta.id, "clip id")}`, audio);
}

export function readClipAudio(planId: string, meta: ClipMeta): Buffer | null {
  return vault.readBlob(planId, clipDomain(meta), `clips/${vault.assertId(meta.id, "clip id")}`);
}

export function removeClipFiles(planId: string, clipId: string) {
  vault.removeFile(planId, `clips/${vault.assertId(clipId, "clip id")}`);
  vault.removeFile(planId, `transcripts/${clipId}`);
}

export function writeTranscript(planId: string, t: Transcript) {
  vault.writeJson(planId, "voice", `transcripts/${vault.assertId(t.clipId, "clip id")}`, t);
}

export function readTranscript(planId: string, clipId: string): Transcript | null {
  return vault.readJson<Transcript>(planId, "voice", `transcripts/${vault.assertId(clipId, "clip id")}`);
}

export function transcriptsFor(planId: string, clipIds: string[]): Record<string, Transcript> {
  const out: Record<string, Transcript> = {};
  for (const id of clipIds) {
    const t = readTranscript(planId, id);
    if (t) out[id] = t;
  }
  return out;
}

/** Attach a new clip to whatever it answers. Runs inside mutateCore. */
export function attachClip(core: PlanCore, meta: ClipMeta) {
  core.clips[meta.id] = meta;
  const now = new Date().toISOString();
  if (meta.owner === "clarification") {
    const note = core.clarity.find((n) => n.id === meta.clarificationId);
    if (note) {
      note.response = { text: note.response?.text, clipIds: [...(note.response?.clipIds ?? []), meta.id], answeredAt: now };
      note.state = "answered";
    }
    return;
  }
  if (meta.owner === "disclosure") return; // attached to the disclosure file separately
  const existing = core.answers[meta.owner];
  core.answers[meta.owner] = {
    promptId: meta.owner,
    status: "answered",
    selected: existing?.selected,
    otherText: existing?.otherText,
    spectrum: existing?.spectrum,
    unsure: existing?.unsure,
    text: existing?.text,
    clipIds: [...(existing?.clipIds ?? []), meta.id],
    updatedAt: now,
  };
}

export function detachClip(core: PlanCore, clipId: string) {
  delete core.clips[clipId];
  for (const a of Object.values(core.answers)) {
    if (a && a.clipIds.includes(clipId)) {
      a.clipIds = a.clipIds.filter((id) => id !== clipId);
      a.updatedAt = new Date().toISOString();
    }
  }
  for (const n of core.clarity) {
    if (n.response?.clipIds.includes(clipId)) n.response.clipIds = n.response.clipIds.filter((id) => id !== clipId);
  }
  core.suggestions = core.suggestions.filter((s) => s.sourceClipId !== clipId || s.state === "accepted");
}

// ---------- publishing a version for family ----------

export function buildSnapshot(core: PlanCore, disclosure: DisclosurePref | null, version: number, publishedAt: string): PublishedPlan {
  const answers = Object.values(core.answers).filter((a): a is Answer => !!a && a.promptId !== "disclosure");
  const clarifications: PublishedClarification[] = core.clarity
    .filter((n) => n.state === "answered" && n.response && (n.response.text || n.response.clipIds.length))
    .map((n) => ({ noteId: n.id, question: n.followUp, text: n.response?.text, clipIds: n.response?.clipIds ?? [] }));
  const clipIds = new Set([...answers.flatMap((a) => a.clipIds), ...clarifications.flatMap((c) => c.clipIds)]);
  const lastEvent = core.events.length ? core.events[core.events.length - 1] : undefined;
  const previous = core.versions[core.versions.length - 1];
  const reviewedAfter = lastEvent && (!previous || lastEvent.createdAt > previous.publishedAt) ? lastEvent : undefined;
  return {
    version,
    publishedAt,
    firstName: core.profile.firstName,
    reviewedAfter,
    summary: core.summary,
    answers,
    clarifications,
    clips: [...clipIds].map((id) => core.clips[id]).filter(Boolean),
    hasDisclosure: !!disclosure && disclosure.status === "answered" && (!!disclosure.choice || !!disclosure.text || disclosure.clipIds.length > 0),
    lastReviewedAt: publishedAt,
    memorial: core.retention.memorialMode || undefined,
  };
}

export async function publish(planId: string): Promise<PublishedPlan> {
  const disclosure = loadDisclosure(planId);
  const { result } = await mutateCore(planId, (core) => {
    const now = planNow(core);
    const version = (core.versions[core.versions.length - 1]?.version ?? 0) + 1;
    const snapshot = buildSnapshot(core, disclosure, version, now.toISOString());
    vault.writeJson(planId, "core", `versions/${version}`, snapshot);
    // The disclosure preference is versioned too, but under its own key and in its own file.
    if (snapshot.hasDisclosure && disclosure) vault.writeJson(planId, "disclosure", `disclosure-versions/${version}`, disclosure);
    core.versions.push({ version, publishedAt: snapshot.publishedAt, afterEventId: snapshot.reviewedAfter?.id });
    core.lastReviewedAt = snapshot.publishedAt;
    const next = new Date(now);
    next.setFullYear(next.getFullYear() + 1);
    core.nextReviewAt = next.toISOString();
    return snapshot;
  });
  appendAudit(planId, "access", { actor: { kind: "planner" }, action: "plan.published", resource: `version ${result.version}` });
  return result;
}

export function readVersion(planId: string, version: number): PublishedPlan | null {
  return vault.readJson<PublishedPlan>(planId, "core", `versions/${version}`);
}

export function latestPublished(core: PlanCore): PublishedPlan | null {
  const v = core.versions[core.versions.length - 1];
  return v ? readVersion(core.id, v.version) : null;
}

// ---------- sharing ----------

type ShareIndex = Record<string, { planId: string; shareId: string }>;

export async function createShare(
  planId: string,
  input: { name: string; relationship: string; contact?: string; scopes: ShareScopes },
): Promise<{ share: Share; token: string }> {
  const token = randomToken();
  const share: Share = {
    id: randomId(9),
    name: input.name.trim().slice(0, 80),
    relationship: input.relationship.trim().slice(0, 60),
    contact: input.contact?.trim().slice(0, 120) || undefined,
    tokenHash: sha256Hex(token),
    createdAt: new Date().toISOString(),
    status: "invited",
    scopes: input.scopes,
    consents: [],
    savedCopies: 0,
  };
  await mutateCore(planId, (core) => {
    core.shares.push(share);
  });
  await withLock("share-index", async () => {
    const index = vault.readSystemJson<ShareIndex>("share-index", {});
    index[share.tokenHash] = { planId, shareId: share.id };
    index[`id:${share.id}`] = { planId, shareId: share.id };
    vault.writeSystemJson("share-index", index);
  });
  appendAudit(planId, "access", {
    actor: { kind: "planner" },
    action: "share.created",
    resource: `share ${share.id}`,
    detail: `Invited ${share.name} (${share.relationship}): ${scopeText(share.scopes)}`,
  });
  return { share, token };
}

export function scopeText(s: ShareScopes) {
  const parts = [s.summary && "summary card", s.recordings && "recordings", s.message && "family message", s.disclosure && "disclosure preference"].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing";
}

export function resolveShareToken(token: string): { planId: string; shareId: string } | null {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const index = vault.readSystemJson<ShareIndex>("share-index", {});
  return index[sha256Hex(token)] ?? null;
}

export function resolveShareId(shareId: string): { planId: string; shareId: string } | null {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(shareId)) return null;
  const index = vault.readSystemJson<ShareIndex>("share-index", {});
  return index[`id:${shareId}`] ?? null;
}

export async function removeShareIndexForPlan(planId: string) {
  await withLock("share-index", async () => {
    const index = vault.readSystemJson<ShareIndex>("share-index", {});
    for (const [k, v] of Object.entries(index)) if (v.planId === planId) delete index[k];
    vault.writeSystemJson("share-index", index);
  });
}

// ---------- life events ----------

export function addLifeEvent(core: PlanCore, input: Pick<LifeEvent, "type" | "note" | "date">): LifeEvent {
  const event: LifeEvent = { id: randomId(9), type: input.type, note: input.note?.slice(0, 280), date: input.date, createdAt: planNow(core).toISOString() };
  core.events.push(event);
  // A major life event makes the plan due for review now rather than at the annual date (spec §7).
  core.nextReviewAt = event.createdAt;
  return event;
}

// ---------- deletion ----------

export async function deletePlan(planId: string) {
  await withLock(`plan:${planId}`, async () => {
    const core = loadCore(planId);
    if (!core) return;
    if (core.retention.onAccountDelete === "keep_shared" && core.versions.length) {
      // Keep what families already have (published versions and the clips they reference); scrub everything else.
      const keep = new Set<string>();
      for (const v of core.versions) readVersion(planId, v.version)?.clips.forEach((c) => keep.add(c.id));
      for (const id of Object.keys(core.clips)) if (!keep.has(id)) removeClipFiles(planId, id);
      core.archivedAt = new Date().toISOString();
      core.answers = {};
      core.suggestions = [];
      core.clarity = [];
      core.events = [];
      core.clips = Object.fromEntries(Object.entries(core.clips).filter(([id]) => keep.has(id)));
      vault.writeJson(planId, "core", "core", core);
      appendAudit(planId, "access", { actor: { kind: "planner" }, action: "account.deleted", detail: "Drafts erased; shared versions kept for family" });
      return;
    }
    vault.destroyKeyring(planId);
    vault.removePlanDir(planId);
  });
  if (!vault.planExists(planId)) await removeShareIndexForPlan(planId);
}
