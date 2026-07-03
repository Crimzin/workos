import assert from "node:assert/strict";
import {
  buildCandidateSnippet,
  makeContextRouterCandidate,
  rankCandidateSnippets,
} from "./candidates.ts";

const careerSnippet = buildCandidateSnippet({
  query: "career Anthropic role product growth",
  text:
    "We discussed Will's product growth background at Vega Factor and why Anthropic roles should be evaluated against frontier AI product leverage.",
  maxChars: 140,
});

assert.match(careerSnippet.snippet, /product growth/);
assert.ok(careerSnippet.lexicalScore > 0);

const ranked = rankCandidateSnippets("career Anthropic role", [
  {
    id: "cat",
    title: "Cat scratch",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "p1",
    sourceMessageId: "m1",
    snippet: "A cat scratched my girlfriend.",
    lexicalScore: 0,
  },
  {
    id: "anthropic",
    title: "Danny @ Anthropic",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "p2",
    sourceMessageId: "m2",
    snippet: "Danny discussed Anthropic roles and product strategy.",
    lexicalScore: 3,
  },
]);

assert.deepEqual(ranked.map((item) => item.id), ["anthropic"]);

const financeRanked = rankCandidateSnippets("finance", [
  {
    id: "finances",
    title: "Personal finances and taxes",
    sourceApp: "claude",
    updatedAt: "2026-06-29T12:00:00.000Z",
    sourcePostId: "p-fin",
    sourceMessageId: "m-fin",
    snippet: "Retirement, taxes, budget, and cash flow.",
    lexicalScore: 0,
  },
]);

assert.deepEqual(financeRanked.map((item) => item.id), ["finances"]);

const taxonomyRanked = rankCandidateSnippets("finance", [
  {
    id: "taxonomy",
    title: "Taxonomy refactor",
    sourceApp: "claude",
    updatedAt: "2026-06-29T12:00:00.000Z",
    sourcePostId: "p-taxonomy",
    sourceMessageId: "m-taxonomy",
    snippet: "Taxonomy refactor notes for imported source labels.",
    lexicalScore: 0,
  },
]);

assert.deepEqual(taxonomyRanked.map((item) => item.id), []);

const recencyRanked = rankCandidateSnippets("career role", [
  {
    id: "missing-date",
    title: "Older unknown date",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "p3",
    sourceMessageId: "m3",
    snippet: "Career role discussion.",
    lexicalScore: 2,
  },
  {
    id: "newer",
    title: "Newer dated",
    sourceApp: "claude",
    updatedAt: "2026-06-29T12:00:00.000Z",
    sourcePostId: "p4",
    sourceMessageId: "m4",
    snippet: "Career role discussion.",
    lexicalScore: 2,
  },
]);

assert.deepEqual(recencyRanked.map((item) => item.id), [
  "newer",
  "missing-date",
]);

const candidate = makeContextRouterCandidate({
  id: "source-node",
  title: "Source post",
  sourceApp: "chatgpt",
  updatedAt: "2026-06-29T12:00:00.000Z",
  sourcePostId: "post-1",
  sourceMessageId: "message-1",
  text: "A long imported post about Anthropic interview loops and career positioning.",
  query: "Anthropic career",
});

assert.equal(candidate.id, "source-node");
assert.equal(candidate.sourceApp, "chatgpt");
assert.equal(candidate.sourcePostId, "post-1");
assert.match(candidate.snippet, /Anthropic interview/);
assert.ok(candidate.lexicalScore > 0);
