import assert from "node:assert/strict";
import {
  buildTurnResolverPrompt,
  parseTurnResolution,
  resolveContextTurn,
} from "./turn-resolver.ts";

const prompt = buildTurnResolverPrompt({
  currentText: "try yet again",
  previousUserTexts: [
    "I need career advice. at this stage in my career, what sorts of roles should I be looking at?",
  ],
  recentThreadTexts: [
    "Claude: Are you optimizing for leadership, deeper technical expertise, better compensation, or work-life balance?",
  ],
  activeThreadTitle: "AI & Career Development",
});

assert.match(prompt.system, /Resolve the user's current turn/);
assert.match(prompt.user, /try yet again/);
assert.match(prompt.user, /career advice/);
assert.match(prompt.user, /recent_thread_texts/);
assert.match(prompt.user, /deeper technical expertise/);

assert.deepEqual(
  parseTurnResolution(
    '{"resolved_query":"career advice roles based on prior background","should_retrieve":true,"confidence":0.92,"reason":"Continuation of previous career question"}',
    "try yet again"
  ),
  {
    originalText: "try yet again",
    resolvedQuery: "career advice roles based on prior background",
    shouldRetrieve: true,
    confidence: 0.92,
    reason: "Continuation of previous career question",
  }
);

assert.deepEqual(parseTurnResolution("not json", "try again"), {
  originalText: "try again",
  resolvedQuery: "try again",
  shouldRetrieve: true,
  confidence: 0.25,
  reason: "Could not parse turn resolution.",
});

async function main() {
  const resolved = await resolveContextTurn(
    {
      currentText: "keep going",
      previousUserTexts: ["Compare Anthropic and Reflection roles."],
      recentThreadTexts: [
        "Claude: Reflection AI is frontier-adjacent and Anthropic is the target lab.",
      ],
      activeThreadTitle: "Career",
    },
    async () =>
      '{"resolved_query":"Compare Anthropic and Reflection roles.","should_retrieve":true,"confidence":0.88,"reason":"Continuation request"}'
  );

  assert.equal(
    resolved.resolvedQuery,
    "Compare Anthropic and Reflection roles."
  );
  assert.equal(resolved.shouldRetrieve, true);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
