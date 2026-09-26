import crypto from "node:crypto";
import { SignatureV4 } from "@smithy/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { aiConfig } from "../config";

// One small transport for every model call.
//   bedrock  OpenAI Responses API on Amazon Bedrock (bedrock-runtime …/openai/v1/responses), signed with SigV4 from the
//            standard AWS credential chain (Workshop Studio's temporary keys work as-is) or a Bedrock bearer token.
//   openai   Any OpenAI-compatible endpoint (OpenAI, OpenRouter) using Chat Completions or Responses.
// Requests always set store:false (Responses) so prompts and outputs are not retained for previous_response_id,
// and nothing here logs prompt or completion text.

export type Tier = "fast" | "smart";
export type Effort = "low" | "medium" | "high";

export interface ModelCall {
  tier: Tier;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: Effort;
  maxOutputTokens?: number;
}

export interface ModelResult {
  text: string;
  model: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
}

export class AiUnavailableError extends Error {
  name = "AiUnavailableError";
}

type SourceData = string | ArrayBuffer | ArrayBufferView;

function toBuffer(data: SourceData): Buffer {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

/** node:crypto-backed hash for SignatureV4 (same contract as @smithy/hash-node). */
class Sha256 {
  private hash: crypto.Hash | crypto.Hmac;
  constructor(private readonly secret?: SourceData) {
    this.hash = this.create();
  }
  private create() {
    return this.secret ? crypto.createHmac("sha256", toBuffer(this.secret)) : crypto.createHash("sha256");
  }
  update(data: SourceData) {
    this.hash.update(toBuffer(data));
  }
  async digest() {
    return new Uint8Array(this.hash.digest());
  }
  reset() {
    this.hash = this.create();
  }
}

const g = globalThis as unknown as { __heardAwsCreds?: ReturnType<typeof defaultProvider> };
function awsCredentials() {
  return (g.__heardAwsCreds ??= defaultProvider());
}

function bedrockBaseUrl(endpoint: "runtime" | "mantle", region: string) {
  return endpoint === "runtime"
    ? `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`
    : `https://bedrock-mantle.${region}.api.aws/openai/v1`;
}

async function signedFetch(url: URL, body: string, service: string, region: string, timeoutMs: number) {
  const signer = new SignatureV4({ service, region, credentials: awsCredentials(), sha256: Sha256 });
  const signed = await signer.sign({
    method: "POST",
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    query: {},
    headers: { host: url.hostname, "content-type": "application/json" },
    body,
  });
  const headers = Object.fromEntries(Object.entries(signed.headers).filter(([k]) => k.toLowerCase() !== "host"));
  return fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
}

function responsesBody(call: ModelCall, model: string) {
  return {
    model,
    instructions: call.system,
    input: [{ role: "user", content: call.user }],
    text: { format: { type: "json_schema", name: call.schemaName, schema: call.schema, strict: true } },
    reasoning: { effort: call.effort ?? "low" },
    max_output_tokens: call.maxOutputTokens ?? 4000,
    store: false,
  };
}

function chatBody(call: ModelCall, model: string, host: string) {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: call.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: call.schemaName, strict: true, schema: call.schema } },
    max_tokens: call.maxOutputTokens ?? 4000,
  };
  if (host.endsWith("openrouter.ai")) {
    body.reasoning = { effort: call.effort ?? "low" };
    // Only route to providers that honour the schema and do not retain or train on prompts.
    body.provider = { require_parameters: true, data_collection: "deny" };
  } else {
    body.reasoning_effort = call.effort ?? "low";
  }
  return body;
}

interface ResponsesPayload {
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function textFromResponses(json: ResponsesPayload): string {
  if (json.status && json.status !== "completed") {
    throw new AiUnavailableError(`Model response ${json.status}${json.incomplete_details?.reason ? ` (${json.incomplete_details.reason})` : ""}`);
  }
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) if (c.type === "output_text" && c.text) parts.push(c.text);
  }
  return parts.join("");
}

interface ChatPayload {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

async function readError(res: Response) {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    message = j?.error?.message || j?.message || j?.Message || message;
  } catch {}
  return `${res.status} ${message}`.trim();
}

export function aiEnabled() {
  return aiConfig().kind !== "none";
}

export async function callModel(call: ModelCall): Promise<ModelResult> {
  const cfg = aiConfig();
  if (cfg.kind === "none") throw new AiUnavailableError("AI assistance is not configured");
  const model = call.tier === "smart" ? cfg.smartModel : cfg.fastModel;
  const started = Date.now();

  if (cfg.kind === "bedrock") {
    const base = bedrockBaseUrl(cfg.bedrockEndpoint, cfg.region);
    // Mantle addresses models by their base id (no "global." / "us." inference-profile prefix).
    const modelId = cfg.bedrockEndpoint === "mantle" ? model.replace(/^(global|us)\./, "") : model;
    const url = new URL(`${base}/responses`);
    const body = JSON.stringify(responsesBody(call, modelId));
    const res = cfg.bearerToken
      ? await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${cfg.bearerToken}`, "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(cfg.timeoutMs),
        })
      : await signedFetch(url, body, cfg.bedrockEndpoint === "runtime" ? "bedrock" : "bedrock-mantle", cfg.region, cfg.timeoutMs);
    if (!res.ok) throw new AiUnavailableError(`Bedrock ${await readError(res)}`);
    const json = (await res.json()) as ResponsesPayload;
    return {
      text: textFromResponses(json),
      model: modelId,
      ms: Date.now() - started,
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
    };
  }

  const host = new URL(cfg.openaiBaseUrl).host;
  const headers = { authorization: `Bearer ${cfg.openaiApiKey}`, "content-type": "application/json" };
  if (cfg.openaiWire === "responses") {
    const res = await fetch(`${cfg.openaiBaseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(responsesBody(call, model)),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!res.ok) throw new AiUnavailableError(`Model endpoint ${await readError(res)}`);
    const json = (await res.json()) as ResponsesPayload;
    return { text: textFromResponses(json), model, ms: Date.now() - started, inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens };
  }

  const res = await fetch(`${cfg.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(chatBody(call, model, host)),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  if (!res.ok) throw new AiUnavailableError(`Model endpoint ${await readError(res)}`);
  const json = (await res.json()) as ChatPayload;
  if (json.error) throw new AiUnavailableError(json.error.message || "Model error");
  const choice = json.choices?.[0];
  if (choice?.message?.refusal) throw new AiUnavailableError("The model declined this request");
  if (choice?.finish_reason === "length") throw new AiUnavailableError("Model response was cut off");
  return {
    text: choice?.message?.content ?? "",
    model,
    ms: Date.now() - started,
    inputTokens: json.usage?.prompt_tokens,
    outputTokens: json.usage?.completion_tokens,
  };
}
