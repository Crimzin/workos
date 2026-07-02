import { sourceAppLabel } from "./post-source-links";
import {
  normalizeSearchText,
  tokenizeSearchText,
  type ContextSearchCandidate,
  type ContextSearchResult,
} from "./context-search";
import type { SourceApp } from "./types";

export type ContextEventAction = "attached" | "removed" | "ignored" | "allowed";

export interface ContextEventBaseMetadata extends Record<string, unknown> {
  context_event: true;
  action: ContextEventAction;
}

export interface ContextEventSourceMetadata extends Record<string, unknown> {
  source_node_id: string;
  source_title: string;
  source_app?: SourceApp;
  source_post_id?: string;
  source_message_id?: string;
  reason?: string;
}

export type SingleContextEventMetadata = ContextEventBaseMetadata &
  ContextEventSourceMetadata & {
    source_app: SourceApp;
  };

export interface GroupedContextEventMetadata extends ContextEventBaseMetadata {
  grouped_context_event: true;
  source_app: SourceApp;
  sources: ContextEventSourceMetadata[];
}

export type ContextEventMetadata =
  | SingleContextEventMetadata
  | GroupedContextEventMetadata;

export interface BuildContextEventMetadataInput {
  action: ContextEventAction;
  sourceNodeId: string;
  sourceTitle: string;
  sourceApp: unknown;
  sourcePostId?: string | null;
  sourceMessageId?: string | null;
  reason?: string | null;
}

export interface BuildGroupedContextEventMetadataInput {
  action: ContextEventAction;
  sourceApp: unknown;
  sources: Array<{
    sourceNodeId: string;
    sourceTitle: string;
    sourceApp?: unknown;
    sourcePostId?: string | null;
    sourceMessageId?: string | null;
    reason?: string | null;
  }>;
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

const AUTOMATIC_CONTEXT_CONTINUATION_WORDS = new Set([
  ...AUTOMATIC_CONTEXT_STOP_WORDS,
  "another",
  "better",
  "continue",
  "different",
  "else",
  "fix",
  "go",
  "going",
  "keep",
  "last",
  "more",
  "previous",
  "redo",
  "retry",
  "same",
  "that",
  "try",
  "yet",
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
): SingleContextEventMetadata {
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

export function buildGroupedContextEventMetadata(
  input: BuildGroupedContextEventMetadataInput
): GroupedContextEventMetadata {
  return {
    context_event: true,
    grouped_context_event: true,
    action: input.action,
    source_app: normalizeSourceApp(input.sourceApp),
    sources: input.sources.flatMap((source) => {
      const sourceNodeId = source.sourceNodeId.trim();
      const sourceTitle = source.sourceTitle.trim();
      if (!sourceNodeId || !sourceTitle) return [];

      return [
        {
          source_node_id: sourceNodeId,
          source_title: sourceTitle,
          source_app: normalizeSourceApp(source.sourceApp ?? input.sourceApp),
          ...(source.sourcePostId
            ? { source_post_id: source.sourcePostId }
            : {}),
          ...(source.sourceMessageId
            ? { source_message_id: source.sourceMessageId }
            : {}),
          ...(source.reason ? { reason: source.reason } : {}),
        },
      ];
    }),
  };
}

export function updateContextEventMetadataAction(
  metadata: ContextEventMetadata,
  action: ContextEventAction
): ContextEventMetadata {
  return {
    ...metadata,
    action,
  };
}

export function chooseAutomaticContextCandidates(
  input: ChooseAutomaticContextCandidatesInput
): ContextSearchResult[] {
  if (input.limit <= 0) return [];
  if (!hasEnoughAutomaticContextSignal(input.userText)) return [];
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
  if (isGroupedContextEventMetadata(metadata)) return true;
  return isSingleContextEventMetadata(metadata);
}

export function isSingleContextEventMetadata(
  metadata: Record<string, unknown> | null | undefined
): metadata is SingleContextEventMetadata {
  if (!metadata || metadata.context_event !== true) return false;
  if (!isContextEventAction(metadata.action)) return false;
  return (
    typeof metadata.source_node_id === "string" &&
    metadata.source_node_id.trim().length > 0 &&
    typeof metadata.source_title === "string" &&
      metadata.source_title.trim().length > 0
  );
}

export function isGroupedContextEventMetadata(
  metadata: Record<string, unknown> | null | undefined
): metadata is GroupedContextEventMetadata {
  if (!metadata || metadata.context_event !== true) return false;
  if (metadata.grouped_context_event !== true) return false;
  if (!isContextEventAction(metadata.action)) return false;
  if (!Array.isArray(metadata.sources) || metadata.sources.length === 0) {
    return false;
  }

  return metadata.sources.every(
    (source): source is ContextEventSourceMetadata =>
      isRecord(source) &&
      typeof source.source_node_id === "string" &&
      source.source_node_id.trim().length > 0 &&
      typeof source.source_title === "string" &&
      source.source_title.trim().length > 0
  );
}

export function isContextEventPost(post: ContextEventPostLike): boolean {
  return (
    post.post_type === "context_event" && isContextEventMetadata(post.metadata)
  );
}

export function contextEventSummary(metadata: ContextEventMetadata): string {
  const sourceApp = sourceAppLabel(normalizeSourceApp(metadata.source_app));

  if (isGroupedContextEventMetadata(metadata)) {
    const titles = metadata.sources
      .map((source) => source.source_title.trim())
      .filter(Boolean);
    const previewTitles = titles.slice(0, 3).join(", ");
    const suffix =
      titles.length > 3 ? `${previewTitles}, and ${titles.length - 3} more` : previewTitles;
    const groupedSourceLabel = groupedContextSourceLabel(metadata);

    switch (metadata.action) {
      case "attached":
        return `Added ${titles.length} context source${
          titles.length === 1 ? "" : "s"
        }${groupedSourceLabel}${suffix ? `: ${suffix}` : ""}`;
      case "removed":
        return `Removed ${titles.length} context source${
          titles.length === 1 ? "" : "s"
        } from this thread${suffix ? `: ${suffix}` : ""}`;
      case "ignored":
        return `Ignored ${titles.length} ${sourceApp} context source${
          titles.length === 1 ? "" : "s"
        } going forward${suffix ? `: ${suffix}` : ""}`;
      case "allowed":
        return `Allowed ${titles.length} ${sourceApp} context source${
          titles.length === 1 ? "" : "s"
        } in suggestions${suffix ? `: ${suffix}` : ""}`;
    }
  }

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

function groupedContextSourceLabel(
  metadata: GroupedContextEventMetadata
): string {
  const counts = new Map<SourceApp, number>();
  for (const source of metadata.sources) {
    const sourceApp = normalizeSourceApp(source.source_app ?? metadata.source_app);
    counts.set(sourceApp, (counts.get(sourceApp) ?? 0) + 1);
  }

  if (counts.size === 0) return "";
  if (counts.size === 1) {
    return ` from ${sourceAppLabel([...counts.keys()][0])}`;
  }

  const order: SourceApp[] = ["claude", "chatgpt", "workos", "unknown"];
  const parts = order.flatMap((sourceApp) => {
    const count = counts.get(sourceApp) ?? 0;
    return count > 0 ? [`${count} ${sourceAppLabel(sourceApp)}`] : [];
  });
  return `: ${parts.join(", ")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (isContinuationOnlyTurn(userText)) return false;
  return buildAutomaticContextTokens(userText).length >= AUTOMATIC_CONTEXT_MIN_QUERY_TOKENS;
}

function isContinuationOnlyTurn(userText: string): boolean {
  const tokens = tokenizeSearchText(userText.replace(AGENT_MENTION_TEXT, " "));
  if (tokens.length === 0 || tokens.length > 6) return false;

  return tokens.every((token) => AUTOMATIC_CONTEXT_CONTINUATION_WORDS.has(token));
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
