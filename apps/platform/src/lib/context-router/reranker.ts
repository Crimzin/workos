import { invokeClaude } from "../agents/claude";
import { parseLlmJsonObject } from "./json";
import type {
  ContextRerankDecision,
  ContextRouterCandidate,
  ContextSourceRole,
} from "./types";

const RERANKER_MODEL = "claude-haiku-4-5";
const MIN_INCLUDE_CONFIDENCE = 0.72;
const MAX_FINAL_CONTEXTS = 20;
export const MAX_RERANKER_CANDIDATES = 40;
export const MAX_RERANKER_SNIPPET_CHARS = 180;

export interface RerankerInput {
  resolvedQuery: string;
  candidates: ContextRouterCandidate[];
}

export interface RerankerPrompt {
  system: string;
  user: string;
}

export type RerankerCaller = (prompt: RerankerPrompt) => Promise<string>;

export function prepareCandidatesForReranker(
  candidates: ContextRouterCandidate[],
): ContextRouterCandidate[] {
  return candidates.slice(0, MAX_RERANKER_CANDIDATES).map((candidate) => ({
    ...candidate,
    snippet: truncateForReranker(candidate.snippet),
    estimatedChars: Math.min(
      candidate.estimatedChars ?? candidate.snippet.length,
      MAX_RERANKER_SNIPPET_CHARS,
    ),
  }));
}

export function buildRerankerPrompt(input: RerankerInput): RerankerPrompt {
  return {
    system:
      "Rank WorkOS context sources. Favor recall, but label each selected source by how the assistant should use it. Return strict JSON only.",
    user: JSON.stringify({
      query: input.resolvedQuery,
      instruction:
        "Return exactly {\"core\":[\"id\"],\"supporting\":[\"id\"],\"watchlist\":[\"id\"]}. Include up to 20 total IDs if they are plausibly useful. Core is not a ranking badge: use core only for sources that should materially shape the answer or contain likely central facts. Use supporting for useful background and watchlist for plausible but low-salience context that should not be emphasized unless needed. Do not explain. For broad planning requests, favor recall across adjacent work, personal, legal, household, career, money, location, and obligation context; put weaker-but-plausible sources in watchlist instead of dropping them.",
      candidates: prepareCandidatesForReranker(input.candidates).map(
        (candidate) => ({
          id: candidate.id,
          title: candidate.title,
          kind: candidate.sourceKind ?? "global",
          relation: candidate.relation ?? null,
          prior: candidate.priorWeight ?? 0,
          score: candidate.lexicalScore,
          source_posts: candidate.sourcePostCount ?? null,
          source_chars: candidate.sourceBodyChars ?? null,
          source_size: sourceSizeLabel(candidate),
          source_app: candidate.sourceApp,
          origin: candidate.sourceOrigin ?? "workos",
          provenance: candidate.sourceProvenance ?? null,
          snippet: candidate.snippet,
        }),
      ),
    }),
  };
}

export function parseRerankResponse(text: string): ContextRerankDecision[] {
  let data: Record<string, unknown>;

  try {
    data = parseLlmJsonObject(text);
  } catch {
    return [];
  }

  if (Array.isArray(data.include_ids)) {
    return data.include_ids.flatMap((item): ContextRerankDecision[] => {
      const candidateId = typeof item === "string" ? item.trim() : "";
      if (!candidateId) return [];

      return [
        {
          candidateId,
          action: "include",
          sourceRole: "supporting",
          confidence: 0.86,
          reason: "Selected by compact context reranker.",
          usefulFacts: [],
          sourcePostId: null,
          sourceMessageId: null,
        },
      ];
    });
  }

  const compactRoleDecisions = parseCompactRoleArrays(data);
  if (compactRoleDecisions.length > 0) {
    return compactRoleDecisions;
  }

  const decisions = Array.isArray(data.decisions) ? data.decisions : [];

  return decisions.flatMap((item): ContextRerankDecision[] => {
    if (!item || typeof item !== "object") return [];

    const row = item as Record<string, unknown>;
    const candidateId =
      typeof row.candidate_id === "string" ? row.candidate_id.trim() : "";

    if (!candidateId) return [];

    const usefulFacts = Array.isArray(row.useful_facts)
      ? row.useful_facts.filter(
          (fact): fact is string => typeof fact === "string",
        )
      : [];

    return [
      {
        candidateId,
        action: row.action === "include" ? "include" : "exclude",
        sourceRole: parseContextSourceRole(row.source_role),
        confidence:
          typeof row.confidence === "number" && Number.isFinite(row.confidence)
            ? Math.max(0, Math.min(1, row.confidence))
            : 0,
        reason:
          typeof row.reason === "string" && row.reason.trim()
            ? row.reason.trim()
            : "Reranked by Context Router.",
        usefulFacts,
        sourcePostId:
          typeof row.source_post_id === "string" ? row.source_post_id : null,
        sourceMessageId:
          typeof row.source_message_id === "string"
            ? row.source_message_id
            : null,
      },
    ];
  });
}

export function selectIncludedContext(
  decisions: ContextRerankDecision[],
): ContextRerankDecision[] {
  return decisions
    .filter(
      (decision) =>
        decision.action === "include" &&
        decision.sourceRole !== "exclude" &&
        decision.confidence >= MIN_INCLUDE_CONFIDENCE,
    )
    .sort(
      (a, b) =>
        sourceRoleSortWeight(b.sourceRole) -
          sourceRoleSortWeight(a.sourceRole) ||
        b.confidence - a.confidence,
    )
    .slice(0, MAX_FINAL_CONTEXTS);
}

export async function rerankContextCandidates(
  input: RerankerInput,
  caller: RerankerCaller = async (prompt) =>
    invokeClaude({
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      model: RERANKER_MODEL,
      maxTokens: 600,
    }),
): Promise<ContextRerankDecision[]> {
  if (input.candidates.length === 0) return [];

  const prompt = buildRerankerPrompt(input);
  return parseRerankResponse(await caller(prompt));
}

function truncateForReranker(value: string): string {
  if (value.length <= MAX_RERANKER_SNIPPET_CHARS) return value;
  return `${value.slice(0, MAX_RERANKER_SNIPPET_CHARS - 3)}...`;
}

function parseContextSourceRole(value: unknown): ContextSourceRole {
  if (
    value === "core" ||
    value === "supporting" ||
    value === "watchlist" ||
    value === "exclude"
  ) {
    return value;
  }

  return "supporting";
}

function parseCompactRoleArrays(
  data: Record<string, unknown>,
): ContextRerankDecision[] {
  const roleSpecs: Array<{
    key: Exclude<ContextSourceRole, "exclude">;
    confidence: number;
    reason: string;
  }> = [
    {
      key: "core",
      confidence: 0.92,
      reason: "Selected as core by compact context reranker.",
    },
    {
      key: "supporting",
      confidence: 0.86,
      reason: "Selected as supporting by compact context reranker.",
    },
    {
      key: "watchlist",
      confidence: 0.74,
      reason: "Selected as watchlist by compact context reranker.",
    },
  ];

  return roleSpecs.flatMap(({ key, confidence, reason }) => {
    const value = data[key];
    if (!Array.isArray(value)) return [];

    return value.flatMap((item): ContextRerankDecision[] => {
      const candidateId = typeof item === "string" ? item.trim() : "";
      if (!candidateId) return [];

      return [
        {
          candidateId,
          action: "include",
          sourceRole: key,
          confidence,
          reason,
          usefulFacts: [],
          sourcePostId: null,
          sourceMessageId: null,
        },
      ];
    });
  });
}

function sourceRoleSortWeight(role: ContextSourceRole | undefined): number {
  switch (role) {
    case "core":
      return 3;
    case "supporting":
      return 2;
    case "watchlist":
      return 1;
    case "exclude":
      return 0;
    default:
      return 2;
  }
}

function sourceSizeLabel(candidate: ContextRouterCandidate): string {
  const bodyChars = candidate.sourceBodyChars ?? 0;
  const postCount = candidate.sourcePostCount ?? 0;

  if (bodyChars >= 150_000 || postCount >= 100) return "very_long";
  if (bodyChars >= 60_000 || postCount >= 40) return "long";
  if (bodyChars >= 20_000 || postCount >= 15) return "medium";
  return "small_or_unknown";
}
