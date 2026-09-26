// Generates the demo persona's recordings (fictional "Linh", 71) with a clearly-labelled synthetic voice, then
// transcribes them with Amazon Transcribe so demo transcripts carry real word timings.
//
//   ELEVENLABS_API_KEY=... node scripts/make-demo-audio.mjs          # natural voice (ElevenLabs)
//   node scripts/make-demo-audio.mjs --say                             # macOS `say` fallback, offline
//
// Needs ffmpeg, and AWS credentials with Amazon Transcribe access for word timings (falls back to even spacing).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "demo");
const AUDIO = path.join(OUT, "audio");
fs.mkdirSync(AUDIO, { recursive: true });

const VOICE_ID = process.env.DEMO_VOICE_ID || "5u41aNhyCU6hXOcjPPv0"; // "Carol", ElevenLabs voice library
const useSay = process.argv.includes("--say") || !process.env.ELEVENLABS_API_KEY;

export const SCRIPT = {
  reflect_health:
    "I feel pretty good for seventy-one. I walk every morning with my neighbor, and on Sundays I cook pho for my grandchildren. My blood pressure is high and my knees complain, but I'm grateful. What worries me is my memory. My mother had dementia, and at the end she didn't know any of us.",
  reflect_experience:
    "When my husband Minh got sick, he was in the ICU for three weeks, with tubes and machines. The doctors kept asking if we wanted to try one more thing, and we kept saying yes, because we didn't know what he would want. At the end he couldn't talk to us at all. I don't want my children to have to guess like we did.",
  matters_most:
    "My family is everything to me. My faith carries me through the hard days. And I want to take care of myself as long as I can. I don't want my children to have to stop their lives for me. And my garden. Please don't forget my garden.",
  quality_of_life:
    "If I can still know my grandchildren and talk with them, I can live with a lot. A good day is when I can sit in my garden, hear the birds, and call my daughter. I want to be at home, with my plants and my altar, if that is possible.",
  care_spectrum: "If there is a real chance I can come back and be myself, then try. Try hard. I am stronger than I look.",
  stop_treatment:
    "If machines are keeping me alive and the doctors say I won't come back, please let me go. Don't feel guilty. And if I don't know who you are anymore, don't keep me going like a vegetable for a long time.",
  disclosure:
    "Tell me. Don't hide it from me. In our family, we sometimes keep bad news from the elders, to protect them. I understand why. But I want to know, so I can make my peace, and say what I need to say.",
  family_message:
    "Mai. Khoa. My grandbabies. You have made my life so full. I am proud of the people you have become. When the time comes, it is okay to let me go. You will not be giving up on me. You will be listening to me. Take care of each other. Keep cooking pho on Sundays, even if it is never as good as mine. And please, water my tomatoes.",
};

async function tts(id, text) {
  const mp3 = path.join(AUDIO, `${id}.src.mp3`);
  if (useSay) {
    const aiff = path.join(AUDIO, `${id}.aiff`);
    execFileSync("say", ["-v", "Samantha", "-r", "165", "-o", aiff, text]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, mp3]);
    fs.unlinkSync(aiff);
    return mp3;
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.92 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  return mp3;
}

async function transcribe(pcm) {
  const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require("@aws-sdk/client-transcribe-streaming");
  const client = new TranscribeStreamingClient({ region: process.env.HEARD_TRANSCRIBE_REGION || "us-west-2" });
  async function* audio() {
    for (let i = 0; i < pcm.length; i += 8000) yield { AudioEvent: { AudioChunk: pcm.subarray(i, i + 8000) } };
  }
  const res = await client.send(new StartStreamTranscriptionCommand({ LanguageCode: "en-US", MediaEncoding: "pcm", MediaSampleRateHertz: 16000, AudioStream: audio() }));
  const finals = [];
  for await (const ev of res.TranscriptResultStream) for (const r of ev.TranscriptEvent?.Transcript?.Results ?? []) if (!r.IsPartial) finals.push(r.Alternatives[0]);
  return {
    text: finals.map((a) => a.Transcript).join(" ").trim(),
    words: finals.flatMap((a) => a.Items.filter((i) => i.Type === "pronunciation").map((i) => ({ w: i.Content, s: i.StartTime, e: i.EndTime }))),
  };
}

function evenWords(text, seconds) {
  const words = text.split(/\s+/).filter(Boolean);
  const step = seconds / Math.max(1, words.length);
  return words.map((w, i) => ({ w: w.replace(/[^\w']/g, ""), s: +(i * step).toFixed(2), e: +((i + 1) * step).toFixed(2) }));
}

const clips = {};
for (const [id, text] of Object.entries(SCRIPT)) {
  process.stdout.write(`${id}… `);
  const src = await tts(id, text);
  const m4a = path.join(AUDIO, `${id}.m4a`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", m4a]);
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", m4a]).toString().trim());
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", m4a, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
  let transcript;
  try {
    transcript = await transcribe(pcm);
  } catch (e) {
    console.warn(`(transcribe unavailable: ${e.message}; using script text with even timings)`);
    transcript = { text, words: evenWords(text, seconds) };
  }
  fs.unlinkSync(src);
  clips[id] = { file: `audio/${id}.m4a`, durationMs: Math.round(seconds * 1000), text: transcript.text || text, words: transcript.words };
  console.log(`${seconds.toFixed(1)}s, ${transcript.words.length} words`);
}

const persona = {
  firstName: "Linh",
  state: "CA",
  voice: useSay ? "macOS say (Samantha)" : `ElevenLabs voice ${VOICE_ID}`,
  answers: {
    reflect_health: {},
    reflect_experience: {},
    matters_most: { selected: ["family_friends", "faith", "independence"] },
    quality_of_life: { selected: ["recognize_loved_ones", "free_from_pain"] },
    care_spectrum: { spectrum: 2 },
    stop_treatment: { selected: ["machines", "cant_recognize"] },
    family_message: {},
  },
  disclosure: { choice: "tell_all", who: "Mai. She is a nurse, and she will know how to explain it." },
  share: { name: "Mai", relationship: "Daughter" },
  clips,
};
fs.writeFileSync(path.join(OUT, "persona.json"), JSON.stringify(persona, null, 2));
console.log("wrote demo/persona.json");
