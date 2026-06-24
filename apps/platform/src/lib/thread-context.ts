import { sourceAppLabel } from "./post-source-links";
import {
  buildContextSearchResults,
  tokenizeSearchText,
  type ContextSearchCandidate,
  type ContextSearchResult,
} from "./context-search";
import type { SourceApp } from "./types";

export type ContextEventAction = "attached" | "removed" | "ignored" | "allowed";

export interface ContextEventMetadata extends Record<string, unknown> {
  context_event: true;
  action: ContextEventAction;
  source_node_id: string;
  source_title: string;
  source_app: SourceApp;
  source_post_id?: string;
  source_message_id?: string;
  reason?: string;
}

export interface BuildContextEventMetadataInput {
  action: ContextEventAction;
  sourceNodeId: string;
  sourceTitle: string;
  sourceApp: unknown;
  sourcePostId?: string | null;
  sourceMessageId?: string | null;
  reason?: string | null;
}

export interface ContextEventPostLike {
  post_type: string;
  metadata: Record<string, unknown> | null;
}

export interface ChooseAutomaticContextCandidatesInput {
  userText: string;
  candidates: ContextSearchCandidate[];
  limit: number;
}

const AUTOMATIC_CONTEXT_MIN_SCORE = 3_000;
const AUTOMATIC_CONTEXT_STOP_WORDS = new Set([
  "a",
  "about",
  "again",
  "an",
  "and",
  "are",
  "back",
  "can",
  "continue",
  "do",
  "for",
  "help",
  "i",
  "in",
  "into",
  "it",
  "keep",
  "me",
  "my",
  "of",
  "on",
  "please",
  "the",
  "this",
  "to",
  "want",
  "we",
  "with",
  "work",
  "working",
  "you",
  "claude",
  "codex",
  "workos",
]);

export function normalizeSourceApp(value: unknown): SourceApp {
  if (
    value === "workos" ||
    value === "claude" ||
    value === "chatgpt" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

export function buildContextEventMetadata(
  input: BuildContextEventMetadataInput
): ContextEventMetadata {
  return {
    context_event: true,
    action: input.action,
    source_node_id: input.sourceNodeId,
    source_title: input.sourceTitle,
    source_app: normalizeSourceApp(input.sourceApp),
    ...(input.sourcePostId ? { source_post_id: input.sourcePostId } : {}),
    ...(input.sourceMessageId ? { source_message_id: input.sourceMessageId } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

export function chooseAutomaticContextCandidates(
  input: ChooseAutomaticContextCandidatesInput
): ContextSearchResult[] {
  const query = buildAutomaticContextQuery(input.userText);
  if (!query) return [];

  return buildContextSearchResults(input.candidates, query, input.limit).filter(
    (candidate) => candidate.score >= AUTOMATIC_CONTEXT_MIN_SCORE
  );
}

export function isContextEventMetadata(
  metadata: Record<string, unknown> | null | undefined
): metadata is ContextEventMetadata {
  if (!metadata || metadata.context_event !== true) return false;
  if (!isContextEventAction(metadata.action)) return false;
  return (
    typeof metadata.source_node_id === "string" &&
    metadata.source_node_id.trim().length > 0 &&
    typeof metadata.source_title === "string" &&
    metadata.source_title.trim().length > 0
  );
}

export function isContextEventPost(post: ContextEventPostLike): boolean {
  return (
    post.post_type === "context_event" && isContextEventMetadata(post.metadata)
  );
}

export function contextEventSummary(metadata: ContextEventMetadata): string {
  const sourceApp = sourceAppLabel(normalizeSourceApp(metadata.source_app));
  const title = metadata.source_title.trim() || "Untitled";

  switch (metadata.action) {
    case "attached":
      return `Added context from ${sourceApp}: ${title}`;
    case "removed":
      return `Removed context from this thread: ${title}`;
    case "ignored":
      return `Ignored ${sourceApp} going forward: ${title}`;
    case "allowed":
      return `Allowed ${sourceApp} in suggestions: ${title}`;
  }
}

function buildAutomaticContextQuery(userText: string): string {
  const tokens = tokenizeSearchText(userText).filter(
    (token) =>
      token.length >= 3 && !AUTOMATIC_CONTEXT_STOP_WORDS.has(token)
  );
  return tokens.join(" ");
}

function isContextEventAction(value: unknown): value is ContextEventAction {
  return (
    value === "attached" ||
    value === "removed" ||
    value === "ignored" ||
    value === "allowed"
  );
}
