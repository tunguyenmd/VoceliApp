import type { PlanCore, Share } from "@/lib/types";
import { appendAudit, type AuditStream } from "./audit";
import { loadCore, mutateCore, resolveShareId, resolveShareToken } from "./plans";
import { getFamilyDevice, HttpError } from "./session";

export interface FamilyContext {
  core: PlanCore;
  share: Share;
  device: string;
}

export function findShare(core: PlanCore, shareId: string): Share | undefined {
  return core.shares.find((s) => s.id === shareId);
}

/** Resolve a family request from its share id + device cookie; logs and rejects anything no longer allowed. */
export async function requireFamily(shareId: string): Promise<FamilyContext> {
  const ref = resolveShareId(shareId);
  const core = ref ? loadCore(ref.planId) : null;
  const share = core ? findShare(core, shareId) : undefined;
  if (!core || !share) throw new HttpError(404, "This link is no longer available");
  const device = await getFamilyDevice(shareId);
  if (!device) throw new HttpError(401, "Please open your invite link to continue");
  if (share.status !== "active") {
    appendAudit(core.id, "access", { actor: { kind: "family", id: share.id, name: share.name }, action: "access.denied", detail: "Access was revoked" });
    throw new HttpError(403, "Access has been turned off");
  }
  return { core, share, device };
}

export function resolveToken(token: string) {
  const ref = resolveShareToken(token);
  const core = ref ? loadCore(ref.planId) : null;
  const share = core && ref ? findShare(core, ref.shareId) : undefined;
  return core && share ? { core, share } : null;
}

export function familyAudit(ctx: FamilyContext, stream: AuditStream, action: string, resource?: string, detail?: string) {
  appendAudit(ctx.core.id, stream, { actor: { kind: "family", id: ctx.share.id, name: ctx.share.name }, action, resource, detail });
}

// Browsers fetch audio in several Range requests per play; count a play once per minute per clip per person.
const g = globalThis as unknown as { __heardPlays?: Map<string, number> };
const recentPlays: Map<string, number> = (g.__heardPlays ??= new Map());

export function shouldLogPlay(shareId: string, clipId: string): boolean {
  const key = `${shareId}:${clipId}`;
  const now = Date.now();
  const last = recentPlays.get(key) ?? 0;
  if (now - last < 60_000) return false;
  recentPlays.set(key, now);
  return true;
}

export async function touchShare(ctx: FamilyContext, patch: (s: Share) => void) {
  await mutateCore(ctx.core.id, (core) => {
    const s = findShare(core, ctx.share.id);
    if (s) patch(s);
  });
}
