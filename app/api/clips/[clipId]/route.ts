import type { NextRequest } from "next/server";
import { PROMPT_BY_ID } from "@/lib/content/prompts";
import type { PromptId } from "@/lib/types";
import { appendAudit } from "@/lib/server/audit";
import { rangeResponse } from "@/lib/server/audio";
import { familyAudit, requireFamily, shouldLogPlay, touchShare } from "@/lib/server/family";
import { json } from "@/lib/server/http";
import { detachClip, latestPublished, mutateCore, readClipAudio, removeClipFiles, requireCore, saveDisclosure } from "@/lib/server/plans";
import { getPlannerPlanId, handler, HttpError, requirePlanner } from "@/lib/server/session";
import { clipAllowedForShare, plannerView, publishedDisclosure } from "@/lib/server/views";

function fileName(firstName: string, owner: string, mime: string) {
  const label = owner === "clarification" ? "Follow-up" : (PROMPT_BY_ID[owner as PromptId]?.eyebrow ?? "Recording");
  const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "m4a";
  return `${firstName || "Heard"} - ${label}.${ext}`.replace(/[^\w .-]/g, "");
}

// GET: stream a recording to its owner, or to a family member whose share covers it (every play and save is logged).
export const GET = handler(async (req: NextRequest, ctx: RouteContext<"/api/clips/[clipId]">) => {
  const { clipId } = await ctx.params;
  const shareId = req.nextUrl.searchParams.get("s");
  const download = req.nextUrl.searchParams.get("download") === "1";

  if (!shareId) {
    const planId = await getPlannerPlanId();
    if (!planId) throw new HttpError(401, "Not signed in");
    const core = requireCore(planId);
    const meta = core.clips[clipId];
    if (!meta) throw new HttpError(404, "Recording not found");
    const audio = readClipAudio(planId, meta);
    if (!audio) throw new HttpError(404, "Recording not found");
    return rangeResponse(req, audio, meta.mime);
  }

  const fam = await requireFamily(shareId);
  const published = latestPublished(fam.core);
  const meta = fam.core.clips[clipId];
  if (!published || !meta) throw new HttpError(404, "Recording not found");

  const isDisclosure = meta.owner === "disclosure";
  if (isDisclosure) {
    const snap = publishedDisclosure(fam.core.id, published.version);
    if (!fam.share.scopes.disclosure || !snap?.clipIds.includes(clipId)) throw new HttpError(403, "Not shared with you");
  } else if (!clipAllowedForShare(meta, published, fam.share.scopes)) {
    throw new HttpError(403, "Not shared with you");
  }

  const audio = readClipAudio(fam.core.id, meta);
  if (!audio) throw new HttpError(404, "Recording not found");
  const stream = isDisclosure ? "disclosure" : "access";
  const label = isDisclosure ? "disclosure recording" : PROMPT_BY_ID[meta.owner as PromptId]?.eyebrow ?? "follow-up recording";

  if (download) {
    familyAudit(fam, stream, "recording.saved", `clip ${clipId}`, `Saved a copy of "${label}" to their device`);
    await touchShare(fam, (s) => (s.savedCopies += 1));
    return rangeResponse(req, audio, meta.mime, {
      "content-disposition": `attachment; filename="${fileName(fam.core.profile.firstName, meta.owner, meta.mime)}"`,
    });
  }
  if (shouldLogPlay(fam.share.id, clipId)) {
    familyAudit(fam, stream, "recording.played", `clip ${clipId}`, `Listened to "${label}"`);
    await touchShare(fam, (s) => (s.lastAccessAt = new Date().toISOString()));
  }
  return rangeResponse(req, audio, meta.mime);
});

export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/clips/[clipId]">) => {
  const planId = await requirePlanner();
  const { clipId } = await ctx.params;
  const core = requireCore(planId);
  const meta = core.clips[clipId];
  if (!meta) throw new HttpError(404, "Recording not found");
  // Published versions keep referencing old clips, so only delete the audio if no version family can see uses it.
  const published = latestPublished(core);
  const stillShared = !!published?.clips.some((c) => c.id === clipId);
  if (!stillShared) removeClipFiles(planId, clipId);
  const { core: updated } = await mutateCore(planId, (c) => {
    detachClip(c, clipId);
    if (stillShared) c.clips[clipId] = meta; // keep metadata so family playback still works until republished
  });
  if (meta.owner === "disclosure") {
    await saveDisclosure(planId, (cur) => ({ ...cur, clipIds: cur.clipIds.filter((id) => id !== clipId), updatedAt: new Date().toISOString() }));
    appendAudit(planId, "disclosure", { actor: { kind: "planner" }, action: "disclosure.recording.deleted", resource: `clip ${clipId}` });
  }
  return json({ plan: plannerView(meta.owner === "disclosure" ? requireCore(planId) : updated) });
});
