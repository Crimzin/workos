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
  "Relevant (91%): Directly relevant to Anthropic process."
);
assert.deepEqual(packs[0].pack, {
  router_version: "context-router-v1",
  resolved_query: "career advice Anthropic roles",
  inclusion_reason: "Directly relevant to Anthropic process.",
  useful_facts: ["Anthropic product roles were discussed."],
  relevance_confidence: 0.91,
  source_message_id: "decision-message",
  reason: "Directly relevant to Anthropic process.",
  snippet: "Danny discussed Anthropic product roles.",
});

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
          ["newer", "missing-date"]
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
    }
  );

  assert.equal(routed.length, 1);
  assert.equal(routed[0].candidate.id, "newer");
  assert.equal(routed[0].sourcePostId, "new-post");
  assert.equal(routed[0].sourceMessageId, "reranked-message");
  assert.equal(
    routed[0].pack.resolved_query,
    "Anthropic career role comparison"
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
          snippet: "Inheritance cash flows, housing, asset allocation, and financial strategy.",
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
          "optimize existing financial setup including inheritance, housing, cash flow, and asset allocation"
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
    }
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
    }
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
    }
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
          ["finances"]
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
    }
  );

  assert.equal(routedV2.decisions.length, 1);
  assert.equal(routedV2.manifest.router_version, "context-router-v2");
  assert.equal(
    routedV2.manifest.resolved_query,
    "financial planning taxes budget retirement"
  );
  assert.equal(routedV2.manifest.included_sources[0].id, "finances");
}

main().catch((err: unknown) => {
  throw err;
});
