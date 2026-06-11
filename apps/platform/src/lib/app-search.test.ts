import assert from "node:assert/strict";
import { buildAppSearchResults } from "./app-search";
import type { SidebarTreeNode } from "./sidebar-tree";

const now = "2026-06-11T00:00:00.000Z";

function node(
  id: string,
  title: string,
  type: SidebarTreeNode["type"],
  children: SidebarTreeNode[] = [],
  parentId: string | null = null,
  depth = 0,
  rootId = id
): SidebarTreeNode {
  return {
    id,
    instance_id: "instance-1",
    parent_id: parentId,
    type,
    title,
    description: null,
    owner_id: null,
    position: 0,
    stack_lifecycle_status: "prioritized",
    thread_resolution_status: "active",
    resolved_at: null,
    resolved_by_actor_id: null,
    resolution_summary: null,
    resolution_source_post_id: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    depth,
    rootId,
    children,
  };
}

const roadmapCard = node("card-1", "June Roadmap", "card", [], "stack-1", 2, "workspace-1");
const launchStack = node("stack-1", "Launch Work", "stack", [roadmapCard], "workspace-1", 1, "workspace-1");
const workspace = node("workspace-1", "Marketing", "workspace", [launchStack]);
const support = node("workspace-2", "Support", "workspace");

assert.deepEqual(buildAppSearchResults([workspace, support], "ROAD", 10), [
  {
    id: "card-1",
    title: "June Roadmap",
    type: "card",
    href: "/n/card-1",
    path: "Marketing / Launch Work / June Roadmap",
  },
]);

assert.deepEqual(
  buildAppSearchResults([workspace, support], "work", 1).map((result) => result.id),
  ["stack-1"]
);

assert.deepEqual(buildAppSearchResults([workspace, support], "   ", 10), []);
