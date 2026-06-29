import { sourceAppLabel } from "./post-source-links";
import {
  normalizeSearchText,
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

export const AUTOMATIC_CONTEXT_AUTO_ATTACH_LIMIT = 8;

const AUTOMATIC_CONTEXT_MIN_QUERY_TOKENS = 2;
const AUTOMATIC_CONTEXT_MIN_SCORE = 3_000;
const AUTOMATIC_CONTEXT_MIN_CROSS_FIELD_TOKENS = 2;
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
  "could",
  "do",
  "for",
  "help",
  "i",
  "in",
  "into",
  "it",
  "keep",
  "looking",
  "me",
  "my",
  "need",
  "of",
  "on",
  "please",
  "should",
  "sort",
  "sorts",
  "stage",
  "the",
  "think",
  "this",
  "to",
  "want",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "work",
  "working",
  "you",
  "claude",
  "codex",
  "workos",
  "code",
]);

const AGENT_MENTION_TEXT = /@(claude code|claude|codex|workos)\b/giu;

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
  if (input.limit <= 0) return [];
  const queryTokens = buildAutomaticContextTokens(input.userText);
  if (queryTokens.length === 0) return [];

  return input.candidates
    .map((candidate, index) =>
      scoreAutomaticContextCandidate(candidate, queryTokens, index)
    )
    .filter(
      (
        candidate
      ): candidate is ContextSearchResult & { index: number } =>
        candidate !== null &&
        (candidate.score >= AUTOMATIC_CONTEXT_MIN_SCORE ||
          candidate.matchedTokens.length >=
            AUTOMATIC_CONTEXT_MIN_CROSS_FIELD_TOKENS)
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, input.limit)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      path: candidate.path,
      type: candidate.type,
      href: candidate.href,
      sourceApp: candidate.sourceApp,
      updatedAt: candidate.updatedAt,
      bodyPreview: candidate.bodyPreview,
      sourcePostId: candidate.sourcePostId,
      sourceMessageId: candidate.sourceMessageId,
      score: candidate.score,
      matchedTokens: candidate.matchedTokens,
    }));
}

export function buildAutomaticContextQueryText({
  userText,
  previousUserTexts,
}: {
  userText: string;
  previousUserTexts: string[];
}): string {
  const trimmedUserText = userText.trim();
  if (hasEnoughAutomaticContextSignal(trimmedUserText)) return trimmedUserText;

  const fallback = previousUserTexts
    .map((text) => text.trim())
    .find((text) => hasEnoughAutomaticContextSignal(text));

  return fallback ?? trimmedUserText;
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

export function scoreAutomaticContextTextMatch(
  userText: string,
  text: string
): { score: number; matchedTokens: string[] } {
  const queryTokens = [...new Set(buildAutomaticContextTokens(userText))];
  if (queryTokens.length === 0) return { score: 0, matchedTokens: [] };

  const textTokens = tokenizeSearchText(text);
  const matchedTokens = queryTokens.filter((token) =>
    automaticTokenMatches(token, textTokens)
  );
  if (matchedTokens.length === 0) return { score: 0, matchedTokens: [] };

  return {
    score: matchedTokens.length * 650,
    matchedTokens,
  };
}

function buildAutomaticContextTokens(userText: string): string[] {
  const textWithoutMentions = userText.replace(AGENT_MENTION_TEXT, " ");
  return normalizeSearchText(textWithoutMentions).split(" ").filter(
    (token) =>
      token.length >= 3 && !AUTOMATIC_CONTEXT_STOP_WORDS.has(token)
  );
}

function hasEnoughAutomaticContextSignal(userText: string): boolean {
  return buildAutomaticContextTokens(userText).length >= AUTOMATIC_CONTEXT_MIN_QUERY_TOKENS;
}

function scoreAutomaticContextCandidate(
  candidate: ContextSearchCandidate,
  queryTokens: string[],
  index: number
): (ContextSearchResult & { index: number }) | null {
  const titleTokens = tokenizeSearchText(candidate.title);
  const pathTokens = tokenizeSearchText(candidate.path);
  const previewTokens = tokenizeSearchText(candidate.bodyPreview ?? "");
  const normalizedTitle = normalizeSearchText(candidate.title);
  const normalizedQuery = normalizeSearchText(queryTokens.join(" "));

  const matchedQueryTokens = queryTokens.filter((token) =>
    automaticTokenMatches(token, [
      ...titleTokens,
      ...pathTokens,
      ...previewTokens,
    ])
  );
  const matchedTokens = [...new Set(matchedQueryTokens)];
  if (matchedTokens.length === 0) return null;

  let score = 0;
  for (const token of matchedQueryTokens) {
    if (automaticTokenMatches(token, titleTokens)) score += 1_200;
    if (automaticTokenMatches(token, pathTokens)) score += 800;
    if (automaticTokenMatches(token, previewTokens)) score += 650;
  }

  if (normalizedTitle === normalizedQuery) score += 4_000;
  if (matchedTokens.length === queryTokens.length) score += 1_000;
  score += Math.min(500, matchedTokens.length * 100);

  return {
    ...candidate,
    score,
    matchedTokens,
    index,
  };
}

function automaticTokenMatches(
  queryToken: string,
  candidateTokens: string[]
): boolean {
  const queryVariants = tokenVariants(queryToken);

  return candidateTokens.some((candidateToken) => {
    const candidateVariants = tokenVariants(candidateToken);
    for (const queryVariant of queryVariants) {
      for (const candidateVariant of candidateVariants) {
        if (candidateVariant === queryVariant) return true;
        if (
          queryVariant.length >= 3 &&
          candidateVariant.includes(queryVariant)
        ) {
          return true;
        }
        if (
          candidateVariant.length >= 3 &&
          queryVariant.includes(candidateVariant)
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

function tokenVariants(token: string): Set<string> {
  const variants = new Set([token]);
  if (token.length > 3 && token.endsWith("s")) {
    variants.add(token.slice(0, -1));
  } else if (token.length > 2 && !token.endsWith("s")) {
    variants.add(`${token}s`);
  }
  return variants;
}

function isContextEventAction(value: unknown): value is ContextEventAction {
  return (
    value === "attached" ||
    value === "removed" ||
    value === "ignored" ||
    value === "allowed"
  );
}
