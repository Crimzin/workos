import assert from "node:assert/strict";
import {
  applyInstruction,
  applyQuestionToggle,
  conversationChipLabel,
  createInitialClusterReviewState,
  findConversationLocation,
  moveConversation,
} from "./import-cluster-review";

let state = createInitialClusterReviewState();

const burnId = "conv-burn";
const workosClusterId = "cluster-workos";
const independentClusterId = "cluster-independent";

assert.equal(
  state.questions.every((question) => question.enabled === false),
  true
);
assert.deepEqual(findConversationLocation(state, burnId), {
  type: "cluster",
  id: independentClusterId,
});
assert.equal(
  state.clusters
    .find((cluster) => cluster.id === workosClusterId)
    ?.conversationIds.includes(burnId),
  false
);

state = applyQuestionToggle(state, "q-burn-workos", true);
assert.deepEqual(findConversationLocation(state, burnId), {
  type: "cluster",
  id: workosClusterId,
});
assert.equal(
  state.clusters
    .find((cluster) => cluster.id === independentClusterId)
    ?.conversationIds.includes(burnId),
  false
);

state = applyQuestionToggle(state, "q-burn-workos", false);
assert.deepEqual(findConversationLocation(state, burnId), {
  type: "cluster",
  id: independentClusterId,
});

state = moveConversation(state, "conv-vibe-coding", {
  type: "holding",
  id: "ambiguous",
});
assert.deepEqual(findConversationLocation(state, "conv-vibe-coding"), {
  type: "holding",
  id: "ambiguous",
});
assert.equal(
  state.clusters.some((cluster) =>
    cluster.conversationIds.includes("conv-vibe-coding")
  ),
  false
);

state = applyInstruction(
  state,
  "Split Anthropic-specific job search into its own cluster."
);
assert.equal(state.lastInstructionResult?.status, "applied");
assert.equal(
  state.clusters.some((cluster) => cluster.id === "cluster-anthropic"),
  true
);
assert.deepEqual(findConversationLocation(state, "conv-anthropic-jds"), {
  type: "cluster",
  id: "cluster-anthropic",
});

const workosConversation = state.conversations.find(
  (conversation) => conversation.id === "conv-workos-investigation"
);
assert.ok(workosConversation);
assert.equal(conversationChipLabel(workosConversation), "Work OS - investigation");
