import assert from "node:assert/strict";
import {
  buildRerankerPrompt,
  parseRerankResponse,
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
    },
    {
      id: "scratch",
      title: "Scratch notes",
      sourceApp: "claude",
      updatedAt: null,
      sourcePostId: "p2",
      sourceMessageId: "m2",
      snippet: "A scratch note about an unrelated home repair.",
      lexicalScore: 1,
    },
  ],
});

assert.match(prompt.system, /rerank WorkOS context candidates/);
assert.match(prompt.user, /Danny @ Anthropic/);
assert.match(prompt.user, /Scratch notes/);

const decisions = parseRerankResponse(
  `{"decisions":[{"candidate_id":"anthropic","action":"include","confidence":0.91,"reason":"Directly about Anthropic career process","useful_facts":["Anthropic roles were discussed"],"source_post_id":"p1","source_message_id":"m1"},{"candidate_id":"scratch","action":"exclude","confidence":0.97,"reason":"Unrelated to career comparison","useful_facts":[],"source_post_id":"p2","source_message_id":"m2"}]}`
);

assert.equal(decisions.length, 2);
assert.deepEqual(
  selectIncludedContext(decisions).map((item) => item.candidateId),
  ["anthropic"]
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
    async () => "```json\nnot json\n```"
  );

  assert.deepEqual(fallbackDecisions, []);
}

main().catch((err: unknown) => {
  throw err;
});
