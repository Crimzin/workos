import assert from "node:assert/strict";
import { buildSidebarTree, getProjectSidebarTree } from "./sidebar-tree";
import type { WorkNode } from "./types";

function node(
  id: string,
  parentId: string | null,
  type: WorkNode["type"],
  position: number,
  sourceKind: WorkNode["source_kind"] = null,
  sourceApp: WorkNode["source_app"] = null
): WorkNode {
  return {
    id,
    instance_id: "instance",
    parent_id: parentId,
    type,
    title: id,
    description: null,
    owner_id: null,
    position,
    stack_lifecycle_status: "prioritized",
    thread_resolution_status: "active",
    resolved_at: null,
    resolved_by_actor_id: null,
    resolution_summary: null,
    resolution_source_post_id: null,
    source_kind: sourceKind,
    source_app: sourceApp,
    source_import_session_id: null,
    source_conversation_id: null,
    source_title: null,
    source_hash: null,
    source_created_at: null,
    source_updated_at: null,
    imported_visibility: "visible",
    suggestion_status: "allowed",
    archived_at: null,
    created_at: "2026-05-21T00:00:00.000Z",
    updated_at: "2026-05-21T00:00:00.000Z",
  };
}

const tree = buildSidebarTree([
  node("card", "stack", "card", 0),
  node("project", null, "workspace", 0),
  node("stack", "project", "stack", 0),
]);

assert.equal(tree[0].id, "project");
assert.equal(tree[0].depth, 0);
assert.equal(tree[0].rootId, "project");
assert.equal(tree[0].children[0].id, "stack");
assert.equal(tree[0].children[0].depth, 1);
assert.equal(tree[0].children[0].rootId, "project");
assert.equal(tree[0].children[0].children[0].id, "card");
assert.equal(tree[0].children[0].children[0].depth, 2);
assert.equal(tree[0].children[0].children[0].rootId, "project");

const importedTree = buildSidebarTree([
  node("project", null, "workspace", 0),
  node("imported-chat", null, "stack", 1, "imported_ai_chat", "claude"),
]);

assert.deepEqual(
  importedTree.map((treeNode) => treeNode.id),
  ["project", "imported-chat"]
);
assert.deepEqual(
  getProjectSidebarTree(importedTree).map((treeNode) => treeNode.id),
  ["project"]
);
