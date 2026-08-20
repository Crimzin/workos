import assert from "node:assert/strict";
import {
  buildAnswerReasonTraceSnapshot,
  buildAnswerAnchors,
  hasResponseChangedSinceTrace,
  hashTraceContent,
  summarizeEvidenceProvenance,
  type ReasonTraceClaimSnapshot,
  type ReasonTraceEvidence,
} from "./reason-traces.ts";

const claims: ReasonTraceClaimSnapshot[] = [
  {
    id: "claim-1",
    kind: "decision",
    statement: "Ship the read-only Working Model before correction writes.",
    body: null,
    status: "active",
    posture: "assert",
    cached_score: 0.91,
    factors: [
      {
        code: "explicit_human_confirmation",
        direction: "supports",
        explanation: "Explicitly approved by the user.",
        evidence_refs: ["evidence-1"],
      },
    ],
    evidence_refs: ["evidence-1"],
    superseded_by_primitive_id: null,
    updated_at: "2026-08-19T10:00:00.000Z",
  },
];

const answer =
  "We should ship the read-only Working Model first. Correction writes can follow once the trace contract is stable.";
const anchors = buildAnswerAnchors(answer, claims);
assert.equal(anchors.length, 2);
assert.deepEqual(anchors[0].belief_refs, ["claim-1"]);
assert.equal(anchors[0].mapping_kind, "deterministic_fallback");

const evidence: ReasonTraceEvidence[] = [
  {
    id: "evidence-1",
    relation: "supports",
    source_app: "workos",
    source_kind: "post",
    source_node_id: "thread-1",
    source_post_id: "post-1",
    source_message_id: null,
    source_label: "Architecture thread",
    excerpt: "x".repeat(500),
    observed_at: "2026-08-19T09:00:00.000Z",
    actor_id: "human-1",
    human_signal: "explicit_approval",
    accessible: true,
  },
  ...[2, 3].map(
    (index): ReasonTraceEvidence => ({
      id: `evidence-${index}`,
      relation: "supports",
      source_app: "workos",
      source_kind: "post",
      source_node_id: `thread-${index}`,
      source_post_id: `post-${index}`,
      source_message_id: null,
      source_label: `Thread ${index}`,
      excerpt: "Useful context",
      observed_at: null,
      actor_id: null,
      human_signal: "none",
      accessible: true,
    })
  ),
  ...[4, 5, 6, 7].map(
    (index): ReasonTraceEvidence => ({
      id: `evidence-${index}`,
      relation: "supports",
      source_app: "claude",
      source_kind: "imported_ai_message",
      source_node_id: index < 6 ? "claude-conversation-1" : "claude-conversation-2",
      source_post_id: null,
      source_message_id: `message-${index}`,
      source_label: "Imported Claude conversation",
      excerpt: index === 7 ? "Must not leak" : "Useful imported context",
      observed_at: null,
      actor_id: null,
      human_signal: "none",
      accessible: index !== 7,
    })
  ),
];

assert.equal(
  summarizeEvidenceProvenance(evidence),
  "7 evidence references across 3 WorkOS threads and 2 Claude conversations"
);

const built = buildAnswerReasonTraceSnapshot({
  generatedAt: "2026-08-19T14:00:00.000Z",
  responsePostId: "response-1",
  threadId: "thread-1",
  responseBody: answer,
  triggerPostId: "trigger-1",
  request: {
    resolved_query: "What should ship first?",
    task_type: "planning",
    turn_resolution: {
      should_retrieve: true,
      confidence: 0.91,
      reason: "The request depends on prior decisions.",
    },
  },
  threadSheet: {
    id: "sheet-1",
    updated_at: "2026-08-19T13:59:00.000Z",
    markdown: "# Current context\n\nShip read-only first.",
  },
  claims,
  retrieval: {
    budget_chars: 18_000,
    estimated_prompt_chars: 12_400,
    included: [],
    omitted: [],
    overrides_applied: [],
    warnings: [],
  },
  evidence,
  runtime: {
    agent_run_id: "run-1",
    provider_key: "inline_claude",
    model_key: "claude-sonnet-4-5",
    request_id: "request-1",
    router_version: "context-router-v2",
    extractor_version: "thread-context-v1",
  },
  associationStatus: "failed",
  warnings: ["Structured answer association was unavailable."],
});

assert.equal(built.status, "partial");
assert.equal(built.snapshot.schema_version, 1);
assert.equal(built.snapshot.subject.content_hash, hashTraceContent(answer));
assert.equal(built.snapshot.working_model.thread_sheet_hash, hashTraceContent("# Current context\n\nShip read-only first."));
assert.equal(built.snapshot.evidence[0].excerpt?.length, 280);
assert.equal(built.snapshot.evidence.at(-1)?.excerpt, null);
assert.ok(built.snapshot.warnings.includes("Structured answer association was unavailable."));
assert.equal(hasResponseChangedSinceTrace(answer, built.snapshot), false);
assert.equal(hasResponseChangedSinceTrace(`${answer} Edited.`, built.snapshot), true);
