import path from "node:path";
import type { PromptId } from "@/lib/types";
import { PROMPTS } from "@/lib/content/prompts";

// All runtime configuration comes from environment variables so the same build runs against
// Amazon Bedrock at the event, an OpenAI-compatible endpoint in development, or no AI at all.

export type AiProviderKind = "bedrock" | "openai" | "none";
export type SttProviderKind = "aws-transcribe" | "none";

export function dataDir(): string {
  return process.env.HEARD_DATA_DIR || path.join(process.cwd(), ".data");
}

export function aiConfig() {
  const kind = (process.env.HEARD_AI_PROVIDER || "none") as AiProviderKind;
  const region = process.env.HEARD_BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
  const bedrockEndpoint = (process.env.HEARD_BEDROCK_ENDPOINT || "runtime") as "runtime" | "mantle";
  const defaults =
    kind === "bedrock"
      ? { smart: "global.openai.gpt-5.6-terra", fast: "global.openai.gpt-5.6-luna" }
      : { smart: "openai/gpt-5.6-terra", fast: "openai/gpt-5.6-luna" };
  return {
    kind,
    region,
    bedrockEndpoint,
    bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK || undefined,
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiWire: (process.env.HEARD_OPENAI_WIRE || "chat") as "chat" | "responses",
    smartModel: process.env.HEARD_MODEL_SMART || defaults.smart,
    fastModel: process.env.HEARD_MODEL_FAST || defaults.fast,
    timeoutMs: Number(process.env.HEARD_AI_TIMEOUT_MS || 60000),
  };
}

export function sttConfig() {
  return {
    kind: (process.env.HEARD_STT_PROVIDER || "none") as SttProviderKind,
    region: process.env.HEARD_TRANSCRIBE_REGION || process.env.AWS_REGION || "us-east-1",
    languageCode: process.env.HEARD_TRANSCRIBE_LANGUAGE || "en-US",
  };
}

export function demoMode(): boolean {
  return process.env.HEARD_DEMO === "1";
}

/** The questions the mobile app walks through, in the spec's order. HEARD_MOBILE_FLOW (comma-separated question ids)
 *  narrows it, for example to the two questions of the live demo; unset, it is every question. */
export function mobileFlow(): PromptId[] {
  const wanted = (process.env.HEARD_MOBILE_FLOW || "").split(",").map((s) => s.trim());
  const flow = PROMPTS.map((p) => p.id).filter((id) => wanted.includes(id));
  return flow.length ? flow : PROMPTS.map((p) => p.id);
}

/** A human-readable description of where AI and speech processing happen, shown in the Privacy center. */
export function processingDescription() {
  const ai = aiConfig();
  const stt = sttConfig();
  const aiLabel =
    ai.kind === "bedrock"
      ? `Amazon Bedrock (${ai.region}) · OpenAI ${ai.smartModel.replace(/^global\./, "")}`
      : ai.kind === "openai"
        ? `OpenAI-compatible endpoint (${new URL(ai.openaiBaseUrl).host}) · ${ai.smartModel}`
        : "Off";
  const sttLabel = stt.kind === "aws-transcribe" ? `Amazon Transcribe streaming (${stt.region})` : "Off";
  return { ai: aiLabel, aiKind: ai.kind, stt: sttLabel, sttKind: stt.kind };
}
