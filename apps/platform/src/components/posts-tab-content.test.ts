import assert from "node:assert/strict";
import { orderPostsForThread } from "../lib/post-order";
import type { PostRecord } from "../lib/posts";
import {
  buildOptimisticUserPost,
  DEFAULT_INLINE_CLAUDE_STAGE,
  getInlineClaudeIndicatorRows,
  InlineClaudeActiveRun,
  isLocalInlineClaudeResponder,
  LocalThinkingClaude,
} from "./posts-tab-content-helpers.ts";

function post(id: string, createdAt: string): PostRecord {
  return {
    id,
    node_id: "node-1",
    actor_id: "actor-1",
    post_type: "post",
    body: null,
    metadata: null,
    pinned: false,
    pinned_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    actor: { id: "actor-1", name: "Will", kind: "human" },
    reactions: [],
  };
}

function agentPost(id: string, actorId: string, createdAt: string): PostRecord {
  return {
    ...post(id, createdAt),
    actor_id: actorId,
    actor: { id: actorId, name: "Claude", kind: "agent" },
  };
}

const newestFirst = [
  post("newest", "2026-05-18T15:00:00.000Z"),
  post("middle", "2026-05-18T14:00:00.000Z"),
  post("oldest", "2026-05-18T13:00:00.000Z"),
];

assert.deepEqual(orderPostsForThread(newestFirst).map((p) => p.id), [
  "oldest",
  "middle",
  "newest",
]);

assert.deepEqual(newestFirst.map((p) => p.id), ["newest", "middle", "oldest"]);

assert.equal(isLocalInlineClaudeResponder("Claude"), true);
assert.equal(isLocalInlineClaudeResponder("WorkOS"), true);
assert.equal(isLocalInlineClaudeResponder("Claude Code"), false);
assert.equal(isLocalInlineClaudeResponder("Codex"), false);

assert.deepEqual(
  buildOptimisticUserPost({
    id: "optimistic-1",
    nodeId: "node-1",
    actorId: "will-1",
    actorName: "Will",
    body: "body-json",
    now: new Date("2026-07-02T12:00:00.000Z"),
  }),
  {
    id: "optimistic-1",
    node_id: "node-1",
    actor_id: "will-1",
    post_type: "post",
    body: "body-json",
    metadata: null,
    pinned: false,
    pinned_at: null,
    created_at: "2026-07-02T12:00:00.000Z",
    updated_at: "2026-07-02T12:00:00.000Z",
    actor: { id: "will-1", name: "Will", kind: "human" },
    reactions: [],
  }
);

const activeRuns: InlineClaudeActiveRun[] = [
  {
    id: "run-1",
    agent_actor_id: "claude-1",
    current_stage: "Waiting for Claude...",
    updated_at: "2026-06-30T12:00:00.000Z",
  },
];
const localThinking: LocalThinkingClaude[] = [
  {
    id: "claude-1",
    name: "Claude",
    knownPostIds: new Set(["post-1"]),
  },
];

assert.deepEqual(
  getInlineClaudeIndicatorRows({
    activeRuns,
    localThinking,
    posts: [post("post-1", "2026-06-30T11:59:00.000Z")],
  }),
  [
    {
      id: "run-1",
      name: "Claude",
      stage: "Waiting for Claude...",
    },
  ]
);

assert.deepEqual(
  getInlineClaudeIndicatorRows({
    activeRuns: [
      {
        id: "run-2",
        agent_actor_id: "claude-2",
        current_stage: null,
        updated_at: "2026-06-30T12:00:00.000Z",
      },
    ],
    localThinking: [],
    posts: [],
  }),
  [
    {
      id: "run-2",
      name: "Claude",
      stage: DEFAULT_INLINE_CLAUDE_STAGE,
    },
  ]
);

assert.deepEqual(
  getInlineClaudeIndicatorRows({
    activeRuns: [],
    localThinking,
    posts: [post("post-1", "2026-06-30T11:59:00.000Z")],
  }),
  [
    {
      id: "local-claude-1",
      name: "Claude",
      stage: DEFAULT_INLINE_CLAUDE_STAGE,
    },
  ]
);

assert.deepEqual(
  getInlineClaudeIndicatorRows({
    activeRuns: [
      {
        id: "run-3",
        agent_actor_id: "claude-1",
        current_stage: "Writing the reply...",
        updated_at: "2026-06-30T12:00:10.000Z",
      },
    ],
    localThinking,
    posts: [post("post-1", "2026-06-30T11:59:00.000Z")],
  }),
  [
    {
      id: "run-3",
      name: "Claude",
      stage: "Writing the reply...",
    },
  ]
);

assert.deepEqual(
  getInlineClaudeIndicatorRows({
    activeRuns: [],
    localThinking,
    posts: [
      post("post-1", "2026-06-30T11:59:00.000Z"),
      agentPost("reply-1", "claude-1", "2026-06-30T12:00:10.000Z"),
    ],
  }),
  []
);
