import assert from "node:assert/strict";
import {
  contextPackFromMetadata,
  selectAttachedContextPosts,
} from "./node-context.ts";
import type { PostRecord } from "../posts";

function post(id: string): PostRecord {
  return {
    id,
    node_id: "source-thread",
    actor_id: null,
    post_type: "post",
    body: id,
    metadata: null,
    pinned: false,
    pinned_at: null,
    created_at: "2026-06-26T12:00:00.000Z",
    updated_at: "2026-06-26T12:00:00.000Z",
    actor: null,
    reactions: [],
  };
}

const newestFirstPosts = [
  post("newest"),
  post("newer"),
  post("match"),
  post("older"),
  post("oldest"),
];

assert.deepEqual(
  selectAttachedContextPosts(newestFirstPosts, "match", 3).map((item) => item.id),
  ["newer", "match", "older"]
);

assert.deepEqual(
  selectAttachedContextPosts(newestFirstPosts, null, 3).map((item) => item.id),
  ["newest", "newer", "match"]
);

assert.deepEqual(
  selectAttachedContextPosts(newestFirstPosts, "missing", 3).map((item) => item.id),
  ["newest", "newer", "match"]
);

assert.deepEqual(
  contextPackFromMetadata({
    context_pack: {
      router_version: "context-router-v1",
      resolved_query: "financial planning",
      source_role: "core",
      relevance_confidence: 0.94,
      reason: "Direct finance context.",
      useful_facts: ["Runway and inheritance are central planning facts."],
      snippet: "Financial planning context.",
      source_origin: "imported",
      source_app: "claude",
      source_provenance: "Claude import",
    },
  }),
  {
    router_version: "context-router-v1",
    resolved_query: "financial planning",
    source_role: "core",
    relevance_confidence: 0.94,
    reason: "Direct finance context.",
    useful_facts: ["Runway and inheritance are central planning facts."],
    snippet: "Financial planning context.",
    source_origin: "imported",
    source_app: "claude",
    source_provenance: "Claude import",
  }
);
