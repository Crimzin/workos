import type { NodeType } from "./types";

export type ContextSourceApp = "workos" | "claude" | "chatgpt" | "unknown";

export interface ContextSearchCandidate {
  id: string;
  title: string;
  path: string;
  type: NodeType;
  href: string;
  sourceApp?: ContextSourceApp;
  updatedAt?: string | null;
  bodyPreview?: string | null;
}

export interface ContextSearchResult extends ContextSearchCandidate {
  score: number;
  matchedTokens: string[];
}

const DASHES_AND_QUOTES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D'"‘’“”`´]/g;
const PUNCTUATION = /[^\p{L}\p{N}\s]/gu;
const WHITESPACE = /\s+/g;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(DASHES_AND_QUOTES, " ")
    .replace(PUNCTUATION, " ")
    .replace(WHITESPACE, " ")
    .trim()
    .toLocaleLowerCase();
}

export function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

export function buildContextSearchResults(
  candidates: ContextSearchCandidate[],
  query: string,
  limit: number
): ContextSearchResult[] {
  if (limit <= 0) return [];

  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = uniqueTokens(tokenizeSearchText(normalizedQuery));
  if (queryTokens.length === 0) return [];

  return candidates
    .map((candidate, index) => scoreCandidate(candidate, normalizedQuery, queryTokens, index))
    .filter((result): result is ContextSearchResult & { index: number } => result !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((result) => ({
      id: result.id,
      title: result.title,
      path: result.path,
      type: result.type,
      href: result.href,
      sourceApp: result.sourceApp,
      updatedAt: result.updatedAt,
      bodyPreview: result.bodyPreview,
      score: result.score,
      matchedTokens: result.matchedTokens,
    }));
}

function scoreCandidate(
  candidate: ContextSearchCandidate,
  normalizedQuery: string,
  queryTokens: string[],
  index: number
): (ContextSearchResult & { index: number }) | null {
  const title = normalizeSearchText(candidate.title);
  const path = normalizeSearchText(candidate.path);
  const bodyPreview = normalizeSearchText(candidate.bodyPreview ?? "");
  const titleTokens = tokenizeSearchText(candidate.title);
  const searchableTokens = [
    ...titleTokens,
    ...tokenizeSearchText(candidate.path),
    ...tokenizeSearchText(candidate.bodyPreview ?? ""),
  ];
  const matchedTokens = queryTokens.filter((token) => tokenMatches(token, searchableTokens));

  if (matchedTokens.length !== queryTokens.length) return null;

  const allTitleTokensMatch = queryTokens.every((token) => tokenMatches(token, titleTokens));
  const titleSubstringMatch = title.includes(normalizedQuery);
  const pathSubstringMatch = path.includes(normalizedQuery);
  const previewSubstringMatch = bodyPreview.includes(normalizedQuery);

  let score = 1_000;
  if (title === normalizedQuery) {
    score = 10_000;
  } else if (allTitleTokensMatch) {
    score = 8_000;
  } else if (titleSubstringMatch) {
    score = 6_000;
  } else if (pathSubstringMatch) {
    score = 4_000;
  } else if (previewSubstringMatch) {
    score = 3_000;
  }

  score += Math.min(500, matchedTokens.length * 50);
  score += Math.max(0, 200 - Math.abs(title.length - normalizedQuery.length));

  return {
    ...candidate,
    score,
    matchedTokens,
    index,
  };
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function tokenMatches(queryToken: string, candidateTokens: string[]): boolean {
  return candidateTokens.some(
    (candidateToken) =>
      candidateToken === queryToken ||
      (queryToken.length >= 3 && candidateToken.includes(queryToken))
  );
}
