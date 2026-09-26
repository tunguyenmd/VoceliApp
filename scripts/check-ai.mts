// Pre-demo check: can this machine reach the AI and speech services configured in .env.local?
//   npm run check:ai                      # checks the configured smart/fast models + Transcribe
//   npm run check:ai -- us.openai.gpt-6-luna global.openai.gpt-5.6-sol   # also probe extra model ids
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { aiConfig, sttConfig } = await import("../lib/server/config");
const { callModel } = await import("../lib/server/ai/provider");
const { transcribePcm } = await import("../lib/server/stt/transcribe");
const { SignatureV4 } = await import("@smithy/signature-v4");
const { defaultProvider } = await import("@aws-sdk/credential-provider-node");

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);
const info = (s: string) => console.log(`    ${s}`);

async function awsIdentity() {
  console.log("\nAWS credentials");
  try {
    const creds = await defaultProvider()();
    class Sha256 {
      h: crypto.Hash | crypto.Hmac;
      constructor(private secret?: string | Uint8Array) {
        this.h = secret ? crypto.createHmac("sha256", secret) : crypto.createHash("sha256");
      }
      update(d: string | Uint8Array) {
        this.h.update(d);
      }
      async digest() {
        return new Uint8Array(this.h.digest());
      }
      reset() {
        this.h = this.secret ? crypto.createHmac("sha256", this.secret) : crypto.createHash("sha256");
      }
    }
    const body = "Action=GetCallerIdentity&Version=2011-06-15";
    const signer = new SignatureV4({ service: "sts", region: "us-east-1", credentials: creds, sha256: Sha256 as never });
    const signed = await signer.sign({ method: "POST", protocol: "https:", hostname: "sts.amazonaws.com", path: "/", headers: { host: "sts.amazonaws.com", "content-type": "application/x-www-form-urlencoded" }, body });
    const headers = Object.fromEntries(Object.entries(signed.headers).filter(([k]) => k !== "host"));
    const res = await fetch("https://sts.amazonaws.com/", { method: "POST", headers, body });
    const text = await res.text();
    const arn = text.match(/<Arn>(.*?)<\/Arn>/)?.[1];
    if (res.ok && arn) ok(`signed in as ${arn.replace(/\d{12}/, "<account>")}${creds.sessionToken ? " (temporary credentials)" : ""}`);
    else bad(`STS said ${res.status}: ${text.slice(0, 160)}`);
  } catch (e) {
    bad(`no usable AWS credentials: ${(e as Error).message}`);
    info("Paste the exports from Workshop Studio → 'Get AWS CLI credentials' into this terminal or .env.local.");
  }
}

const SCHEMA = { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false };

async function probe(model: string) {
  process.env.HEARD_MODEL_SMART = model;
  const started = Date.now();
  try {
    const r = await callModel({ tier: "smart", system: "Reply with JSON only.", user: 'Say "ready" in the reply field.', schemaName: "probe", schema: SCHEMA, effort: "low", maxOutputTokens: 400 });
    const parsed = JSON.parse(r.text);
    ok(`${model}: ${Date.now() - started} ms, structured output → ${JSON.stringify(parsed)}`);
    return true;
  } catch (e) {
    bad(`${model}: ${(e as Error).message.slice(0, 220)}`);
    return false;
  }
}

async function main() {
  const ai = aiConfig();
  console.log(`\nHeard pre-demo check\nAI provider: ${ai.kind}${ai.kind === "bedrock" ? ` (${ai.region}, ${ai.bedrockEndpoint} endpoint, ${ai.bearerToken ? "bearer token" : "SigV4"})` : ai.kind === "openai" ? ` (${ai.openaiBaseUrl})` : ""}`);
  if (ai.kind === "bedrock" || sttConfig().kind === "aws-transcribe") await awsIdentity();

  if (ai.kind !== "none") {
    console.log("\nModels");
    const extra = process.argv.slice(2).filter((a) => !a.startsWith("-"));
    const models = [...new Set([ai.smartModel, ai.fastModel, ...extra])];
    const smart = ai.smartModel;
    for (const m of models) await probe(m);
    process.env.HEARD_MODEL_SMART = smart;
  } else {
    bad("HEARD_AI_PROVIDER is none: suggestions, Clarity check, AI summary and family search are off (the app still works).");
  }

  const stt = sttConfig();
  console.log("\nSpeech");
  if (stt.kind === "aws-transcribe") {
    const sample = path.join(process.cwd(), "demo", "audio", "care_spectrum.m4a");
    try {
      const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", sample, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 32 * 1024 * 1024 });
      const started = Date.now();
      const t = await transcribePcm(new Uint8Array(pcm));
      if (t?.text) ok(`Amazon Transcribe (${stt.region}): ${Date.now() - started} ms → "${t.text.slice(0, 70)}…"`);
      else bad(`Amazon Transcribe (${stt.region}) returned nothing. Check transcribe:StartStreamTranscription permission, or set HEARD_STT_PROVIDER=none.`);
    } catch (e) {
      bad(`Transcribe check failed: ${(e as Error).message.slice(0, 200)}`);
    }
  } else {
    info("HEARD_STT_PROVIDER=none: recordings still work; no live captions or transcripts.");
  }
  console.log("");
  process.exit(0);
}

await main();
