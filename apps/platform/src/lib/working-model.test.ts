import assert from "node:assert/strict";
import {
  buildThreadWorkingModelView,
  buildPostTurnClaimInsert,
  workingModelClaimsForManifest,
  type WorkingModelEvidenceRow,
} from "./working-model.ts";
import type {
  ContextRetrievalOverride,
  MemoryPrimitive,
  MemoryPrimitiveEdge,
  MemoryPrimitiveType,
} from "./types.ts";

function primitive(
  id: string,
  type: MemoryPrimitiveType,
  statement: string,
  overrides: Partial<MemoryPrimitive> = {}
): MemoryPrimitive {
  return {
    id,
    instance_id: "instance-1",
    node_id: "thread-1",
    type,
    statement,
    body: null,
    status: "active",
    conviction: 0.9,
    extraction_mode: "explicit",
    conviction_posture: "assert",
    conviction_factors: [],
    conviction_version: "working-model-v1",
    valid_from: "2026-08-19T10:00:00.000Z",
    valid_to: null,
    last_confirmed_at: "2026-08-19T10:00:00.000Z",
    sensitivity_label: "normal",
    supersedes_primitive_id: null,
    superseded_by_primitive_id: null,
    external_graph_id: null,
    updated_by_actor_id: null,
    schema_version: 1,
    metadata: {},
    source_post_id: null,
    source_label: null,
    external_episode_id: null,
    created_by_actor_id: "human-1",
    created_at: "2026-08-19T10:00:00.000Z",
    updated_at: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

const primitives = [
  primitive("goal-1", "goal", "Make answer rationale inspectable."),
  primitive("decision-1", "decision", "Ship the read-only panel first."),
  primitive("idea-old", "idea", "Build a visual graph editor.", {
    status: "retracted",
  }),
  primitive("assumption-1", "assumption", "Users need compact provenance.", {
    status: "untested",
    conviction_posture: "flag",
  }),
  primitive("constraint-1", "constraint", "Do not expose hidden reasoning."),
  primitive("question-done", "question", "Should traces be mutable?", {
    status: "resolved",
  }),
  primitive("signal-1", "signal", "Source walls reduce comprehension.", {
    conviction_posture: "ask",
  }),
];

const evidence: WorkingModelEvidenceRow[] = [
  {
    id: "evidence-1",
    instance_id: "instance-1",
    memory_primitive_id: "decision-1",
    relation: "supports",
    source_kind: "post",
    source_app: "workos",
    source_node_id: "thread-source-1",
    source_post_id: "post-1",
    source_message_id: null,
    context_chunk_id: null,
    excerpt: "Ship read-only first.",
    source_span: {},
    actor_id: "human-1",
    observed_at: "2026-08-19T09:00:00.000Z",
    human_signal: "explicit_approval",
    authority_snapshot: {},
    metadata: {},
    created_at: "2026-08-19T09:00:00.000Z",
    updated_at: "2026-08-19T09:00:00.000Z",
    source_node: {
      id: "thread-source-1",
      title: "Architecture thread",
      source_app: "workos",
    },
  },
  {
    id: "evidence-2",
    instance_id: "instance-1",
    memory_primitive_id: "decision-1",
    relation: "reinforces",
    source_kind: "imported_ai_message",
    source_app: "claude",
    source_node_id: "claude-source-1",
    source_post_id: null,
    source_message_id: "message-1",
    context_chunk_id: null,
    excerpt: "The approved sequence puts read-only inspection first.",
    source_span: {},
    actor_id: null,
    observed_at: null,
    human_signal: "none",
    authority_snapshot: {},
    metadata: {},
    created_at: "2026-08-19T09:05:00.000Z",
    updated_at: "2026-08-19T09:05:00.000Z",
    source_node: {
      id: "claude-source-1",
      title: "Trace design",
      source_app: "claude",
    },
  },
];

const edges: MemoryPrimitiveEdge[] = [
  {
    id: "edge-1",
    instance_id: "instance-1",
    from_primitive_id: "decision-1",
    to_primitive_id: "goal-1",
    relationship_kind: "serves_goal",
    status: "active",
    valid_from: "2026-08-19T10:00:00.000Z",
    valid_to: null,
    derivation_metadata: {},
    created_by_actor_id: "human-1",
    updated_by_actor_id: null,
    created_at: "2026-08-19T10:00:00.000Z",
    updated_at: "2026-08-19T10:00:00.000Z",
  },
];

const overrides: ContextRetrievalOverride[] = [
  {
    id: "override-1",
    instance_id: "instance-1",
    thread_id: "thread-1",
    target_type: "memory_primitive",
    target_id: "assumption-1",
    directive: "exclude",
    user_reason: "Not relevant to this thread.",
    created_by_actor_id: "human-1",
    cleared_by_actor_id: null,
    cleared_at: null,
    created_at: "2026-08-19T11:00:00.000Z",
    updated_at: "2026-08-19T11:00:00.000Z",
  },
];

const view = buildThreadWorkingModelView({
  threadId: "thread-1",
  primitives,
  evidence,
  edges,
  overrides,
});

assert.deepEqual(
  view.groups.map((group) => group.key),
  ["aim", "decisions", "assumptions_constraints", "signals_standards"],
  "retracted/resolved claims and empty groups must not occupy the live panel"
);

const humanProposal = buildPostTurnClaimInsert({
  instanceId: "instance-1",
  threadId: "thread-1",
  triggerPostId: "user-post-1",
  responsePostId: "response-post-1",
  requesterActorId: "human-1",
  agentActorId: "agent-1",
  now: "2026-08-19T14:00:00.000Z",
  claim: {
    kind: "decision",
    statement: "Ship read-only inspection first.",
    body: null,
    origin: "human",
    human_signal: "explicit_approval",
    extraction_mode: "explicit",
    status: "active",
    posture: "assert",
  },
});
assert.equal(humanProposal.claim.source_post_id, "user-post-1");
assert.equal(humanProposal.claim.created_by_actor_id, "human-1");
assert.equal(humanProposal.evidence.human_signal, "explicit_approval");
assert.equal(humanProposal.claim.conviction_posture, "assert");
assert.equal(
  (humanProposal.claim.conviction_factors as Array<{ code: string }>)[0]?.code,
  "explicit_human_confirmation"
);

const assistantProposal = buildPostTurnClaimInsert({
  instanceId: "instance-1",
  threadId: "thread-1",
  triggerPostId: "user-post-1",
  responsePostId: "response-post-1",
  requesterActorId: "human-1",
  agentActorId: "agent-1",
  now: "2026-08-19T14:00:00.000Z",
  claim: {
    kind: "idea",
    statement: "Try a graph visualization.",
    body: null,
    origin: "assistant",
    human_signal: "none",
    extraction_mode: "synthesized",
    status: "tentative",
    posture: "ask",
  },
});
assert.equal(assistantProposal.claim.source_post_id, "response-post-1");
assert.equal(assistantProposal.claim.created_by_actor_id, "agent-1");
assert.equal(assistantProposal.evidence.human_signal, "none");
assert.equal(assistantProposal.claim.conviction_posture, "ask");
assert.deepEqual(view.groups[0].claims.map((claim) => claim.id), ["goal-1"]);
assert.equal(view.groups[1].claims[0].postureLabel, "Strong");
assert.equal(
  view.groups[1].claims[0].evidenceSummary,
  "2 evidence references across 1 WorkOS thread and 1 Claude conversation"
);
assert.equal(view.groups[1].claims[0].evidenceGroups.length, 2);
assert.deepEqual(view.groups[1].claims[0].relationships, [
  {
    id: "edge-1",
    kind: "serves_goal",
    direction: "outgoing",
    claimId: "goal-1",
    statement: "Make answer rationale inspectable.",
  },
]);

const assumption = view.groups
  .flatMap((group) => group.claims)
  .find((claim) => claim.id === "assumption-1");
assert.equal(assumption?.status, "tentative");
assert.equal(assumption?.postureLabel, "Needs a check");
assert.equal(assumption?.excludedHere?.id, "override-1");

assert.deepEqual(
  workingModelClaimsForManifest(view).map((claim) => claim.id),
  ["goal-1", "decision-1", "constraint-1", "signal-1"],
  "thread-local exclusions must not be rendered into the prompt manifest"
);
