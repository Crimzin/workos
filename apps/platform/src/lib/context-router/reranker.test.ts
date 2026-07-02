import assert from "node:assert/strict";
import {
  buildRerankerPrompt,
  parseRerankResponse,
  prepareCandidatesForReranker,
  rerankContextCandidates,
  selectIncludedContext,
} from "./reranker.ts";

const prompt = buildRerankerPrompt({
  resolvedQuery:
    "Compare Anthropic, Northslope, Tenex, and Reflection career opportunities.",
  candidates: [
    {
      id: "anthropic",
      title: "Danny @ Anthropic",
      sourceApp: "claude",
      updatedAt: null,
      sourcePostId: "p1",
      sourceMessageId: "m1",
      snippet: "Danny discussed Anthropic roles and product strategy.",
      lexicalScore: 3,
      sourceKind: "mention",
      priorWeight: 8,
    },
    {
      id: "scratch",
      title: "Scratch notes",
      sourceApp: "workos",
      updatedAt: null,
      sourcePostId: "p2",
      sourceMessageId: "m2",
      snippet: "A scratch note about an unrelated home repair.",
      lexicalScore: 1,
      sourceOrigin: "workos",
      sourceProvenance: "WorkOS thread",
    },
  ],
});

assert.match(prompt.system, /Rank WorkOS context sources/);
assert.match(prompt.user, /Danny @ Anthropic/);
assert.match(prompt.user, /Scratch notes/);
assert.doesNotMatch(prompt.user, /useful_facts/);
const promptPayload = JSON.parse(prompt.user) as {
  instruction: string;
  candidates: Array<Record<string, unknown>>;
};
assert.match(promptPayload.instruction, /"core"/);
assert.match(promptPayload.instruction, /"supporting"/);
assert.match(promptPayload.instruction, /"watchlist"/);
assert.match(promptPayload.instruction, /Core is not a ranking badge/);
assert.doesNotMatch(promptPayload.instruction, /useful_facts/);
assert.deepEqual(promptPayload.candidates[1], {
  id: "scratch",
  title: "Scratch notes",
  kind: "global",
  relation: null,
  prior: 0,
  score: 1,
  source_posts: null,
  source_chars: null,
  source_size: "small_or_unknown",
  source_app: "workos",
  origin: "workos",
  provenance: "WorkOS thread",
  snippet: "A scratch note about an unrelated home repair.",
});

const prepared = prepareCandidatesForReranker(
  Array.from({ length: 45 }, (_, index) => ({
    id: `candidate-${index}`,
    title: `Candidate ${index}`,
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: `p-${index}`,
    sourceMessageId: `m-${index}`,
    snippet: "x".repeat(1000),
    lexicalScore: 1,
  })),
);

assert.equal(prepared.length, 40);
assert.ok(prepared.every((candidate) => candidate.snippet.length <= 180));

const compactDecisions = parseRerankResponse(
  `{"include_ids":["anthropic","scratch"]}`,
);

assert.deepEqual(
  compactDecisions.map((item) => item.candidateId),
  ["anthropic", "scratch"],
);
assert.ok(compactDecisions.every((item) => item.confidence >= 0.72));
assert.ok(compactDecisions.every((item) => item.sourceRole === "supporting"));

const roleArrayDecisions = parseRerankResponse(
  `{"core":["career-finance"],"supporting":["prenup"],"watchlist":["tmobile-credit"]}`,
);

assert.deepEqual(
  roleArrayDecisions.map((item) => [
    item.candidateId,
    item.sourceRole,
    item.action,
  ]),
  [
    ["career-finance", "core", "include"],
    ["prenup", "supporting", "include"],
    ["tmobile-credit", "watchlist", "include"],
  ],
);

const decisions = parseRerankResponse(
  `{"decisions":[{"candidate_id":"anthropic","action":"include","source_role":"core","confidence":0.91,"reason":"Directly about Anthropic career process","useful_facts":["Anthropic roles were discussed"],"source_post_id":"p1","source_message_id":"m1"},{"candidate_id":"scratch","action":"exclude","source_role":"exclude","confidence":0.97,"reason":"Unrelated to career comparison","useful_facts":[],"source_post_id":"p2","source_message_id":"m2"}]}`,
);

assert.equal(decisions.length, 2);
assert.equal(decisions[0].sourceRole, "core");
assert.equal(decisions[1].sourceRole, "exclude");
assert.deepEqual(
  selectIncludedContext(decisions).map((item) => item.candidateId),
  ["anthropic"],
);

assert.equal(
  selectIncludedContext(
    Array.from({ length: 25 }, (_, index) => ({
      candidateId: `source-${index}`,
      action: "include" as const,
      confidence: 0.95 - index * 0.005,
      reason: "Useful source.",
      usefulFacts: [],
      sourcePostId: null,
      sourceMessageId: null,
    })),
  ).length,
  20,
);

assert.deepEqual(parseRerankResponse("not json"), []);

async function main() {
  const fallbackDecisions = await rerankContextCandidates(
    {
      resolvedQuery: "career comparison",
      candidates: [
        {
          id: "tenex",
          title: "Tenex",
          sourceApp: "claude",
          updatedAt: null,
          sourcePostId: "p3",
          sourceMessageId: "m3",
          snippet: "Tenex opportunity notes.",
          lexicalScore: 2,
        },
      ],
    },
    async () => "```json\nnot json\n```",
  );

  assert.deepEqual(fallbackDecisions, []);
}

main().catch((err: unknown) => {
  throw err;
});
