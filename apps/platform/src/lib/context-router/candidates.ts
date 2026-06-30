import { normalizeSearchText, tokenizeSearchText } from "../context-search";
import type { SourceApp } from "../types";
import { expandedTextMatchScore } from "./term-expansion";
import type { ContextRouterCandidate } from "./types";

export interface BuildCandidateSnippetInput {
  query: string;
  text: string;
  maxChars: number;
}

export function buildCandidateSnippet(
  input: BuildCandidateSnippetInput
): { snippet: string; lexicalScore: number } {
  const queryTokens = [...new Set(tokenizeSearchText(input.query))].filter(
    (token) => token.length >= 3
  );
  const normalizedText = normalizeSearchText(input.text);
  const matches = queryTokens.filter((token) => normalizedText.includes(token));
  const firstIndex = matches
    .map((token) => normalizedText.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const center = firstIndex ?? 0;
  const start = Math.max(0, center - Math.floor(input.maxChars / 3));
  const end = Math.min(input.text.length, start + input.maxChars);

  return {
    snippet: `${start > 0 ? "..." : ""}${input.text.slice(start, end)}${
      end < input.text.length ? "..." : ""
    }`,
    lexicalScore: matches.length,
  };
}

export function rankCandidateSnippets(
  query: string,
  candidates: ContextRouterCandidate[],
  limit = 80
): ContextRouterCandidate[] {
  const timestamp = (value: string | null) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return candidates
    .map((candidate) => {
      const expandedMatch = expandedTextMatchScore({
        query,
        text: [
          candidate.title,
          candidate.snippet,
          candidate.path ?? "",
          candidate.previewFacts?.join(" ") ?? "",
        ].join(" "),
      });
      const lexicalScore = Math.max(
        candidate.lexicalScore,
        expandedMatch.score
      );

      return {
        ...candidate,
        lexicalScore,
        expandedMatchScore: expandedMatch.score,
      };
    })
    .filter(
      (candidate) =>
        candidate.lexicalScore > 0 ||
        (candidate.priorWeight ?? 0) >= 4 ||
        candidate.sourceKind === "account-memory" ||
        candidate.sourceKind === "thread-sheet"
    )
    .sort(
      (a, b) =>
        (b.priorWeight ?? 0) - (a.priorWeight ?? 0) ||
        b.lexicalScore - a.lexicalScore ||
        timestamp(b.updatedAt) - timestamp(a.updatedAt)
    )
    .slice(0, limit);
}

export function makeContextRouterCandidate(input: {
  id: string;
  title: string;
  sourceApp: SourceApp;
  updatedAt: string | null;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  text: string;
  query: string;
}): ContextRouterCandidate {
  const snippet = buildCandidateSnippet({
    query: input.query,
    text: input.text,
    maxChars: 700,
  });

  return {
    id: input.id,
    title: input.title,
    sourceApp: input.sourceApp,
    updatedAt: input.updatedAt,
    sourcePostId: input.sourcePostId,
    sourceMessageId: input.sourceMessageId,
    snippet: snippet.snippet,
    lexicalScore: snippet.lexicalScore,
  };
}
