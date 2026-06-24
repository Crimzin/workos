import assert from "node:assert/strict";
import { chooseGlobalBoardRoot } from "./global-board.ts";
import type { WorkNode } from "./types";

const now = "2026-06-24T10:00:00.000Z";

const baseNode = {
  id: "base",
  instance_id: "instance-1",
  parent_id: null,
  type: "workspace" as const,
  title: "Base",
  description: null,
  owner_id: null,
  position: 0,
  stack_lifecycle_status: "prioritized" as const,
  thread_resolution_status: "active" as const,
  resolved_at: null,
  resolved_by_actor_id: null,
  resolution_summary: null,
  resolution_source_post_id: null,
  source_kind: null,
  source_app: null,
  source_import_session_id: null,
  source_conversation_id: null,
  source_title: null,
  source_hash: null,
  source_created_at: null,
  source_updated_at: null,
  imported_visibility: "visible" as const,
  suggestion_status: "allowed" as const,
  archived_at: null,
  created_at: now,
  updated_at: now,
} satisfies WorkNode;

const roots: WorkNode[] = [
  {
    ...baseNode,
    id: "imported",
    title: "Imported Claude chat",
    source_kind: "imported_ai_chat",
    source_app: "claude",
  },
  {
    ...baseNode,
    id: "native",
    title: "Native workspace",
  },
];

assert.equal(chooseGlobalBoardRoot(roots)?.id, "native");
assert.equal(chooseGlobalBoardRoot([roots[0]])?.id, undefined);
