// Shared types for Heard. Server and client both import from here, so keep it free of runtime code.

export type PromptKind = "reflection" | "chips" | "spectrum" | "scenarios" | "disclosure" | "legacy";

export type ChapterId = "story" | "values" | "care" | "told" | "message";

export type PromptId =
  | "reflect_health"
  | "reflect_experience"
  | "matters_most"
  | "quality_of_life"
  | "care_spectrum"
  | "ventilator"
  | "stop_treatment"
  | "disclosure"
  | "family_message";

/** A clip can also belong to a clarification the user answered during the Clarity check. */
export type ClipOwner = PromptId | "clarification";

export interface OptionDef {
  id: string;
  label: string;
  hint?: string;
  /** Selecting this clears the others (e.g. "None of these"). */
  exclusive?: boolean;
  /** Reveals a free-text field. */
  isOther?: boolean;
}

export type SpectrumValue = 1 | 2 | 3 | 4 | 5;

export interface SpectrumStop {
  value: SpectrumValue;
  label: string;
  description: string;
}

export interface PromptDef {
  id: PromptId;
  kind: PromptKind;
  chapter: ChapterId;
  eyebrow: string;
  question: string;
  help?: string;
  /** What we ask for when the person chooses to record. */
  voiceCue: string;
  options?: OptionDef[];
  stops?: SpectrumStop[];
  /** Hard cap for one clip; at the cap the clip auto-saves and the person may continue in a follow-up clip. */
  recordLimitSec: number;
  /** Soft target shown on the ring. */
  targetSec: number;
  sensitive?: boolean;
  optional?: boolean;
  starters?: string[];
}

export interface ChapterDef {
  id: ChapterId;
  title: string;
  blurb: string;
}

export interface Word {
  w: string;
  /** start, seconds */
  s: number;
  /** end, seconds */
  e: number;
}

export interface ClipMeta {
  id: string;
  owner: ClipOwner;
  clarificationId?: string;
  createdAt: string;
  durationMs: number;
  mime: string;
  bytes: number;
  /** Follow-up clip: the id of the clip this continues. */
  continuationOf?: string;
  /** Recording hit the time limit and was saved automatically. */
  autoSaved?: boolean;
  transcript: "none" | "pending" | "done" | "failed";
  /** Seeded demo audio produced by text-to-speech, never a real person's voice. */
  synthetic?: boolean;
  /** Captured from the person's microphone during a live conversation with the voice assistant. */
  live?: boolean;
}

export interface Transcript {
  clipId: string;
  text: string;
  words: Word[];
  provider: string;
  createdAt: string;
}

export interface Answer {
  promptId: PromptId;
  status: "answered" | "skipped";
  selected?: string[];
  otherText?: string;
  spectrum?: SpectrumValue | null;
  unsure?: boolean;
  text?: string;
  clipIds: string[];
  updatedAt: string;
}

export type DisclosureChoice = "tell_all" | "tell_diagnosis" | "family_first" | "dont_tell";

/** Stored in its own encrypted file, under its own key, with its own access log (spec §8, §11.3). */
export interface DisclosurePref {
  status: "answered" | "skipped";
  choice?: DisclosureChoice;
  unsure?: boolean;
  who?: string;
  text?: string;
  clipIds: string[];
  updatedAt: string;
}

export interface Suggestion {
  id: string;
  targetPromptId: PromptId;
  kind: "option" | "spectrum";
  optionId?: string;
  value?: SpectrumValue;
  quote: string;
  sourcePromptId: ClipOwner;
  sourceClipId?: string;
  state: "pending" | "accepted" | "dismissed";
  createdAt: string;
}

export interface Quote {
  text: string;
  /** "clip:<id>" | "text:<promptId>" | "answer:<promptId>" */
  sourceId: string;
  clipId?: string;
  start?: number;
  end?: number;
}

export interface ClarityNote {
  id: string;
  kind: "tension" | "unclear";
  title: string;
  body: string;
  followUp: string;
  promptIds: PromptId[];
  quotes: Quote[];
  state: "open" | "answered" | "dismissed";
  response?: { text?: string; clipIds: string[]; answeredAt: string };
  createdAt: string;
}

export interface SummarySentence {
  text: string;
  sources: string[];
}

export interface SummarySection {
  id: "matters" | "quality" | "treatment" | "stop" | "clarifications";
  title: string;
  sentences: SummarySentence[];
}

export interface SummaryDoc {
  generatedAt: string;
  generator: "ai" | "template";
  model?: string;
  headline: SummarySentence;
  sections: SummarySection[];
  quotes: Quote[];
  /** Sentences the model produced that failed grounding checks and were removed. */
  droppedCount: number;
  approvedAt?: string;
  editedByUser?: boolean;
}

export interface Profile {
  firstName: string;
  /** Spec §3.2: individual vs family-centered decision-making. MVP runs individual mode; family mode is deferred. */
  decisionStyle?: "self" | "family";
  /** Spec §3.1: multilingual support. MVP is English only; the preference is kept for later. */
  language?: string;
  state?: string;
  createdAt: string;
  aiAssist: boolean;
  transcription: boolean;
  voiceConsentAt?: string;
  acknowledgedAt?: string;
}

export interface ShareScopes {
  summary: boolean;
  recordings: boolean;
  message: boolean;
  disclosure: boolean;
}

export interface ShareConsent {
  acceptedAt: string;
  typedName: string;
  consentVersion: string;
  consentHash: string;
  device: string;
}

export interface Share {
  id: string;
  name: string;
  relationship: string;
  contact?: string;
  tokenHash: string;
  createdAt: string;
  status: "invited" | "active" | "revoked";
  scopes: ShareScopes;
  consents: ShareConsent[];
  revokedAt?: string;
  lastAccessAt?: string;
  savedCopies: number;
}

export type LifeEventType =
  | "diagnosis"
  | "hospitalization"
  | "birth"
  | "death"
  | "relationship"
  | "move"
  | "other";

export interface LifeEvent {
  id: string;
  type: LifeEventType;
  note?: string;
  date: string;
  createdAt: string;
}

export interface Retention {
  onAccountDelete: "revoke_all" | "keep_shared";
  legacyContact?: { name: string; contact?: string };
  memorialMode: boolean;
  inactiveYears: number;
}

export interface VersionIndexEntry {
  version: number;
  publishedAt: string;
  afterEventId?: string;
}

export interface PlanCore {
  id: string;
  profile: Profile;
  answers: Partial<Record<PromptId, Answer>>;
  clips: Record<string, ClipMeta>;
  suggestions: Suggestion[];
  clarity: ClarityNote[];
  clarityCheckedAt?: string;
  summary?: SummaryDoc;
  shares: Share[];
  events: LifeEvent[];
  retention: Retention;
  versions: VersionIndexEntry[];
  lastReviewedAt?: string;
  nextReviewAt?: string;
  /** Demo-only clock offset in days so we can show "a year later". */
  clockOffsetDays?: number;
  archivedAt?: string;
  /** The person's own "current leaning" notes for a POLST conversation. Never pre-filled by the app. */
  polstPrep?: Record<string, string>;
}

/** What a family member receives: a frozen snapshot of what was shared at publish time. */
export interface PublishedClarification {
  noteId: string;
  question: string;
  text?: string;
  clipIds: string[];
}

export interface PublishedPlan {
  version: number;
  publishedAt: string;
  firstName: string;
  reviewedAfter?: LifeEvent;
  summary?: SummaryDoc;
  answers: Answer[];
  clarifications: PublishedClarification[];
  clips: ClipMeta[];
  hasDisclosure: boolean;
  lastReviewedAt?: string;
  memorial?: boolean;
}

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: { kind: "planner" | "family" | "system"; id?: string; name?: string };
  action: string;
  resource?: string;
  detail?: string;
  prevHash: string;
  hash: string;
}

export interface ChainStatus {
  ok: boolean;
  entries: number;
  head: string;
  brokenAt?: number;
}
