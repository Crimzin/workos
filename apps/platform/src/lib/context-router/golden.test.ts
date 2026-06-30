import assert from "node:assert/strict";
import { routeAutomaticContextV2 } from "./router.ts";

async function testFinanceBlankThreadRetrieval() {
  const routed = await routeAutomaticContextV2(
    {
      currentText: "Help me think through my financial planning situation.",
      previousUserTexts: [],
      recentThreadTexts: [],
      activeThreadTitle: "New thread",
      candidates: [
        {
          id: "personal-finances",
          title: "Personal finances and taxes",
          sourceApp: "claude",
          updatedAt: "2026-06-15T12:00:00.000Z",
          sourcePostId: "finance-post",
          sourceMessageId: "finance-message",
          snippet:
            "Personal financial planning notes covering taxes, income, cash flow, housing, retirement, and long-term budgeting.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
        {
          id: "vacation-planning",
          title: "Vacation planning itinerary",
          sourceApp: "claude",
          updatedAt: "2026-06-20T12:00:00.000Z",
          sourcePostId: "vacation-post",
          sourceMessageId: "vacation-message",
          snippet:
            "Vacation planning ideas for hotels, restaurants, beach days, museum tickets, and a rough travel budget.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
        },
      ],
    },
    {
      resolveTurn: async (input) => {
        assert.equal(
          input.currentText,
          "Help me think through my financial planning situation."
        );
        return {
          originalText: input.currentText,
          resolvedQuery:
            "personal financial planning taxes income cash flow retirement",
          shouldRetrieve: true,
          confidence: 0.95,
          reason: "Blank-thread request needs durable finance context.",
        };
      },
      rerankCandidates: async (input) => {
        assert.deepEqual(
          input.candidates.map((candidate) => candidate.id),
          ["personal-finances", "vacation-planning"]
        );

        return [
          {
            candidateId: "personal-finances",
            action: "include",
            confidence: 0.94,
            reason: "Directly about the user's financial planning situation.",
            usefulFacts: [
              "Prior finance context includes taxes, cash flow, housing, retirement, and budgeting.",
            ],
            sourcePostId: null,
            sourceMessageId: null,
          },
          {
            candidateId: "vacation-planning",
            action: "exclude",
            confidence: 0.96,
            reason: "Travel planning is unrelated to financial planning.",
            usefulFacts: [],
            sourcePostId: null,
            sourceMessageId: null,
          },
        ];
      },
    }
  );

  assert.deepEqual(
    routed.decisions.map((decision) => decision.candidate.id),
    ["personal-finances"]
  );
  assert.equal(routed.manifest.included_sources.length, 1);
  assert.equal(routed.manifest.included_sources[0].id, "personal-finances");
  assert.deepEqual(
    routed.manifest.omitted_sources.map((source) => source.id),
    ["vacation-planning"]
  );
}

async function testLuluOldScriptRevivalRetrieval() {
  const routed = await routeAutomaticContextV2(
    {
      currentText:
        "I was working a script about 3 months ago to do ABC. I need a new version that does XYZ.",
      previousUserTexts: [],
      recentThreadTexts: [],
      activeThreadTitle: "New thread",
      candidates: [
        {
          id: "campaign-export-python-program",
          title: "Campaign export Python program",
          sourceApp: "claude",
          updatedAt: "2026-03-28T12:00:00.000Z",
          sourcePostId: "lulu-post",
          sourceMessageId: "lulu-message",
          snippet:
            "Discussion context for a Python script that exported campaign data to do ABC for Lulu. The conversation captured requirements and approach, but the source file may still be needed before producing a new version.",
          lexicalScore: 0,
          sourceKind: "imported",
          priorWeight: 3,
          freshnessHint: "about 3 months old",
          previewFacts: [
            "Only discussion context is available.",
            "The source file may still be needed.",
          ],
        },
      ],
    },
    {
      resolveTurn: async (input) => ({
        originalText: input.currentText,
        resolvedQuery:
          "old Python script campaign export ABC new version XYZ source file",
        shouldRetrieve: true,
        confidence: 0.93,
        reason: "The user is trying to revive an older script project.",
      }),
      rerankCandidates: async (input) => {
        assert.deepEqual(
          input.candidates.map((candidate) => candidate.id),
          ["campaign-export-python-program"]
        );

        return [
          {
            candidateId: "campaign-export-python-program",
            action: "include",
            confidence: 0.92,
            reason:
              "The candidate describes the older campaign export script the user wants to revive.",
            usefulFacts: [
              "Only discussion context is available; the source file may still be needed before writing the new XYZ version.",
            ],
            sourcePostId: null,
            sourceMessageId: null,
          },
        ];
      },
    }
  );

  assert.deepEqual(
    routed.decisions.map((decision) => decision.candidate.id),
    ["campaign-export-python-program"]
  );
  assert.equal(
    routed.decisions[0].pack.useful_facts[0],
    "Only discussion context is available; the source file may still be needed before writing the new XYZ version."
  );
  assert.equal(
    routed.manifest.included_sources[0].id,
    "campaign-export-python-program"
  );
}

async function main() {
  await testFinanceBlankThreadRetrieval();
  await testLuluOldScriptRevivalRetrieval();
}

main().catch((err: unknown) => {
  throw err;
});
