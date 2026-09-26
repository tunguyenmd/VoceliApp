import { z } from "zod";
import { HttpError } from "./session";

export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, `Invalid request: ${parsed.error.issues[0]?.message ?? "bad input"}`);
  return parsed.data;
}

export const noStore = { "cache-control": "no-store" };

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { ...noStore, ...(init.headers ?? {}) } });
}
