import assert from "node:assert/strict";
import { toImportedChatRows } from "./imported-chats.ts";
import type { WorkNode } from "./types";

const now = "2026-06-24T00:00:00.000Z";

function node(id: string, sourceApp: unknown): WorkNode {
  return {
    id,
    instance_id: "instance",
    parent_id: null,
    type: "stack",
    title: id,
    description: null,
    owner_id: null,
    position: 0,
    stack_lifecycle_status: "prioritized",
    thread_resolution_status: "active",
    resolved_at: null,
    resolved_by_actor_id: null,
    resolution_summary: null,
    resolution_source_post_id: null,
    source_kind: "imported_ai_chat",
    source_app: sourceApp as WorkNode["source_app"],
    source_import_session_id: null,
    source_conversation_id: id,
    source_title: id,
    source_hash: null,
    source_created_at: null,
    source_updated_at: null,
    imported_visibility: "visible",
    suggestion_status: "allowed",
    archived_at: null,
    created_at: now,
    updated_at: now,
  };
}

assert.deepEqual(
  toImportedChatRows([
    node("claude", "claude"),
    node("chatgpt", "chatgpt"),
    node("unknown", "unknown"),
    node("null-source", null),
    node("workos-source", "workos"),
    node("unsupported-source", "bard"),
  ]).map((row) => row.id),
  ["claude", "chatgpt", "unknown"]
);
