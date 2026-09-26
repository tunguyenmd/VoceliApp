import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./config";

// Envelope encryption.
//   KEK (key-encryption key): one per deployment. From HEARD_MASTER_KEY, or generated into .data/master.key for local
//        development. In production this is replaced by AWS KMS (GenerateDataKey / Decrypt); the rest is unchanged.
//   DEK (data-encryption key): one per plan per domain ("core", "disclosure", "voice"), wrapped by the KEK.
// Every ciphertext is bound to its location with AES-GCM additional authenticated data, so a file copied to another
// plan or renamed fails to decrypt instead of silently being read as someone else's data.

const MAGIC = Buffer.from("HRD1");

let kek: Buffer | null = null;

export function getKek(): Buffer {
  if (kek) return kek;
  const fromEnv = process.env.HEARD_MASTER_KEY;
  if (fromEnv) {
    const k = Buffer.from(fromEnv, "base64");
    if (k.length !== 32) throw new Error("HEARD_MASTER_KEY must be 32 bytes, base64-encoded");
    kek = k;
    return k;
  }
  const file = path.join(dataDir(), "master.key");
  if (fs.existsSync(file)) {
    kek = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
    return kek;
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  const k = crypto.randomBytes(32);
  fs.writeFileSync(file, k.toString("base64"), { mode: 0o600 });
  kek = k;
  return k;
}

export function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ct]);
}

export function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < 32 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error("Not a Heard ciphertext");
  const iv = blob.subarray(4, 16);
  const tag = blob.subarray(16, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(32)), decipher.final()]);
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomId(bytes = 9): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

let sessionKey: Buffer | null = null;

/** Cookie-signing key derived from the KEK so a deployment has one secret to manage. */
export function sessionSecret(): Buffer {
  if (sessionKey) return sessionKey;
  sessionKey = Buffer.from(crypto.hkdfSync("sha256", getKek(), Buffer.alloc(0), "heard-session-v1", 32));
  return sessionKey;
}

export function hmac(value: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** For tests: forget cached keys after HEARD_DATA_DIR / HEARD_MASTER_KEY change. */
export function resetKeyCacheForTests() {
  kek = null;
  sessionKey = null;
}
