// Focused assertions for the platform TypeScript harness. These files are
// typechecked with `npx tsc --noEmit --project apps/platform/tsconfig.json`.
import assert from "node:assert/strict";
import { renderCodingAgentPlan } from "./planning";
import type { NodeContext } from "./node-context";
import type { AgentPlanningInput } from "./types";
import type { PostRecord } from "../posts";

function body(text: string): string {
  return JSON.stringify([
    {
      type: "paragraph",
      content: [{ type: "text", text, styles: {} }],
    },
  ]);
}

function targetPost(text: string): PostRecord {
  return {
    id: "target-post",
    node_id: "active-card",
    actor_id: "will",
    post_type: "post",
    body: body(text),
    metadata: null,
    pinned: false,
    pinned_at: null,
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
    actor: { id: "will", name: "Will", kind: "human" },
  };
}

const nodeContext: NodeContext = {
  node: {
    id: "active-card",
    type: "card",
    title: "Agent Runtime V0",
    description: null,
  },
  workspaceTitle: "WorkOS",
  breadcrumb: "WorkOS / Agent Runtime V0",
  owner: null,
  members: [],
  fields: [],
  memory: { rationale: null, assumptions: [], decisions: [] },
  ownThread: [],
  parentThread: null,
  siblingThreads: [],
  childThreads: [],
  links: [],
};

function input(overrides: Partial<AgentPlanningInput>): AgentPlanningInput {
  return {
    agentName: "Codex",
    providerKey: "codex",
    nodeContext,
    targetPost: targetPost("@Codex implement Task 3"),
    aidexStatus: "available",
    ...overrides,
  };
}

const availablePlan = renderCodingAgentPlan(input({ aidexStatus: "available" }));

assert.equal(availablePlan.status, "awaiting_confirmation");
assert.match(availablePlan.planBody, /wait for your "go"/);
assert.match(availablePlan.planBody, /AiDex/);
assert.equal(availablePlan.metadata.aidex_status, "available");

const missingPlan = renderCodingAgentPlan(input({ aidexStatus: "missing" }));

assert.match(missingPlan.planBody, /strongly recommended/);
assert.match(missingPlan.planBody, /install and configure/);
assert.equal(missingPlan.metadata.aidex_status, "missing");

const stalePlan = renderCodingAgentPlan(input({ aidexStatus: "stale" }));

assert.match(stalePlan.planBody, /index looks stale/);
assert.match(stalePlan.planBody, /refreshed before coding-agent work/);
assert.equal(stalePlan.metadata.aidex_status, "stale");

const disabledPlan = renderCodingAgentPlan(input({ aidexStatus: "disabled" }));

assert.match(disabledPlan.planBody, /AiDex is disabled/);
assert.match(disabledPlan.planBody, /enable it for this repo/);
assert.equal(disabledPlan.metadata.aidex_status, "disabled");
