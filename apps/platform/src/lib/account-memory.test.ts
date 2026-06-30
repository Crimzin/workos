import assert from "node:assert/strict";
import {
  buildAccountMemoryKernel,
  renderAccountMemoryMarkdown,
  selectAccountMemoryForPrompt,
} from "./account-memory.ts";
import type { AccountMemoryRecord } from "./types.ts";

function memory(
  id: string,
  category: AccountMemoryRecord["category"],
  statement: string,
  overrides: Partial<AccountMemoryRecord> = {}
): AccountMemoryRecord {
  return {
    id,
    instance_id: "instance-1",
    category,
    statement,
    scope: "account",
    scope_ref_id: null,
    status: "active",
    sensitivity_label: "normal",
    conviction: 1,
    source_refs: [],
    metadata: {},
    supersedes_memory_id: null,
    superseded_by_memory_id: null,
    created_by_actor_id: "will",
    created_at: "2026-06-30T12:00:00.000Z",
    updated_at: "2026-06-30T12:00:00.000Z",
    last_confirmed_at: null,
    stale_after: null,
    retracted_at: null,
    ...overrides,
  };
}

const records = [
  memory("identity", "identity", "Will is building WorkOS."),
  memory(
    "naming",
    "work_standard",
    "Use WorkOS as the product name; BrainShare is internal."
  ),
  memory(
    "style",
    "communication_style",
    "Lead with the recommendation, then reasoning."
  ),
  memory(
    "finance",
    "sensitive_fact",
    "Financial-planning context exists and may be stale.",
    {
      sensitivity_label: "financial",
    }
  ),
  memory("old", "preference", "Use long reports.", { status: "superseded" }),
];

assert.deepEqual(
  buildAccountMemoryKernel(records).map((item) => item.id),
  ["identity", "naming", "style"]
);

assert.deepEqual(
  selectAccountMemoryForPrompt({
    records,
    resolvedQuery: "Help me with personal finance and tax planning.",
    latestUserText: "Help me with personal finance and tax planning.",
  }).included.map((item) => item.id),
  ["identity", "naming", "style", "finance"]
);

assert.deepEqual(
  selectAccountMemoryForPrompt({
    records,
    resolvedQuery: "Draft a product update.",
    latestUserText: "Actually ignore prior voice preferences for this post.",
  }).included.map((item) => item.id),
  ["identity", "naming"]
);

assert.deepEqual(
  selectAccountMemoryForPrompt({
    records,
    resolvedQuery: "Draft a product update.",
    latestUserText: "I generally ignore prior preferences when brainstorming.",
  }).included.map((item) => item.id),
  ["identity", "naming", "style"]
);

assert.deepEqual(
  selectAccountMemoryForPrompt({
    records,
    resolvedQuery: "Draft a product update.",
    latestUserText: "Draft a product update.",
  }).suppressed.map((item) => item.id),
  ["finance"]
);

const markdown = renderAccountMemoryMarkdown(records);
assert.match(markdown, /# Account Context/);
assert.match(markdown, /## About Me/);
assert.match(markdown, /## Current Work/);
assert.match(markdown, /## How I Work With AI/);
assert.match(markdown, /## Writing Voice/);
assert.match(markdown, /## Corrections/);
assert.match(markdown, /Will is building WorkOS/);
assert.match(markdown, /## Things To Handle Carefully/);
assert.match(markdown, /Financial-planning context exists/);
assert.doesNotMatch(markdown, /Use long reports/);
