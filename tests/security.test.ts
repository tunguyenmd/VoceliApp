import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// Every test in this file runs against a throwaway data directory and master key.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heard-test-"));
process.env.HEARD_DATA_DIR = dir;
process.env.HEARD_MASTER_KEY = crypto.randomBytes(32).toString("base64");

const vault = await import("@/lib/server/vault");
const audit = await import("@/lib/server/audit");
const cryptoLib = await import("@/lib/server/crypto");

describe("envelope encryption", () => {
  const planId = "plan_test_0001";
  beforeAll(() => vault.createKeyring(planId));

  it("round-trips data and stores only ciphertext on disk", () => {
    vault.writeJson(planId, "core", "core", { wish: "let me go peacefully at home" });
    expect(vault.readJson(planId, "core", "core")).toEqual({ wish: "let me go peacefully at home" });
    const onDisk = fs.readFileSync(path.join(dir, "plans", planId, "core.enc"));
    expect(onDisk.subarray(0, 4).toString()).toBe("HRD1");
    expect(onDisk.toString("latin1")).not.toContain("peacefully");
  });

  it("binds ciphertext to its location: a file moved to another name will not decrypt", () => {
    vault.writeJson(planId, "disclosure", "disclosure", { choice: "tell_all" });
    const src = path.join(dir, "plans", planId, "disclosure.enc");
    fs.copyFileSync(src, path.join(dir, "plans", planId, "core.enc"));
    expect(() => vault.readJson(planId, "core", "core")).toThrow();
  });

  it("uses separate keys per domain", () => {
    vault.writeBlob(planId, "voice", "clips/clip_abcdef", Buffer.from("audio bytes"));
    const file = path.join(dir, "plans", planId, "clips", "clip_abcdef.enc");
    const blob = fs.readFileSync(file);
    const wrongKey = crypto.randomBytes(32);
    expect(() => cryptoLib.open(wrongKey, blob, `${planId}:voice:clips/clip_abcdef`)).toThrow();
    expect(vault.readBlob(planId, "voice", "clips/clip_abcdef")?.toString()).toBe("audio bytes");
  });

  it("crypto-shredding makes remaining ciphertext unreadable", () => {
    vault.destroyKeyring(planId);
    expect(() => vault.readJson(planId, "core", "core")).toThrow(/keys not found/);
  });

  it("rejects path traversal in ids and names", () => {
    expect(() => vault.planDir("../../etc")).toThrow();
    expect(() => vault.readBlob("plan_test_0002", "core", "../core")).toThrow();
  });
});

describe("hash-chained access logs", () => {
  const planId = "plan_test_audit";
  beforeAll(() => fs.mkdirSync(path.join(dir, "plans", planId), { recursive: true }));

  it("verifies an intact chain", () => {
    audit.appendAudit(planId, "access", { actor: { kind: "planner" }, action: "share.created", detail: "Invited Mai" });
    audit.appendAudit(planId, "access", { actor: { kind: "family", id: "s1", name: "Mai" }, action: "recording.played" });
    audit.appendAudit(planId, "access", { actor: { kind: "planner" }, action: "share.revoked" });
    const status = audit.verifyLog(planId, "access");
    expect(status.ok).toBe(true);
    expect(status.entries).toBe(3);
  });

  it("detects an edited entry", () => {
    const file = path.join(dir, "plans", planId, "audit-access.jsonl");
    const original = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, original.replace("recording.played", "plan.viewed"));
    const status = audit.verifyLog(planId, "access");
    expect(status.ok).toBe(false);
    expect(status.brokenAt).toBe(2);
    fs.writeFileSync(file, original);
  });

  it("detects a deleted last entry (truncation) via the head hash", () => {
    const file = path.join(dir, "plans", planId, "audit-access.jsonl");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    fs.writeFileSync(file, lines.slice(0, 2).join("\n") + "\n");
    expect(audit.verifyLog(planId, "access").ok).toBe(false);
  });

  it("keeps the disclosure log separate", () => {
    audit.appendAudit(planId, "disclosure", { actor: { kind: "family", id: "s1", name: "Mai" }, action: "disclosure.viewed" });
    expect(audit.readLog(planId, "disclosure")).toHaveLength(1);
    expect(audit.readLog(planId, "disclosure")[0].seq).toBe(1);
  });
});
