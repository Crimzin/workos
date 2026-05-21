import assert from "node:assert/strict";
import {
  flattenSidebarTree,
  getPinnedNodes,
  getSidebarDropPlan,
  getSidebarPointerDropPlan,
  moveSidebarTreeNode,
  nextSidebarPosition,
} from "./sidebar-tree-dnd";
import { buildSidebarTree } from "./sidebar-tree";
import type { WorkNode } from "./types";

function node(
  id: string,
  parentId: string | null,
  position: number
): WorkNode {
  return {
    id,
    instance_id: "instance",
    parent_id: parentId,
    type: parentId ? "card" : "workspace",
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
    archived_at: null,
    created_at: "2026-05-21T00:00:00.000Z",
    updated_at: "2026-05-21T00:00:00.000Z",
  };
}

const tree = buildSidebarTree([
  node("project-a", null, 0),
  node("scope", "project-a", 0),
  node("pricing", "scope", 0),
  node("project-b", null, 1),
  node("ops", "project-b", 0),
]);

const expanded = new Set(["project-a", "scope", "project-b"]);

assert.deepEqual(
  flattenSidebarTree(tree, expanded).map((row) => row.id),
  ["project-a", "scope", "pricing", "project-b", "ops"]
);

assert.equal(
  getSidebarDropPlan({
    activeId: "project-a",
    overId: "pricing",
    flattened: flattenSidebarTree(tree, expanded),
    indentationDelta: 1,
  }),
  null
);

assert.deepEqual(
  getSidebarDropPlan({
    activeId: "pricing",
    overId: "ops",
    flattened: flattenSidebarTree(tree, expanded),
    indentationDelta: 0,
  }),
  { parentId: "project-b", previousId: "ops", nextId: null }
);

assert.deepEqual(
  getSidebarDropPlan({
    activeId: "pricing",
    overId: "project-b",
    flattened: flattenSidebarTree(tree, expanded),
    indentationDelta: -2,
  }),
  { parentId: null, previousId: "project-a", nextId: "project-b" }
);

assert.deepEqual(
  getSidebarPointerDropPlan({
    activeId: "pricing",
    overId: "ops",
    flattened: flattenSidebarTree(tree, expanded),
    horizontalDelta: 13,
    indentWidth: 28,
  }),
  { parentId: "project-b", previousId: "ops", nextId: null }
);

assert.equal(
  getSidebarPointerDropPlan({
    activeId: "pricing",
    overId: null,
    flattened: flattenSidebarTree(tree, expanded),
    horizontalDelta: 13,
    indentWidth: 28,
  }),
  null
);

assert.equal(nextSidebarPosition(null, 1), 0);
assert.equal(nextSidebarPosition(1, null), 2);
assert.equal(nextSidebarPosition(1, 3), 2);
assert.equal(nextSidebarPosition(null, null), 0);

assert.deepEqual(
  getPinnedNodes(
    [
      { node: tree[0].children[0].children[0], position: 2 },
      { node: tree[0], position: 1 },
    ]
  ).map((pin) => pin.node.id),
  ["project-a", "pricing"]
);

const movedTree = moveSidebarTreeNode(tree, "pricing", {
  parentId: "project-b",
  previousId: "ops",
  nextId: null,
});

assert.deepEqual(
  flattenSidebarTree(movedTree, new Set(["project-a", "project-b"])).map((row) => [
    row.id,
    row.parent_id,
    row.depth,
    row.rootId,
  ]),
  [
    ["project-a", null, 0, "project-a"],
    ["scope", "project-a", 1, "project-a"],
    ["project-b", null, 0, "project-b"],
    ["ops", "project-b", 1, "project-b"],
    ["pricing", "project-b", 1, "project-b"],
  ]
);

assert.equal(
  moveSidebarTreeNode(tree, "project-a", {
    parentId: "pricing",
    previousId: null,
    nextId: null,
  }),
  tree
);
