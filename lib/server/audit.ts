import fs from "node:fs";
import path from "node:path";
import type { AuditEntry, ChainStatus } from "@/lib/types";
import { sha256Hex } from "./crypto";
import { planDir } from "./vault";

// Append-only, hash-chained access logs (spec §9, §11.1, §11.3).
// Each entry commits to the previous entry's hash, and the latest hash is also written to a separate head file,
// so editing, reordering, or truncating the log is detectable by re-walking the chain.
//   "access"     who viewed, played, saved, accepted, or lost access to shared content
//   "disclosure" every read of the diagnosis/prognosis disclosure preference, kept as its own log
// Entries hold metadata only (who, what, when), never answer content.

export type AuditStream = "access" | "disclosure";

const GENESIS = "0".repeat(64);

function logPath(planId: string, stream: AuditStream) {
  return path.join(planDir(planId), `audit-${stream}.jsonl`);
}

function headPath(planId: string, stream: AuditStream) {
  return path.join(planDir(planId), `audit-${stream}.head`);
}

function entryHash(e: Omit<AuditEntry, "hash">): string {
  const body = JSON.stringify([e.seq, e.ts, e.actor.kind, e.actor.id ?? "", e.actor.name ?? "", e.action, e.resource ?? "", e.detail ?? ""]);
  return sha256Hex(`${e.prevHash}\n${body}`);
}

export function readLog(planId: string, stream: AuditStream): AuditEntry[] {
  const file = logPath(planId, stream);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEntry);
}

export function appendAudit(
  planId: string,
  stream: AuditStream,
  input: Pick<AuditEntry, "actor" | "action" | "resource" | "detail">,
  at: Date = new Date(),
): AuditEntry {
  const entries = readLog(planId, stream);
  const last = entries[entries.length - 1];
  const partial: Omit<AuditEntry, "hash"> = {
    seq: last ? last.seq + 1 : 1,
    ts: at.toISOString(),
    actor: input.actor,
    action: input.action,
    resource: input.resource,
    detail: input.detail,
    prevHash: last ? last.hash : GENESIS,
  };
  const entry: AuditEntry = { ...partial, hash: entryHash(partial) };
  fs.mkdirSync(planDir(planId), { recursive: true });
  fs.appendFileSync(logPath(planId, stream), JSON.stringify(entry) + "\n", { mode: 0o600 });
  fs.writeFileSync(headPath(planId, stream), entry.hash, { mode: 0o600 });
  return entry;
}

export function verifyChain(entries: AuditEntry[], expectedHead?: string | null): ChainStatus {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const { hash, ...rest } = e;
    if (e.seq !== i + 1 || e.prevHash !== prev || entryHash(rest) !== hash) {
      return { ok: false, entries: entries.length, head: prev, brokenAt: e.seq };
    }
    prev = hash;
  }
  if (expectedHead && expectedHead !== prev) {
    return { ok: false, entries: entries.length, head: prev, brokenAt: entries.length + 1 };
  }
  return { ok: true, entries: entries.length, head: prev };
}

export function verifyLog(planId: string, stream: AuditStream): ChainStatus {
  const head = fs.existsSync(headPath(planId, stream)) ? fs.readFileSync(headPath(planId, stream), "utf8").trim() : null;
  return verifyChain(readLog(planId, stream), head);
}
