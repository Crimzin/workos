import { rankCandidateSnippets } from "./candidates";
import { prioritizeCheapCandidates } from "./discovery";
import { contextBudgetForTask } from "./budget";
import {
  createContextPromptManifest,
  updateManifestStage,
} from "./manifest";
import { selectIncludedContext } from "./reranker";
import { rerankContextCandidates, type RerankerInput } from "./reranker";
import { resolveContextTurn, type TurnResolverInput } from "./turn-resolver";
import type {
  ContextPack,
  ContextPromptManifest,
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

export interface RouteAutomaticContextResult {
  decisions: ContextPackDecision[];
  manifest: ContextPromptManifest;
}

export async function routeAutomaticContextV2(
  input: RouteAutomaticContextInput,
  callers: RouteAutomaticContextCallers = {}
): Promise<RouteAutomaticContextResult> {
  const resolution =
    input.turnResolution ??
    (await (callers.resolveTurn ?? resolveContextTurn)({
      currentText: input.currentText,
      previousUserTexts: input.previousUserTexts,
      recentThreadTexts: input.recentThreadTexts,
      activeThreadTitle: input.activeThreadTitle,
    }));
  const budget = contextBudgetForTask("ordinary");
  let manifest = createContextPromptManifest({
    resolvedQuery: resolution.resolvedQuery,
    taskType: "blank-thread context discovery",
    budgetChars: budget.targetChars,
  });

  if (
    !resolution.shouldRetrieve ||
    resolution.confidence < MIN_TURN_RESOLUTION_CONFIDENCE
  ) {
    return { decisions: [], manifest };
  }

  manifest = updateManifestStage(manifest, "Ranking candidate context...");
  const rankedCandidates = rankCandidateSnippets(
    resolution.resolvedQuery,
    prioritizeCheapCandidates(input.candidates)
  );
  if (rankedCandidates.length === 0) {
    return { decisions: [], manifest };
  }

  const decisions = await (callers.rerankCandidates ?? rerankContextCandidates)(
    {
      resolvedQuery: resolution.resolvedQuery,
      candidates: rankedCandidates,
    }
  );

  const packs = buildContextPacksForDecisions({
    resolvedQuery: resolution.resolvedQuery,
    candidates: rankedCandidates,
    decisions,
  });

  const includedIds = new Set(packs.map((pack) => pack.candidate.id));

  return {
    decisions: packs,
    manifest: {
      ...manifest,
      estimated_prompt_chars: packs.reduce(
        (sum, item) =>
          sum + (item.candidate.estimatedChars ?? item.pack.snippet.length),
        0
      ),
      included_sources: packs.map((item) => ({
        id: item.candidate.id,
        title: item.candidate.title,
        source_kind: item.candidate.sourceKind ?? "global",
        reason: item.inclusionReason,
      })),
      omitted_sources: rankedCandidates
        .filter((candidate) => !includedIds.has(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          source_kind: candidate.sourceKind ?? "global",
          reason: "Not selected by reranker or below confidence threshold.",
        })),
    },
  };
}

export async function routeAutomaticContext(
  input: RouteAutomaticContextInput,
  callers: RouteAutomaticContextCallers = {}
): Promise<ContextPackDecision[]> {
  return (await routeAutomaticContextV2(input, callers)).decisions;
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
