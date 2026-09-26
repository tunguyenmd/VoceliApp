// Model evals for Heard's AI features against the configured provider (.env.local).
//   npm run eval
// Writes docs/EVAL_RESULTS.md. Cases are synthetic; no real person's data is used.
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { aiConfig } = await import("../lib/server/config");
const { newPlanCore } = await import("../lib/server/plans");
const { understand } = await import("../lib/server/ai/understand");
const { askPlan } = await import("../lib/server/ai/ask");
const { clarityCheck } = await import("../lib/server/ai/clarity");
const { buildPassages } = await import("../lib/server/ai/material");

type Case = { id: string; prompt: "reflect_health" | "matters_most" | "quality_of_life" | "stop_treatment"; words: string; expect: string[] };

// Expected = worksheet options a careful clinician would say the words clearly express.
const UNDERSTAND_CASES: Case[] = [
  { id: "garden-cats", prompt: "matters_most", words: "My family is everything to me. I do not want to be a burden on my children. And my garden, please don't forget my garden. I also love my two cats.", expect: ["matters_most:family_friends", "matters_most:not_burden", "matters_most:hobbies", "matters_most:pets"] },
  { id: "church-independence", prompt: "matters_most", words: "Going to church every Sunday keeps me going, and I want to keep driving myself around as long as I possibly can.", expect: ["matters_most:faith", "matters_most:independence"] },
  { id: "longevity", prompt: "matters_most", words: "Honestly I want to live as long as I can. My granddaughter is getting married in two years and I plan to dance at that wedding.", expect: ["matters_most:live_long"] },
  { id: "memory-fear", prompt: "quality_of_life", words: "If I can't think clearly anymore, if my mind goes, that would not be living for me. I also don't want to be in pain all the time.", expect: ["quality_of_life:mental_sharpness", "quality_of_life:free_from_pain"] },
  { id: "home", prompt: "quality_of_life", words: "I never want to live in a nursing home. I want to be in my own house, in my own bed, with my dog next to me.", expect: ["quality_of_life:home_vs_facility"] },
  { id: "machines", prompt: "stop_treatment", words: "If I'm only alive because a machine is breathing for me and I'm not going to wake up, then turn it off.", expect: ["stop_treatment:machines", "stop_treatment:no_recovery"] },
  { id: "recognize", prompt: "stop_treatment", words: "If I don't know my own children anymore, please don't keep me going.", expect: ["stop_treatment:cant_recognize"] },
  { id: "everything", prompt: "stop_treatment", words: "I'd want them to keep trying no matter what. Every day is a gift and I would never want anyone to stop treatment.", expect: ["stop_treatment:none"] },
  { id: "neutral-health", prompt: "reflect_health", words: "My health is okay. I have diabetes and I take my pills. I see my doctor every three months.", expect: [] },
  { id: "story-only", prompt: "reflect_health", words: "I grew up in Hue and moved to San Jose in 1980. I worked as a seamstress for thirty years.", expect: [] },
];

const PROMPTS_Q: Record<Case["prompt"], string> = {
  reflect_health: "How do you feel about your health right now?",
  matters_most: "What matters most to you?",
  quality_of_life: "Which of these would matter most for your quality of life?",
  stop_treatment: "I would want to stop treatments meant to prolong my life if…",
};

const lines: string[] = [];
const out = (s = "") => {
  console.log(s);
  lines.push(s);
};

const cfg = aiConfig();
out(`# Heard model evals`);
out(`Run ${new Date().toISOString()} · provider ${cfg.kind} · smart ${cfg.smartModel} · fast ${cfg.fastModel}\n`);

// 1) Speak naturally: precision / recall of suggested options, and how many ungrounded proposals were caught.
let tp = 0, fp = 0, fn = 0, ungrounded = 0, ms = 0;
out(`## 1. "Speak naturally" suggestions (${UNDERSTAND_CASES.length} synthetic answers)`);
out(`| case | expected | suggested | result |`);
out(`|---|---|---|---|`);
for (const c of UNDERSTAND_CASES) {
  const core = newPlanCore("eval_plan_0001", "Eval");
  const r = await understand({ core, sourcePromptId: c.prompt, question: PROMPTS_Q[c.prompt], words: c.words });
  ms += r.ms ?? 0;
  ungrounded += r.ungrounded ?? 0;
  const got = r.suggestions.filter((s) => s.kind === "option").map((s) => `${s.targetPromptId}:${s.optionId}`);
  const hits = got.filter((g) => c.expect.includes(g));
  tp += hits.length;
  fp += got.length - hits.length;
  fn += c.expect.filter((e) => !got.includes(e)).length;
  const ok = hits.length === c.expect.length && got.length === hits.length;
  out(`| ${c.id} | ${c.expect.map((e) => e.split(":")[1]).join(", ") || "—"} | ${got.map((e) => e.split(":")[1]).join(", ") || "—"} | ${ok ? "✓" : "≈"} |`);
}
const precision = tp / Math.max(1, tp + fp);
const recall = tp / Math.max(1, tp + fn);
out(`\n**Precision ${(precision * 100).toFixed(0)}% · recall ${(recall * 100).toFixed(0)}% · ungrounded proposals caught by the validator: ${ungrounded} · avg ${(ms / UNDERSTAND_CASES.length / 1000).toFixed(1)} s**`);
out(`Every suggestion shown to a user quotes their exact words (validated server-side; ungrounded ones never reach the screen).\n`);

// 2) Family search: answers only from the plan; off-topic questions must come back "not addressed".
const persona = JSON.parse(fs.readFileSync("demo/persona.json", "utf8"));
const answers = Object.entries(persona.answers).map(([pid, a]: [string, any]) => ({ promptId: pid, status: "answered", selected: a.selected, spectrum: a.spectrum, clipIds: [pid], updatedAt: "" }));
const transcripts = Object.fromEntries(Object.entries(persona.clips).filter(([id]) => id !== "disclosure").map(([id, c]: [string, any]) => [id, { clipId: id, text: c.text, words: c.words, provider: "x", createdAt: "" }]));
const passages = buildPassages(answers as never, transcripts as never, { includeFamilyMessage: true });

const ASK = [
  { q: "Would Mom want to be kept on machines if she couldn't recover?", want: ["addressed"] },
  { q: "Where does she want to be cared for?", want: ["addressed", "related"] },
  { q: "Did Mom want to donate her organs?", want: ["not_addressed"] },
  { q: "Should we do CPR on her?", want: ["related", "not_addressed"] },
  { q: "What is her favorite movie?", want: ["not_addressed"] },
];
out(`## 2. Family search ("What did Hoa say about…?")`);
out(`| question | status | citations (all verified verbatim) | ok |`);
out(`|---|---|---|---|`);
let askOk = 0;
for (const a of ASK) {
  const r = await askPlan({ question: a.q, name: "Hoa", passages, transcripts: transcripts as never });
  const ok = a.want.includes(r.status);
  askOk += ok ? 1 : 0;
  out(`| ${a.q} | ${r.status} | ${r.citations.length} | ${ok ? "✓" : "✗"} |`);
}
out(`\n**${askOk}/${ASK.length} behaved as expected.** Unanswerable questions (organ donation, favorite movie) must not be "answered".\n`);

// 3) Clarity check: does it catch the ambiguous phrase in Hoa's plan?
out(`## 3. Clarity check on the demo plan (3 runs)`);
let caught = 0;
for (let i = 0; i < 3; i++) {
  const r = await clarityCheck(buildPassages(answers as never, transcripts as never), "Hoa");
  const hit = r.notes.some((n) => /vegetable/i.test(`${n.title} ${n.body} ${n.quotes.map((q) => q.text).join(" ")}`));
  caught += hit ? 1 : 0;
  out(`- run ${i + 1}: ${r.notes.length} notes (${r.notes.map((n) => n.kind).join(", ")}), "like a vegetable" ${hit ? "caught" : "missed"}`);
}
out(`\n**Caught the ambiguous phrase in ${caught}/3 runs.**`);

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/EVAL_RESULTS.md", lines.join("\n") + "\n");
console.log("\nwrote docs/EVAL_RESULTS.md");
