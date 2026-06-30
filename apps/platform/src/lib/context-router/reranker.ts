import { invokeClaude } from "../agents/claude";
import { parseLlmJsonObject } from "./json";
import type { ContextRerankDecision, ContextRouterCandidate } from "./types";

const RERANKER_MODEL = "claude-haiku-4-5";
const MIN_INCLUDE_CONFIDENCE = 0.72;
const MAX_FINAL_CONTEXTS = 6;

export interface RerankerInput {
  resolvedQuery: string;
  candidates: ContextRouterCandidate[];
}

export interface RerankerPrompt {
  system: string;
  user: string;
}

export type RerankerCaller = (prompt: RerankerPrompt) => Promise<string>;

export function buildRerankerPrompt(input: RerankerInput): RerankerPrompt {
  return {
    system:
      "You rerank WorkOS context candidates. Include only sources that would materially improve the assistant answer. Exclude incidental keyword matches. Return strict JSON only.",
    user: JSON.stringify({
      resolved_query: input.resolvedQuery,
      candidates: input.candidates.map((candidate) => ({
        candidate_id: candidate.id,
        title: candidate.title,
        source_app: candidate.sourceApp,
        source_post_id: candidate.sourcePostId,
        source_message_id: candidate.sourceMessageId,
        snippet: candidate.snippet,
      })),
      required_json_shape: {
        decisions: [
          {
            candidate_id: "string",
            action: "include|exclude",
            confidence: "number 0..1",
            reason: "short string",
            useful_facts: ["strings"],
            source_post_id: "string|null",
            source_message_id: "string|null",
          },
        ],
      },
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

  const decisions = Array.isArray(data.decisions) ? data.decisions : [];

  return decisions.flatMap((item): ContextRerankDecision[] => {
    if (!item || typeof item !== "object") return [];

    const row = item as Record<string, unknown>;
    const candidateId =
      typeof row.candidate_id === "string" ? row.candidate_id.trim() : "";

    if (!candidateId) return [];

    const usefulFacts = Array.isArray(row.useful_facts)
      ? row.useful_facts.filter((fact): fact is string => typeof fact === "string")
      : [];

    return [
      {
        candidateId,
        action: row.action === "include" ? "include" : "exclude",
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
          typeof row.source_message_id === "string" ? row.source_message_id : null,
      },
    ];
  });
}

export function selectIncludedContext(
  decisions: ContextRerankDecision[]
): ContextRerankDecision[] {
  return decisions
    .filter(
      (decision) =>
        decision.action === "include" &&
        decision.confidence >= MIN_INCLUDE_CONFIDENCE
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_FINAL_CONTEXTS);
}

export async function rerankContextCandidates(
  input: RerankerInput,
  caller: RerankerCaller = async (prompt) =>
    invokeClaude({
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      model: RERANKER_MODEL,
      maxTokens: 2000,
    })
): Promise<ContextRerankDecision[]> {
  if (input.candidates.length === 0) return [];

  const prompt = buildRerankerPrompt(input);
  return parseRerankResponse(await caller(prompt));
}
