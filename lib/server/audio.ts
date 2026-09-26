import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Recordings arrive as audio/mp4 (Safari) or audio/webm (Chrome, Firefox). Family members often listen on an
// iPhone, so when ffmpeg is available we normalise everything to AAC in an .m4a container, which every browser
// plays and seeks. Without ffmpeg the original recording is kept as-is.

let ffmpegPath: string | null | undefined;

export function ffmpeg(): string | null {
  if (ffmpegPath !== undefined) return ffmpegPath;
  const candidates = [process.env.HEARD_FFMPEG, "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "ffmpeg"].filter(Boolean) as string[];
  ffmpegPath = null;
  for (const c of candidates) {
    try {
      if (spawnSync(c, ["-version"], { stdio: "ignore", timeout: 3000 }).status === 0) {
        ffmpegPath = c;
        break;
      }
    } catch {}
  }
  return ffmpegPath;
}

function run(bin: string, args: string[], timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-500)));
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.split("\n").slice(-3).join(" ")}`));
    });
  });
}

/** Transcode to AAC/m4a. Plaintext only touches a private temp dir that is removed immediately after. */
export async function normalizeAudio(input: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  const bin = ffmpeg();
  if (!bin || /^audio\/(mp4|x-m4a|aac)/.test(mime)) return { data: input, mime: mime.split(";")[0] || "audio/mp4" };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heard-"));
  const id = crypto.randomBytes(6).toString("hex");
  const src = path.join(dir, `${id}.in`);
  const out = path.join(dir, `${id}.m4a`);
  try {
    fs.writeFileSync(src, input, { mode: 0o600 });
    await run(bin, ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", out]);
    return { data: fs.readFileSync(out), mime: "audio/mp4" };
  } catch (e) {
    console.error("[heard] audio normalisation skipped:", (e as Error).message);
    return { data: input, mime: mime.split(";")[0] || "application/octet-stream" };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Decode any recording to 16 kHz mono s16le PCM (used to re-transcribe or seed demo audio). */
export async function decodeToPcm(input: Buffer): Promise<Buffer | null> {
  const bin = ffmpeg();
  if (!bin) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heard-"));
  const src = path.join(dir, "in");
  const out = path.join(dir, "out.pcm");
  try {
    fs.writeFileSync(src, input, { mode: 0o600 });
    await run(bin, ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-f", "s16le", out]);
    return fs.readFileSync(out);
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Serve bytes with HTTP Range support. Safari will not play <audio> from a server that ignores Range. */
export function rangeResponse(req: Request, buf: Buffer, mime: string, extra: Record<string, string> = {}): Response {
  const size = buf.length;
  const base = { "content-type": mime, "accept-ranges": "bytes", "cache-control": "private, no-store", ...extra };
  const range = req.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    let start: number;
    let end: number;
    if (m[1] === "") {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
    return new Response(Uint8Array.from(buf.subarray(start, end + 1)), {
      status: 206,
      headers: { ...base, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` },
    });
  }
  return new Response(Uint8Array.from(buf), { status: 200, headers: { ...base, "content-length": String(size) } });
}
