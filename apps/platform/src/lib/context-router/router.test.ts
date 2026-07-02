import assert from "node:assert/strict";
import {
  buildContextPacksForDecisions,
  routeAutomaticContext,
  routeAutomaticContextV2,
} from "./router.ts";
import type { ContextRerankDecision, ContextRouterCandidate } from "./types.ts";

const candidates: ContextRouterCandidate[] = [
  {
    id: "anthropic",
    title: "Danny @ Anthropic",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "candidate-post",
    sourceMessageId: "candidate-message",
    snippet: "Danny discussed Anthropic product roles.",
    lexicalScore: 3,
  },
  {
    id: "scratch",
    title: "Scratch notes",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "scratch-post",
    sourceMessageId: "scratch-message",
    snippet: "Unrelated notes.",
    lexicalScore: 1,
  },
];

const decisions: ContextRerankDecision[] = [
  {
    candidateId: "scratch",
    action: "exclude",
    confidence: 0.98,
    reason: "Not relevant.",
    usefulFacts: [],
    sourcePostId: "scratch-post",
    sourceMessageId: "scratch-message",
  },
  {
    candidateId: "anthropic",
    action: "include",
    confidence: 0.91,
    reason: "Directly relevant to Anthropic process.",
    usefulFacts: ["Anthropic product roles were discussed."],
    sourcePostId: null,
    sourceMessageId: "decision-message",
  },
  {
    candidateId: "missing",
    action: "include",
    confidence: 0.95,
    reason: "No matching candidate.",
    usefulFacts: ["Should be ignored."],
    sourcePostId: null,
    sourceMessageId: null,
  },
  {
    candidateId: "anthropic",
    action: "include",
    confidence: 0.3,
    reason: "Below the reranker include threshold.",
    usefulFacts: ["Should be filtered by selectIncludedContext."],
    sourcePostId: null,
    sourceMessageId: null,
  },
];

const packs = buildContextPacksForDecisions({
  resolvedQuery: "career advice Anthropic roles",
  candidates,
  decisions,
});

assert.equal(packs.length, 1);
assert.equal(packs[0].candidate.id, "anthropic");
assert.equal(packs[0].sourcePostId, "candidate-post");
assert.equal(packs[0].sourceMessageId, "decision-message");
assert.equal(
  packs[0].inclusionReason,
  "Relevant (91%, supporting): Directly relevant to Anthropic process.",
);
assert.deepEqual(packs[0].pack, {
  router_version: "context-router-v1",
  resolved_query: "career advice Anthropic roles",
  source_role: "supporting",
  inclusion_reason: "Directly relevant to Anthropic process.",
  useful_facts: ["Anthropic product roles were discussed."],
  relevance_confidence: 0.91,
  source_message_id: "decision-message",
  reason: "Directly relevant to Anthropic process.",
  snippet: "Danny discussed Anthropic product roles.",
});

const fallbackFactPacks = buildContextPacksForDecisions({
  resolvedQuery: "broad financial planning",
  candidates: [
    {
      id: "prenup",
      title: "Evaluating a prenuptial agreement",
      sourceApp: "claude",
      updatedAt: null,
      sourcePostId: null,
      sourceMessageId: null,
      snippet:
        "Prenup planning affects household obligations, marriage timeline, and future financial commitments.",
      lexicalScore: 2,
      previewFacts: ["Prenup planning affects future household obligations."],
    },
  ],
  decisions: [
    {
      candidateId: "prenup",
      action: "include",
      sourceRole: "supporting",
      confidence: 0.86,
      reason: "Selected by compact reranker.",
      usefulFacts: [],
      sourcePostId: null,
      sourceMessageId: null,
    },
  ],
});

assert.deepEqual(fallbackFactPacks[0].pack.useful_facts, [
  "Prenup planning affects future household obligations.",
]);

async function main() {
  const routed = await routeAutomaticContext(
    {
      currentText: "try yet again",
      previousUserTexts: [
        "At this stage in my career, compare Anthropic and Tenex roles.",
      ],
      recentThreadTexts: [
        "Claude: Anthropic, Tenex, and Reflection are the three opportunities.",
      ],
      activeThreadTitle: "AI & Career Development",
      candidates: [
        {
          id: "missing-date",
          title: "Missing date",
          sourceApp: "claude",
          updatedAt: null,
          sourcePostId: "old-post",
          sourceMessageId: "old-message",
          snippet: "Anthropic career role notes.",
          lexicalScore: 2,
        },
        {
          id: "newer",
          title: "Newer Anthropic notes",
          sourceApp: "claude",
          updatedAt: "2026-06-29T12:00:00.000Z",
          sourcePostId: "new-post",
          sourceMessageId: "new-message",
          snippet: "Anthropic career role notes with stronger source anchors.",
          lexicalScore: 2,
        },
        {
          id: "unrelated",
          title: "Unrelated",
          sourceApp: "claude",
          updatedAt: "2026-06-30T12:00:00.000Z",
          sourcePostId: "unrelated-post",
          sourceMessageId: "unrelated-message",
          snippet: "Kitchen remodel notes.",
          lexicalScore: 0,
        },
      ],
    },
    {
      resolveTurn: async (input) => {
        assert.deepEqual(input.recentThreadTexts, [
          "Claude: Anthropic, Tenex, and Reflection are the three opportunities.",
        ]);
        return {
          originalText: "try yet again",
          resolvedQuery: "Anthropic career role comparison",
          shouldRetrieve: true,
          confidence: 0.82,
          reason: "Continuation of prior career comparison.",
        };
      },
      rerankCandidates: async (input) => {
        assert.equal(input.resolvedQuery, "Anthropic career role comparison");
        assert.deepEqual(
          input.candidates.map((candidate) => candidate.id),
          ["newer", "missing-date"],
        );
        return [
          {
            candidateId: "newer",
            action: "include",
            confidence: 0.91,
            reason: "Best match for the career comparison.",
            usefulFacts: ["Anthropic role notes have stronger anchors."],
            sourcePostId: null,
            sourceMessageId: "reranked-message",
          },
        ];
      },
    },
  );

  assert.equal(routed.length, 1);
  assert.equal(routed[0].candidate.id, "newer");
  assert.equal(routed[0].sourcePostId, "new-post");
  assert.equal(routed[0].sourceMessageId, "reranked-message");
  assert.equal(
    routed[0].pack.resolved_query,
    "Anthropic career role comparison",
  );

  const routedWithPreResolvedTurn = await routeAutomaticContext(
    {
      currentText: "More like the third bullet",
      previousUserTexts: ["I need financial planning help."],
      recentThreadTexts: [
        "Claude: Are you looking to optimize an existing financial setup that needs refinement?",
      ],
      activeThreadTitle: "Life / Finances",
      candidates: [
        {
          id: "finance",
          title: "Career and Finance Strategy",
          sourceApp: "claude",
          updatedAt: "2026-06-29T12:00:00.000Z",
          sourcePostId: "finance-post",
          sourceMessageId: "finance-message",
          snippet:
            "Inheritance cash flows, housing, asset allocation, and financial strategy.",
          lexicalScore: 4,
        },
      ],
      turnResolution: {
        originalText: "More like the third bullet",
        resolvedQuery:
          "optimize existing financial setup including inheritance, housing, cash flow, and asset allocation",
        shouldRetrieve: true,
        confidence: 0.9,
        reason: "The user selected the prior assistant's third bullet.",
      },
    },
    {
      resolveTurn: async () => {
        throw new Error("pre-resolved turns should not resolve twice");
      },
      rerankCandidates: async (input) => {
        assert.equal(
          input.resolvedQuery,
          "optimize existing financial setup including inheritance, housing, cash flow, and asset allocation",
        );
        return [
          {
            candidateId: "finance",
            action: "include",
            confidence: 0.92,
            reason: "Rich finance context.",
            usefulFacts: ["The user is optimizing an existing setup."],
            sourcePostId: null,
            sourceMessageId: null,
          },
        ];
      },
    },
  );

  assert.equal(routedWithPreResolvedTurn.length, 1);
  assert.equal(routedWithPreResolvedTurn[0].candidate.id, "finance");

  const skippedByResolution = await routeAutomaticContext(
    {
      currentText: "thanks",
      previousUserTexts: [],
      activeThreadTitle: "Active thread",
      candidates,
    },
    {
      resolveTurn: async () => ({
        originalText: "thanks",
        resolvedQuery: "thanks",
        shouldRetrieve: false,
        confidence: 0.99,
        reason: "Acknowledgement.",
      }),
      rerankCandidates: async () => {
        throw new Error("reranker should not run when retrieval is skipped");
      },
    },
  );
  assert.deepEqual(skippedByResolution, []);

  const skippedByConfidence = await routeAutomaticContext(
    {
      currentText: "maybe that thing",
      previousUserTexts: [],
      activeThreadTitle: "Active thread",
      candidates,
    },
    {
      resolveTurn: async () => ({
        originalText: "maybe that thing",
        resolvedQuery: "maybe that thing",
        shouldRetrieve: true,
        confidence: 0.49,
        reason: "Too ambiguous.",
      }),
      rerankCandidates: async () => {
        throw new Error("reranker should not run below confidence gate");
      },
    },
  );
  assert.deepEqual(skippedByConfidence, []);

  const routedV2 = await routeAutomaticContextV2(
    {
      currentText: "Help me with finance planning.",
      previousUserTexts: [],
      activeThreadTitle: "Blank",
      candidates: [
        {
          id: "finances",
          title: "Personal finances",
          sourceApp: "claude",
          updatedAt: "2026-06-29T12:00:00.000Z",
          sourcePostId: "p-fin",
          sourceMessageId: "m-fin",
          snippet: "Retirement, taxes, budget, and cash flow.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
      ],
    },
    {
      resolveTurn: async () => ({
        originalText: "Help me with finance planning.",
        resolvedQuery: "financial planning taxes budget retirement",
        shouldRetrieve: true,
        confidence: 0.95,
        reason: "Blank-thread discovery.",
      }),
      rerankCandidates: async (input) => {
        assert.deepEqual(
          input.candidates.map((candidate) => candidate.id),
          ["finances"],
        );

        return [
          {
            candidateId: input.candidates[0].id,
            action: "include",
            confidence: 0.93,
            reason: "Finance planning context.",
            usefulFacts: ["Retirement and taxes were discussed."],
            sourcePostId: null,
            sourceMessageId: null,
          },
        ];
      },
    },
  );

  assert.equal(routedV2.decisions.length, 1);
  assert.equal(routedV2.manifest.router_version, "context-router-v2");
  assert.equal(
    routedV2.manifest.resolved_query,
    "financial planning taxes budget retirement",
  );
  assert.equal(routedV2.manifest.included_sources[0].id, "finances");

  const routedImportedFinance = await routeAutomaticContextV2(
    {
      currentText: "I need your help with financial planning.",
      previousUserTexts: [],
      activeThreadTitle: "Finance",
      candidates: [
        {
          id: "career-finance",
          title: "Career and Finance Strategy",
          sourceApp: "claude",
          updatedAt: "2026-06-28T12:00:00.000Z",
          sourcePostId: "career-finance-post",
          sourceMessageId: "career-finance-message",
          snippet:
            "Job search runway, inheritance cash flow, housing decisions, taxes, income, retirement, and asset allocation.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
        {
          id: "house",
          title: "How much house",
          sourceApp: "claude",
          updatedAt: "2026-06-27T12:00:00.000Z",
          sourcePostId: "house-post",
          sourceMessageId: "house-message",
          snippet:
            "Housing affordability, rent vs buy, mortgage timing, property taxes, cash reserves, and down payment tradeoffs.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
        {
          id: "swarm-brainshare",
          title: "Swarm, Brainshare",
          sourceApp: "claude",
          updatedAt: "2026-06-30T12:00:00.000Z",
          sourcePostId: "swarm-post",
          sourceMessageId: "swarm-message",
          snippet:
            "Context budget, token-saving, BrainShare planning, cost controls, and retrieval architecture.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
      ],
    },
    {
      resolveTurn: async () => ({
        originalText: "I need your help with financial planning.",
        resolvedQuery:
          "personal financial planning runway housing taxes cash flow income retirement",
        shouldRetrieve: true,
        confidence: 0.95,
        reason: "Blank-thread financial planning request.",
      }),
      rerankCandidates: async (input) => {
        const rerankedIds = input.candidates.map((candidate) => candidate.id);
        assert.ok(rerankedIds.includes("career-finance"));
        assert.ok(rerankedIds.includes("house"));
        assert.ok(rerankedIds.includes("swarm-brainshare"));
        return [
          {
            candidateId: "career-finance",
            action: "include",
            confidence: 0.92,
            reason: "Directly captures the user's financial runway and strategy.",
            usefulFacts: ["Runway, inheritance, housing, taxes, and retirement were discussed."],
            sourcePostId: null,
            sourceMessageId: null,
          },
          {
            candidateId: "house",
            action: "include",
            confidence: 0.9,
            reason: "Relevant housing affordability context for personal finance.",
            usefulFacts: ["Housing affordability and property taxes were discussed."],
            sourcePostId: null,
            sourceMessageId: null,
          },
          {
            candidateId: "swarm-brainshare",
            action: "exclude",
            confidence: 0.98,
            reason: "Technical context-budget work is not personal finance planning.",
            usefulFacts: [],
            sourcePostId: null,
            sourceMessageId: null,
          },
        ];
      },
    },
  );

  assert.deepEqual(
    routedImportedFinance.decisions.map((decision) => decision.candidate.id),
    ["career-finance", "house"],
  );
  assert.deepEqual(
    routedImportedFinance.manifest.included_sources.map((source) => source.id),
    ["career-finance", "house"],
  );
  assert.deepEqual(
    routedImportedFinance.manifest.omitted_sources.map((source) => source.id),
    ["swarm-brainshare"],
  );

  const routedFinanceWithMissedTitle = await routeAutomaticContextV2(
    {
      currentText: "I need your help with financial planning.",
      previousUserTexts: [],
      activeThreadTitle: "Finances",
      candidates: [
        {
          id: "career-finance",
          title: "Career and Finance Strategy",
          sourceApp: "claude",
          updatedAt: "2026-06-28T12:00:00.000Z",
          sourcePostId: "career-finance-post",
          sourceMessageId: "career-finance-message",
          snippet:
            "A long-running strategy thread about job search runway, inheritance assumptions, housing timing, and retirement risk.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
        {
          id: "house",
          title: "How much house",
          sourceApp: "claude",
          updatedAt: "2026-06-29T12:00:00.000Z",
          sourcePostId: "house-post",
          sourceMessageId: "house-message",
          snippet:
            "Housing affordability, mortgage timing, property taxes, cash reserves, and down payment tradeoffs.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
      ],
    },
    {
      resolveTurn: async () => ({
        originalText: "I need your help with financial planning.",
        resolvedQuery: "personal financial planning housing cash retirement",
        shouldRetrieve: true,
        confidence: 0.95,
        reason: "Blank-thread financial planning request.",
      }),
      rerankCandidates: async (input) => {
        assert.deepEqual(
          input.candidates.map((candidate) => candidate.id).sort(),
          ["career-finance", "house"],
        );
        return [
          {
            candidateId: "house",
            action: "include",
            confidence: 0.9,
            reason: "Relevant housing affordability context.",
            usefulFacts: ["Housing affordability and taxes were discussed."],
            sourcePostId: null,
            sourceMessageId: null,
          },
        ];
      },
    },
  );

  assert.deepEqual(
    routedFinanceWithMissedTitle.decisions.map(
      (decision) => decision.candidate.id,
    ),
    ["house"],
  );
  assert.deepEqual(
    routedFinanceWithMissedTitle.manifest.omitted_sources.map(
      (source) => source.id,
    ),
    ["career-finance"],
  );

  const routedWithSourceRoles = await routeAutomaticContextV2(
    {
      currentText:
        "I need a general assessment of where I'm at financially across all the complicated dynamics.",
      previousUserTexts: ["I need your help with financial planning."],
      activeThreadTitle: "Finances",
      candidates: [
        {
          id: "prenup",
          title: "Evaluating a prenuptial agreement",
          sourceApp: "claude",
          updatedAt: "2026-06-29T12:00:00.000Z",
          sourcePostId: "prenup-post",
          sourceMessageId: "prenup-message",
          snippet:
            "Prenup planning, Lulu's immigration/work eligibility, future spouse support obligations, and family financial commitments.",
          lexicalScore: 2,
          sourceKind: "imported",
          priorWeight: 3,
        },
        {
          id: "tmobile",
          title: "Disputed T-Mobile collection account on credit report",
          sourceApp: "claude",
          updatedAt: "2026-06-29T12:00:00.000Z",
          sourcePostId: "tmobile-post",
          sourceMessageId: "tmobile-message",
          snippet:
            "A narrow $122 collection account dispute on a credit report. It may matter for lease friction but is not a central planning driver.",
          lexicalScore: 2,
          sourceKind: "imported",
          priorWeight: 3,
        },
      ],
    },
    {
      resolveTurn: async () => ({
        originalText:
          "I need a general assessment of where I'm at financially across all the complicated dynamics.",
        resolvedQuery:
          "comprehensive personal financial assessment cash runway housing investments inheritance marriage prenup household obligations",
        shouldRetrieve: true,
        confidence: 0.96,
        reason: "Broad financial assessment.",
      }),
      rerankCandidates: async () => [
        {
          candidateId: "prenup",
          action: "include",
          sourceRole: "supporting",
          confidence: 0.88,
          reason: "Household and legal obligation context.",
          usefulFacts: [
            "Prenup planning may affect future spouse obligations and family financial planning.",
          ],
          sourcePostId: null,
          sourceMessageId: null,
        },
        {
          candidateId: "tmobile",
          action: "include",
          sourceRole: "supporting",
          confidence: 0.8,
          reason: "Credit-report context may be relevant.",
          usefulFacts: ["Small collection dispute exists."],
          sourcePostId: null,
          sourceMessageId: null,
        },
      ],
    },
  );

  assert.deepEqual(
    routedWithSourceRoles.decisions.map((decision) => decision.candidate.id),
    ["prenup", "tmobile"],
  );
  assert.equal(routedWithSourceRoles.decisions[0].pack.source_role, "supporting");
  assert.equal(routedWithSourceRoles.decisions[1].pack.source_role, "watchlist");
  assert.match(
    routedWithSourceRoles.decisions[1].pack.reason,
    /narrow credit\/collections context/i,
  );

  const routedWithBudgetPressure = await routeAutomaticContextV2(
    {
      currentText: "I need your help with financial planning.",
      previousUserTexts: [],
      activeThreadTitle: "Finances",
      candidates: [
        {
          id: "career-finance",
          title: "Career and Finance Strategy",
          sourceApp: "claude",
          updatedAt: "2026-06-28T12:00:00.000Z",
          sourcePostId: "career-finance-post",
          sourceMessageId: "career-finance-message",
          snippet:
            "Long-running strategy context about runway, housing, inheritance, income, and retirement.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
          estimatedChars: 30_000,
        },
        {
          id: "house",
          title: "How much house",
          sourceApp: "claude",
          updatedAt: "2026-06-29T12:00:00.000Z",
          sourcePostId: "house-post",
          sourceMessageId: "house-message",
          snippet: "Housing affordability and property tax context.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
          estimatedChars: 15_000,
        },
        {
          id: "weak-investment",
          title: "Quantum computing investment opportunities",
          sourceApp: "claude",
          updatedAt: "2026-06-30T12:00:00.000Z",
          sourcePostId: "weak-investment-post",
          sourceMessageId: "weak-investment-message",
          snippet: "Speculative startup investment ideas.",
          lexicalScore: 1,
          sourceKind: "imported",
          priorWeight: 3,
          estimatedChars: 40_000,
        },
      ],
    },
    {
      resolveTurn: async () => ({
        originalText: "I need your help with financial planning.",
        resolvedQuery: "personal financial planning housing cash retirement",
        shouldRetrieve: true,
        confidence: 0.95,
        reason: "Blank-thread financial planning request.",
      }),
      rerankCandidates: async () => [
        {
          candidateId: "career-finance",
          action: "include",
          sourceRole: "core",
          confidence: 0.93,
          reason: "Relevant long-running finance strategy context.",
          usefulFacts: [],
          sourcePostId: null,
          sourceMessageId: null,
        },
        {
          candidateId: "house",
          action: "include",
          sourceRole: "core",
          confidence: 0.91,
          reason: "Relevant housing context.",
          usefulFacts: [],
          sourcePostId: null,
          sourceMessageId: null,
        },
        {
          candidateId: "weak-investment",
          action: "include",
          sourceRole: "watchlist",
          confidence: 0.73,
          reason: "Possibly relevant investment context.",
          usefulFacts: [],
          sourcePostId: null,
          sourceMessageId: null,
        },
      ],
    },
  );

  assert.deepEqual(
    routedWithBudgetPressure.decisions.map((decision) => decision.candidate.id),
    ["career-finance", "house"],
  );
  assert.equal(
    routedWithBudgetPressure.manifest.estimated_prompt_chars,
    45_000,
  );
  assert.ok(
    routedWithBudgetPressure.manifest.warnings.includes(
      "Context budget pressure pruned 1 selected source.",
    ),
  );
  assert.equal(
    routedWithBudgetPressure.manifest.omitted_sources.find(
      (source) => source.id === "weak-investment",
    )?.reason,
    "Selected by router but pruned because selected context exceeded the warning budget.",
  );

  let familyRerankerCalled = false;
  const routedFamilyThroughReranker = await routeAutomaticContextV2(
    {
      currentText: "I need your help with financial planning.",
      previousUserTexts: [],
      activeThreadTitle: "Finance",
      candidates: [
        {
          id: "family-finance",
          title: "Family finance card",
          sourceApp: "workos",
          updatedAt: "2026-06-30T12:00:00.000Z",
          sourcePostId: "family-post",
          sourceMessageId: "family-message",
          snippet: "Cash flow, tax planning, and retirement tradeoffs.",
          lexicalScore: 0,
          sourceKind: "family",
          priorWeight: 7,
        },
      ],
    },
    {
      resolveTurn: async () => ({
        originalText: "I need your help with financial planning.",
        resolvedQuery: "financial planning taxes cash retirement",
        shouldRetrieve: true,
        confidence: 0.95,
        reason: "Blank-thread financial planning request.",
      }),
      rerankCandidates: async (input) => {
        familyRerankerCalled = true;
        assert.deepEqual(
          input.candidates.map((candidate) => [
            candidate.id,
            candidate.sourceKind,
            candidate.priorWeight,
          ]),
          [["family-finance", "family", 7]],
        );
        return [
          {
            candidateId: "family-finance",
            action: "include",
            sourceRole: "core",
            confidence: 0.92,
            reason: "Family thread has directly related finance context.",
            usefulFacts: [],
            sourcePostId: null,
            sourceMessageId: null,
          },
        ];
      },
    },
  );

  assert.equal(familyRerankerCalled, true);
  assert.deepEqual(
    routedFamilyThroughReranker.decisions.map(
      (decision) => decision.candidate.id,
    ),
    ["family-finance"],
  );

  const routedWithUnavailableReranker = await routeAutomaticContextV2(
    {
      currentText: "find the related thing",
      previousUserTexts: [],
      activeThreadTitle: "Loose notes",
      candidates: [
        {
          id: "weak",
          title: "Weak candidate",
          sourceApp: "claude",
          updatedAt: null,
          sourcePostId: "weak-post",
          sourceMessageId: "weak-message",
          snippet: "A single related thing was mentioned.",
          lexicalScore: 1,
          sourceKind: "imported",
          priorWeight: 3,
        },
      ],
    },
    {
      resolveTurn: async () => ({
        originalText: "find the related thing",
        resolvedQuery: "related thing",
        shouldRetrieve: true,
        confidence: 0.8,
        reason: "Needs retrieval.",
      }),
      rerankCandidates: async () => {
        throw new Error("provider credits exhausted");
      },
    },
  );

  assert.deepEqual(routedWithUnavailableReranker.decisions, []);
  assert.ok(
    routedWithUnavailableReranker.manifest.warnings.includes(
      "Context reranker failed; continuing without reranked context.",
    ),
  );
}

main().catch((err: unknown) => {
  throw err;
});
