import { rankCandidateSnippets } from "./candidates";
import { prioritizeCheapCandidates } from "./discovery";
import { contextBudgetForTask } from "./budget";
import { createContextPromptManifest, updateManifestStage } from "./manifest";
import { selectIncludedContext } from "./reranker";
import { rerankContextCandidates, type RerankerInput } from "./reranker";
import {
  resolveContextTurnWithFallback,
  type TurnResolverInput,
} from "./turn-resolver";
import type {
  ContextPack,
  ContextPromptManifest,
  ContextRerankDecision,
  ContextRouterCandidate,
  ContextSourceRole,
  ContextTurnResolution,
} from "./types";

export type RouterContextPack = ContextPack & {
  inclusion_reason: string;
  source_message_id: string | null;
};

type IncludedContextSourceRole = Exclude<ContextSourceRole, "exclude">;

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
  rerankCandidates?: (input: RerankerInput) => Promise<ContextRerankDecision[]>;
}

export const MIN_TURN_RESOLUTION_CONFIDENCE = 0.5;
const FINANCIAL_QUERY_PATTERN =
  /\b(finance|finances|financial|money|budget|cash|cashflow|cash-flow|tax|taxes|retirement|runway|income|housing|house|mortgage|rent|investment|investments|assets|debt)\b/i;

const PRIVILEGED_SOURCE_KINDS = new Set([
  "active",
  "mention",
  "family",
  "attached",
  "linked",
  "account-memory",
  "thread-sheet",
]);

export interface RouteAutomaticContextResult {
  decisions: ContextPackDecision[];
  manifest: ContextPromptManifest;
}

export async function routeAutomaticContextV2(
  input: RouteAutomaticContextInput,
  callers: RouteAutomaticContextCallers = {},
): Promise<RouteAutomaticContextResult> {
  const resolution =
    input.turnResolution ??
    (await (callers.resolveTurn ?? resolveContextTurnWithFallback)({
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
    turnResolution: resolution,
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
    prioritizeCheapCandidates(input.candidates),
  );
  if (rankedCandidates.length === 0) {
    return { decisions: [], manifest };
  }

  const warnings = [...manifest.warnings];
  const decisions = await rerankCandidatesWithFallback({
    input: {
      resolvedQuery: resolution.resolvedQuery,
      candidates: rankedCandidates,
    },
    rerankCandidates: callers.rerankCandidates ?? rerankContextCandidates,
    warnings,
  });

  const selectedPacks = buildContextPacksForDecisions({
    resolvedQuery: resolution.resolvedQuery,
    candidates: rankedCandidates,
    decisions,
  });
  const budgetPruned = pruneContextPacksToBudget(
    selectedPacks,
    budget.warningChars,
  );
  if (budgetPruned.prunedIds.size > 0) {
    warnings.push(
      `Context budget pressure pruned ${budgetPruned.prunedIds.size} selected source${
        budgetPruned.prunedIds.size === 1 ? "" : "s"
      }.`,
    );
  }
  const packs = budgetPruned.packs;

  const includedIds = new Set(packs.map((pack) => pack.candidate.id));

  return {
    decisions: packs,
    manifest: {
      ...manifest,
      estimated_prompt_chars: packs.reduce(
        (sum, item) =>
          sum + (item.candidate.estimatedChars ?? item.pack.snippet.length),
        0,
      ),
      included_sources: packs.map((item) => ({
        id: item.candidate.id,
        title: item.candidate.title,
        source_kind: item.candidate.sourceKind ?? "global",
        source_origin: item.candidate.sourceOrigin ?? "workos",
        source_app: item.candidate.sourceApp,
        source_provenance: item.candidate.sourceProvenance ?? null,
        source_role: item.pack.source_role,
        reason: item.inclusionReason,
      })),
      omitted_sources: rankedCandidates
        .filter((candidate) => !includedIds.has(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          source_kind: candidate.sourceKind ?? "global",
          source_origin: candidate.sourceOrigin ?? "workos",
          source_app: candidate.sourceApp,
          source_provenance: candidate.sourceProvenance ?? null,
          reason: budgetPruned.prunedIds.has(candidate.id)
            ? "Selected by router but pruned because selected context exceeded the warning budget."
            : "Not selected by reranker or below confidence threshold.",
        })),
      warnings,
    },
  };
}

export async function routeAutomaticContext(
  input: RouteAutomaticContextInput,
  callers: RouteAutomaticContextCallers = {},
): Promise<ContextPackDecision[]> {
  return (await routeAutomaticContextV2(input, callers)).decisions;
}

export function buildContextPacksForDecisions(input: {
  resolvedQuery: string;
  candidates: ContextRouterCandidate[];
  decisions: ContextRerankDecision[];
}): ContextPackDecision[] {
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate]),
  );

  return selectIncludedContext(input.decisions).flatMap(
    (decision): ContextPackDecision[] => {
      const candidate = candidateById.get(decision.candidateId);
      if (!candidate) return [];

      const routedDecision = applyContextSourceRole({
        resolvedQuery: input.resolvedQuery,
        candidate,
        decision,
      });
      const sourcePostId = decision.sourcePostId ?? candidate.sourcePostId;
      const sourceMessageId =
        decision.sourceMessageId ?? candidate.sourceMessageId;
      const sourceRole = includedContextSourceRole(routedDecision.sourceRole);

      return [
        {
          candidate,
          sourcePostId,
          sourceMessageId,
          inclusionReason: `Relevant (${Math.round(
            routedDecision.confidence * 100,
          )}%, ${sourceRole}): ${routedDecision.reason}`,
          pack: {
            router_version: "context-router-v1",
            resolved_query: input.resolvedQuery,
            source_role: sourceRole,
            inclusion_reason: routedDecision.reason,
            useful_facts: usefulFactsForContextPack(routedDecision, candidate),
            relevance_confidence: routedDecision.confidence,
            source_message_id: sourceMessageId,
            reason: routedDecision.reason,
            snippet: candidate.snippet,
            ...(candidate.sourceOrigin
              ? { source_origin: candidate.sourceOrigin }
              : {}),
            ...(candidate.sourceOrigin ? { source_app: candidate.sourceApp } : {}),
            ...(candidate.sourceProvenance
              ? { source_provenance: candidate.sourceProvenance }
              : {}),
          },
        },
      ];
    },
  );
}

function usefulFactsForContextPack(
  decision: ContextRerankDecision,
  candidate: ContextRouterCandidate,
): string[] {
  const explicitFacts = cleanUsefulFacts(decision.usefulFacts);
  if (explicitFacts.length > 0) return explicitFacts;

  const previewFacts = cleanUsefulFacts(candidate.previewFacts ?? []);
  if (previewFacts.length > 0) return previewFacts;

  const snippet = candidate.snippet.trim();
  if (!snippet || snippet === candidate.title.trim()) return [];

  return cleanUsefulFacts([snippet]);
}

function cleanUsefulFacts(facts: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const fact of facts) {
    const normalized = fact.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(
      normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized,
    );
    if (cleaned.length >= 3) break;
  }

  return cleaned;
}

export function pruneContextPacksToBudget(
  packs: ContextPackDecision[],
  warningChars: number,
): { packs: ContextPackDecision[]; prunedIds: Set<string> } {
  let totalChars = estimateContextPackChars(packs);
  if (totalChars <= warningChars) {
    return { packs, prunedIds: new Set() };
  }

  const prunedIndexes = new Set<number>();
  const rankedForPruning = packs
    .map((pack, index) => ({
      pack,
      index,
      estimatedChars: estimateContextPackChars([pack]),
      retentionScore: contextPackRetentionScore(pack),
    }))
    .sort(
      (a, b) =>
        a.retentionScore - b.retentionScore ||
        b.estimatedChars - a.estimatedChars ||
        b.index - a.index,
    );

  for (const item of rankedForPruning) {
    if (totalChars <= warningChars) break;
    if (packs.length - prunedIndexes.size <= 1) break;

    prunedIndexes.add(item.index);
    totalChars -= item.estimatedChars;
  }

  return {
    packs: packs.filter((_, index) => !prunedIndexes.has(index)),
    prunedIds: new Set(
      packs
        .filter((_, index) => prunedIndexes.has(index))
        .map((pack) => pack.candidate.id),
    ),
  };
}

function applyContextSourceRole(input: {
  resolvedQuery: string;
  candidate: ContextRouterCandidate;
  decision: ContextRerankDecision;
}): ContextRerankDecision {
  let sourceRole = includedContextSourceRole(input.decision.sourceRole);
  let reason = input.decision.reason;

  if (
    sourceRole !== "core" &&
    shouldDemoteToWatchlist(input.resolvedQuery, input.candidate)
  ) {
    sourceRole = "watchlist";
    reason = appendReason(
      reason,
      watchlistReason(input.resolvedQuery, input.candidate),
    );
  }

  return {
    ...input.decision,
    sourceRole,
    reason,
  };
}

function includedContextSourceRole(
  role: ContextSourceRole | undefined,
): IncludedContextSourceRole {
  if (role === "core" || role === "watchlist") return role;
  return "supporting";
}

function shouldDemoteToWatchlist(
  resolvedQuery: string,
  candidate: ContextRouterCandidate,
): boolean {
  if (!FINANCIAL_QUERY_PATTERN.test(resolvedQuery)) return false;
  if (isPrivilegedSourceKind(candidate)) return false;

  const text = contextRoleText(candidate);
  if (isNarrowCreditContext(text)) return true;
  if (isSpeculativeInvestmentContext(text) && !investmentIntent(resolvedQuery)) {
    return true;
  }
  if (isTitleOnlyContext(candidate)) {
    return true;
  }

  return false;
}

function watchlistReason(
  resolvedQuery: string,
  candidate: ContextRouterCandidate,
): string {
  const text = contextRoleText(candidate);
  if (isNarrowCreditContext(text)) {
    return "Kept as watchlist because it is narrow credit/collections context, not a central planning driver.";
  }
  if (isSpeculativeInvestmentContext(text) && !investmentIntent(resolvedQuery)) {
    return "Kept as watchlist because it is speculative investment context and the user did not specifically ask for investment selection.";
  }
  return "Kept as watchlist because available evidence is thin.";
}

function appendReason(reason: string, addition: string): string {
  if (!addition) return reason;
  return reason ? `${reason} ${addition}` : addition;
}

function contextRoleText(candidate: ContextRouterCandidate): string {
  return `${candidate.title}\n${candidate.snippet}\n${candidate.previewFacts?.join("\n") ?? ""}`;
}

function isNarrowCreditContext(text: string): boolean {
  return /\b(t-mobile|collection account|collections?|credit report|dispute|validation letter)\b/i.test(
    text,
  );
}

function isSpeculativeInvestmentContext(text: string): boolean {
  return /\b(quantum computing|single-name risk|stock pick|speculative|momentum play|etf)\b/i.test(
    text,
  );
}

function investmentIntent(resolvedQuery: string): boolean {
  return /\b(investment strategy|portfolio|asset allocation|liquid assets|stocks?|etf|brokerage)\b/i.test(
    resolvedQuery,
  );
}

function isTitleOnlyContext(candidate: ContextRouterCandidate): boolean {
  return candidate.snippet.trim() === candidate.title.trim();
}

function estimateContextPackChars(packs: ContextPackDecision[]): number {
  return packs.reduce(
    (sum, item) =>
      sum + (item.candidate.estimatedChars ?? item.pack.snippet.length),
    0,
  );
}

function contextPackRetentionScore(item: ContextPackDecision): number {
  const candidate = item.candidate;
  return (
    item.pack.relevance_confidence * 100 +
    sourceRoleRetentionBonus(item.pack.source_role) +
    Math.min(candidate.priorWeight ?? 0, 10) * 2 +
    Math.min(candidate.lexicalScore ?? 0, 10) +
    (isPrivilegedSourceKind(candidate) ? 15 : 0) +
    sourceSizeRetentionBonus(candidate)
  );
}

function sourceRoleRetentionBonus(
  role: IncludedContextSourceRole | undefined,
): number {
  switch (role) {
    case "core":
      return 80;
    case "supporting":
      return 35;
    case "watchlist":
      return 0;
    default:
      return 35;
  }
}

function sourceSizeRetentionBonus(candidate: ContextRouterCandidate): number {
  const bodyChars = candidate.sourceBodyChars ?? 0;
  const postCount = candidate.sourcePostCount ?? 0;

  if (bodyChars >= 150_000 || postCount >= 100) return 8;
  if (bodyChars >= 60_000 || postCount >= 40) return 5;
  if (bodyChars >= 20_000 || postCount >= 15) return 2;
  return 0;
}

function isPrivilegedSourceKind(candidate: ContextRouterCandidate): boolean {
  return PRIVILEGED_SOURCE_KINDS.has(candidate.sourceKind ?? "");
}

async function rerankCandidatesWithFallback(input: {
  input: RerankerInput;
  rerankCandidates: (input: RerankerInput) => Promise<ContextRerankDecision[]>;
  warnings: string[];
}): Promise<ContextRerankDecision[]> {
  try {
    return await input.rerankCandidates(input.input);
  } catch (error) {
    console.warn(
      "[context-router] context reranker failed; continuing without reranked context:",
      error instanceof Error ? error.message : error,
    );
    input.warnings.push(
      "Context reranker failed; continuing without reranked context.",
    );
    return [];
  }
}
