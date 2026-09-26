import type { Word } from "@/lib/types";

// Grounding checks shared by every AI feature. A model may only quote the person's own words; anything that
// cannot be found in the source text is discarded before it reaches the screen. These run on the server after
// each model call and are unit-tested (tests/grounding.test.ts).

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

/**
 * Where does `quote` occur in `source`? Exact match on normalized text first; otherwise the best window of the
 * same length with ≥ `minRatio` of the quote's tokens matching in order (tolerates a dropped "um" or a
 * transcription variant like "3" vs "three"). Returns token offsets into the source.
 */
export function locateQuote(quote: string, source: string, minRatio = 0.85): { start: number; end: number; score: number } | null {
  const q = tokens(quote);
  const src = tokens(source);
  if (q.length === 0 || src.length === 0 || q.length > src.length + 2) return null;
  const qs = q.join(" ");
  const ss = src.join(" ");
  const exact = ` ${ss} `.indexOf(` ${qs} `);
  if (exact >= 0) {
    const start = ss.slice(0, exact).split(" ").filter(Boolean).length;
    return { start, end: start + q.length, score: 1 };
  }
  let best: { start: number; end: number; score: number } | null = null;
  for (let i = 0; i < src.length; i++) {
    for (const len of [q.length - 1, q.length, q.length + 1]) {
      if (len <= 0 || i + len > src.length) continue;
      const score = lcs(q, src.slice(i, i + len)) / q.length;
      if (score >= minRatio && (!best || score > best.score)) best = { start: i, end: i + len, score };
    }
  }
  if (best) {
    // Trim window edges that aren't part of the quote, so the span starts and ends on quoted words.
    const bare = (t: string) => t.replace(/'/g, "");
    const inQuote = new Set(q.map(bare));
    while (best.end - best.start > 1 && !inQuote.has(bare(src[best.start]))) best.start++;
    while (best.end - best.start > 1 && !inQuote.has(bare(src[best.end - 1]))) best.end--;
  }
  return best;
}

function lcs(a: string[], b: string[]): number {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Token spans in the original text, aligned 1:1 with `tokens()` so a match can be cut back out verbatim. */
function tokenSpans(s: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const re = /[A-Za-z0-9'’‘`]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (normalize(m[0])) spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/**
 * The person's exact words for a model's quote: locate it, then return the matching span of the source text
 * (plus trailing punctuation). Models sometimes "tidy" a quote; what we display is always what was really said.
 */
export function exactQuote(quote: string, source: string, minRatio = 0.85): string | null {
  const hit = locateQuote(quote, source, minRatio);
  if (!hit) return null;
  const spans = tokenSpans(source);
  if (spans.length !== tokens(source).length) return tidyQuote(quote);
  const first = spans[hit.start];
  const last = spans[Math.min(hit.end, spans.length) - 1];
  if (!first || !last) return null;
  let end = last.end;
  if (/[.!?,;]/.test(source[end] ?? "")) end += 1;
  return source.slice(first.start, end).replace(/\s+/g, " ").trim();
}

/** Remove passage labels (S3, [S3], (S8, S10)) a model may echo into prose meant for people. */
export function stripLabels(text: string): string {
  return text
    .replace(/\s*[\[(]\s*S\d+(?:\s*[,;]\s*S\d+)*\s*[\])]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;!?])/g, "$1")
    .trim();
}

export function isGrounded(quote: string, sources: string[], minRatio = 0.85): boolean {
  return sources.some((s) => locateQuote(quote, s, minRatio) !== null);
}

/**
 * Map a quote onto word timings from the transcript so a family member can hear exactly that sentence.
 * Transcript words and our tokenizer may split differently, so we align on normalized word lists.
 */
export function quoteTiming(quote: string, words: Word[], minRatio = 0.85): { start: number; end: number } | null {
  if (!words.length) return null;
  const toks: string[] = [];
  const tokenWord: number[] = [];
  words.forEach((w, i) => {
    for (const t of normalize(w.w).split(" ").filter(Boolean)) {
      toks.push(t);
      tokenWord.push(i);
    }
  });
  const hit = locateQuote(quote, toks.join(" "), minRatio);
  if (!hit) return null;
  const first = words[tokenWord[hit.start]];
  const last = words[tokenWord[Math.min(hit.end, toks.length) - 1]];
  if (!first || !last) return null;
  return { start: Math.max(0, first.s - 0.15), end: last.e + 0.25 };
}

/** Clean up a model quote for display: trim, strip wrapping quotes, cap length. */
export function tidyQuote(q: string): string {
  return q.trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/\s+/g, " ").slice(0, 400);
}

// Directive language that turns "what they said" into "what you should do".
const DIRECTIVE = /\b(we recommend|i recommend|i would recommend|recommended|the right (choice|decision)|the best (option|choice)|consider (starting|stopping|hospice|palliative)|should (be|get|have) (intubated|resuscitated|ventilated|a feeding tube|dialysis|cpr))\b/i;
// For statements to family (summary, search answers) "you should…" is also a directive; in gentle follow-up
// questions to the planner ("you should feel free to…") it is not, so it is only checked for statements.
const DIRECTIVE_STATEMENT = /\b(you should|you need to|you must|you ought to)\b/i;

/** Flags generated prose that slides from restating someone's wishes into giving advice. */
export function soundsLikeAdvice(text: string, kind: "statement" | "question" = "statement"): boolean {
  return DIRECTIVE.test(text) || (kind === "statement" && DIRECTIVE_STATEMENT.test(text));
}
