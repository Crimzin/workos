import { rankCandidateSnippets } from "./candidates";
import { selectIncludedContext } from "./reranker";
import { rerankContextCandidates, type RerankerInput } from "./reranker";
import { resolveContextTurn, type TurnResolverInput } from "./turn-resolver";
import type {
  ContextPack,
  ContextRerankDecision,
  ContextRouterCandidate,
  ContextTurnResolution,
} from "./types";

export type RouterContextPack = ContextPack & {
  inclusion_reason: string;
  source_message_id: string | null;
};

export interface ContextPackDecision {
  candidate: ContextRouterCandidate;
  pack: RouterContextPack;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  inclusionReason: string;
}

export interface RouteAutomaticContextInput {
  currentText: string;
  previousUserTexts: string[];
  recentThreadTexts?: string[];
  activeThreadTitle: string;
  candidates: ContextRouterCandidate[];
  turnResolution?: ContextTurnResolution;
}

export interface RouteAutomaticContextCallers {
  resolveTurn?: (input: TurnResolverInput) => Promise<ContextTurnResolution>;
  rerankCandidates?: (
    input: RerankerInput
  ) => Promise<ContextRerankDecision[]>;
}

export const MIN_TURN_RESOLUTION_CONFIDENCE = 0.5;

export async function routeAutomaticContext(
  input: RouteAutomaticContextInput,
  callers: RouteAutomaticContextCallers = {}
): Promise<ContextPackDecision[]> {
  const resolution =
    input.turnResolution ??
    (await (callers.resolveTurn ?? resolveContextTurn)({
      currentText: input.currentText,
      previousUserTexts: input.previousUserTexts,
      recentThreadTexts: input.recentThreadTexts,
      activeThreadTitle: input.activeThreadTitle,
    }));

  if (
    !resolution.shouldRetrieve ||
    resolution.confidence < MIN_TURN_RESOLUTION_CONFIDENCE
  ) {
    return [];
  }

  const rankedCandidates = rankCandidateSnippets(
    resolution.resolvedQuery,
    input.candidates
  );
  if (rankedCandidates.length === 0) return [];

  const decisions = await (callers.rerankCandidates ?? rerankContextCandidates)(
    {
      resolvedQuery: resolution.resolvedQuery,
      candidates: rankedCandidates,
    }
  );

  return buildContextPacksForDecisions({
    resolvedQuery: resolution.resolvedQuery,
    candidates: rankedCandidates,
    decisions,
  });
}

export function buildContextPacksForDecisions(input: {
  resolvedQuery: string;
  candidates: ContextRouterCandidate[];
  decisions: ContextRerankDecision[];
}): ContextPackDecision[] {
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate])
  );

  return selectIncludedContext(input.decisions).flatMap(
    (decision): ContextPackDecision[] => {
      const candidate = candidateById.get(decision.candidateId);
      if (!candidate) return [];

      const sourcePostId = decision.sourcePostId ?? candidate.sourcePostId;
      const sourceMessageId =
        decision.sourceMessageId ?? candidate.sourceMessageId;

      return [
        {
          candidate,
          sourcePostId,
          sourceMessageId,
          inclusionReason: `Relevant (${Math.round(
            decision.confidence * 100
          )}%): ${decision.reason}`,
          pack: {
            router_version: "context-router-v1",
            resolved_query: input.resolvedQuery,
            inclusion_reason: decision.reason,
            useful_facts: decision.usefulFacts,
            relevance_confidence: decision.confidence,
            source_message_id: sourceMessageId,
            reason: decision.reason,
            snippet: candidate.snippet,
          },
        },
      ];
    }
  );
}
