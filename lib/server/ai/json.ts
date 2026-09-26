import { z } from "zod";
import { callModel, type ModelCall, type ModelResult } from "./provider";

// Schema-constrained generation: the provider enforces a strict JSON schema where it can, and we validate again
// with zod here because the output drives UI state. One repair attempt, then the caller falls back gracefully.

export interface JsonResult<T> {
  data: T;
  meta: Omit<ModelResult, "text"> & { attempts: number };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1]);
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("No JSON object in model output");
  }
}

export async function generateJson<T>(call: ModelCall, validator: z.ZodType<T>): Promise<JsonResult<T>> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const user =
      attempt === 1
        ? call.user
        : `${call.user}\n\nYour previous reply could not be used (${lastError}). Reply again with only a JSON object that matches the schema.`;
    const result = await callModel({ ...call, user });
    try {
      const data = validator.parse(extractJson(result.text));
      const { text: _text, ...meta } = result;
      void _text;
      return { data, meta: { ...meta, attempts: attempt } };
    } catch (err) {
      lastError = err instanceof z.ZodError ? err.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : String((err as Error).message);
    }
  }
  throw new Error(`Model output failed validation: ${lastError}`);
}

/** Helpers for OpenAI strict-mode JSON Schemas: every property required, no extra keys. */
export const S = {
  obj(properties: Record<string, unknown>) {
    return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
  },
  arr(items: unknown) {
    return { type: "array", items };
  },
  str(description?: string) {
    return description ? { type: "string", description } : { type: "string" };
  },
  enumOf(values: readonly string[], description?: string) {
    return description ? { type: "string", enum: values, description } : { type: "string", enum: values };
  },
  nullable(schema: Record<string, unknown>) {
    const t = schema.type;
    return { ...schema, type: [t, "null"] };
  },
  bool(description?: string) {
    return description ? { type: "boolean", description } : { type: "boolean" };
  },
  int(description?: string) {
    return description ? { type: "integer", description } : { type: "integer" };
  },
};
