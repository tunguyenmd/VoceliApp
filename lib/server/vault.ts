import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dataDir } from "./config";
import { getKek, open, seal } from "./crypto";

// Encrypted file store. Each plan lives in .data/plans/<planId>/ and every file in it except the audit logs is
// AES-256-GCM ciphertext under one of the plan's data keys:
//   core        answers, clip metadata, shares, summary, settings
//   disclosure  the diagnosis/prognosis disclosure preference (spec §8, §11.3) — its own key and file
//   voice       audio clips and transcripts (spec §11.5: a transcript is a second sensitive copy)

export type KeyDomain = "core" | "disclosure" | "voice";
const DOMAINS: KeyDomain[] = ["core", "disclosure", "voice"];

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function assertId(id: string, what = "id"): string {
  if (!ID_RE.test(id)) throw new Error(`Invalid ${what}`);
  return id;
}

export function planDir(planId: string): string {
  return path.join(dataDir(), "plans", assertId(planId, "plan id"));
}

interface Keyring {
  v: 1;
  createdAt: string;
  keys: Partial<Record<KeyDomain, string>>;
}

const g = globalThis as unknown as { __heardDekCache?: Map<string, Buffer> };
const dekCache: Map<string, Buffer> = (g.__heardDekCache ??= new Map());

function keyringPath(planId: string) {
  return path.join(planDir(planId), "keyring.json");
}

export function createKeyring(planId: string) {
  const dir = planDir(planId);
  fs.mkdirSync(dir, { recursive: true });
  const ring: Keyring = { v: 1, createdAt: new Date().toISOString(), keys: {} };
  for (const domain of DOMAINS) {
    const dek = crypto.randomBytes(32);
    ring.keys[domain] = seal(getKek(), dek, `kek:${planId}:${domain}`).toString("base64");
    dekCache.set(`${planId}:${domain}`, dek);
  }
  atomicWrite(keyringPath(planId), Buffer.from(JSON.stringify(ring, null, 2)));
}

function dek(planId: string, domain: KeyDomain): Buffer {
  const cacheKey = `${planId}:${domain}`;
  const hit = dekCache.get(cacheKey);
  if (hit) return hit;
  const file = keyringPath(planId);
  if (!fs.existsSync(file)) throw new Error("Plan keys not found (the plan may have been deleted)");
  const ring = JSON.parse(fs.readFileSync(file, "utf8")) as Keyring;
  const wrapped = ring.keys[domain];
  if (!wrapped) throw new Error(`No ${domain} key for this plan`);
  const key = open(getKek(), Buffer.from(wrapped, "base64"), `kek:${planId}:${domain}`);
  dekCache.set(cacheKey, key);
  return key;
}

/** Crypto-shredding: once the wrapped keys are gone, every ciphertext for the plan is unreadable. */
export function destroyKeyring(planId: string) {
  for (const domain of DOMAINS) dekCache.delete(`${planId}:${domain}`);
  const file = keyringPath(planId);
  if (fs.existsSync(file)) {
    // Overwrite before unlinking; on SSDs this is best-effort, which is why the KEK/KMS layer is the real guarantee.
    fs.writeFileSync(file, crypto.randomBytes(fs.statSync(file).size));
    fs.unlinkSync(file);
  }
}

function atomicWrite(file: string, data: Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function filePath(planId: string, name: string) {
  // name is an internal constant or "<folder>/<validated id>"; reject anything that could escape the plan dir.
  if (!/^[a-z-]+(\/[A-Za-z0-9_-]{1,64})?$/.test(name)) throw new Error("Invalid vault path");
  return path.join(planDir(planId), `${name}.enc`);
}

function aad(planId: string, domain: KeyDomain, name: string) {
  return `${planId}:${domain}:${name}`;
}

export function writeBlob(planId: string, domain: KeyDomain, name: string, data: Buffer) {
  atomicWrite(filePath(planId, name), seal(dek(planId, domain), data, aad(planId, domain, name)));
}

export function readBlob(planId: string, domain: KeyDomain, name: string): Buffer | null {
  const file = filePath(planId, name);
  if (!fs.existsSync(file)) return null;
  return open(dek(planId, domain), fs.readFileSync(file), aad(planId, domain, name));
}

export function writeJson(planId: string, domain: KeyDomain, name: string, value: unknown) {
  writeBlob(planId, domain, name, Buffer.from(JSON.stringify(value)));
}

export function readJson<T>(planId: string, domain: KeyDomain, name: string): T | null {
  const buf = readBlob(planId, domain, name);
  return buf ? (JSON.parse(buf.toString("utf8")) as T) : null;
}

export function removeFile(planId: string, name: string) {
  const file = filePath(planId, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function planExists(planId: string): boolean {
  return ID_RE.test(planId) && fs.existsSync(keyringPath(planId));
}

export function removePlanDir(planId: string) {
  fs.rmSync(planDir(planId), { recursive: true, force: true });
}

/** Raw bytes on disk, for the Privacy center's "see what's actually stored" view. */
export function rawPreview(planId: string, name: string, bytes = 48): string | null {
  const file = filePath(planId, name);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  return buf.subarray(0, bytes).toString("hex");
}

// Small plaintext JSON files outside any plan (e.g. the share-link index, which maps a token hash to a plan id).
export function readSystemJson<T>(name: string, fallback: T): T {
  const file = path.join(dataDir(), `${name}.json`);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function writeSystemJson(name: string, value: unknown) {
  atomicWrite(path.join(dataDir(), `${name}.json`), Buffer.from(JSON.stringify(value, null, 2)));
}
