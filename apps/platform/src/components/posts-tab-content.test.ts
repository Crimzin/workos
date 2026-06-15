import assert from "node:assert/strict";
import { orderPostsForThread } from "../lib/post-order";
import type { PostRecord } from "../lib/posts";

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
