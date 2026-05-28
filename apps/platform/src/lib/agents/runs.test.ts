import assert from "node:assert/strict";
import {
  buildAgentRunInsert,
  selectConfirmableRunId,
  type CreateAgentRunInput,
} from "./runs.ts";

const input: CreateAgentRunInput = {
  instanceId: "instance-1",
  workspaceId: "workspace-1",
  targetNodeId: "node-1",
  triggerPostId: "post-1",
  requesterActorId: "human-1",
  agentActorId: "agent-1",
  providerKey: "codex",
  planBody: "1. Inspect\n2. Implement\n3. Verify",
  metadata: { aidex_status: "available", task: "Task 4" },
};

assert.deepEqual(buildAgentRunInsert(input), {
  instance_id: "instance-1",
  workspace_id: "workspace-1",
  target_node_id: "node-1",
  trigger_post_id: "post-1",
  requester_actor_id: "human-1",
  agent_actor_id: "agent-1",
  provider_key: "codex",
  status: "awaiting_confirmation",
  plan_body: "1. Inspect\n2. Implement\n3. Verify",
  metadata: { aidex_status: "available", task: "Task 4" },
});

assert.equal(buildAgentRunInsert(input).status, "awaiting_confirmation");
assert.equal(buildAgentRunInsert(input).provider_key, "codex");
assert.deepEqual(buildAgentRunInsert(input).metadata, {
  aidex_status: "available",
  task: "Task 4",
});

assert.equal(selectConfirmableRunId([]), null);
assert.equal(selectConfirmableRunId([{ id: "run-1", agent_actor_id: "agent-1" }]), "run-1");
assert.equal(
  selectConfirmableRunId([
    { id: "run-1", agent_actor_id: "agent-1" },
    { id: "run-2", agent_actor_id: "agent-2" },
  ]),
  null
);
assert.equal(
  selectConfirmableRunId([
    { id: "newer", agent_actor_id: "agent-1" },
    { id: "older", agent_actor_id: "agent-1" },
  ]),
  "newer"
);
assert.equal(
  selectConfirmableRunId(
    [
      { id: "codex-newer", agent_actor_id: "codex" },
      { id: "claude-newer", agent_actor_id: "claude" },
    ],
    ["codex"]
  ),
  "codex-newer"
);

assert.equal(
  selectConfirmableRunId(
    [
      {
        id: "stale-codex",
        agent_actor_id: "codex",
        created_at: "2026-05-21T16:49:55.000Z",
      },
    ],
    ["codex"],
    new Date("2026-05-28T22:12:30.000Z")
  ),
  null
);

assert.equal(
  selectConfirmableRunId(
    [
      {
        id: "fresh-codex",
        agent_actor_id: "codex",
        created_at: "2026-05-28T22:10:00.000Z",
      },
      {
        id: "stale-codex",
        agent_actor_id: "codex",
        created_at: "2026-05-21T16:49:55.000Z",
      },
    ],
    ["codex"],
    new Date("2026-05-28T22:12:30.000Z")
  ),
  "fresh-codex"
);
