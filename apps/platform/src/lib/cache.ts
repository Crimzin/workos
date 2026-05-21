import { revalidateTag } from "next/cache";

// Tag helpers. Read functions in nodes.ts / board.ts wrap themselves in
// `unstable_cache` with these tags; server actions call the `revalidate*`
// helpers after mutating. Keep tag shapes consistent so one mutation can
// invalidate every read that depends on the touched data.

export const cacheTags = {
  rootNodes: () => "root-nodes",
  sidebarPins: () => "sidebar-pins",
  node: (id: string) => `node:${id}`,
  nodePath: (id: string) => `node-path:${id}`,
  threadSurface: (id: string) => `thread-surface:${id}`,
  children: (parentId: string) => `node-children:${parentId}`,
  workspaceBoard: (workspaceId: string) => `workspace-board:${workspaceId}`,
  instanceFields: (instanceId: string) => `instance-fields:${instanceId}`,
  aiStandards: (instanceId: string) => `ai-standards:${instanceId}`,
  workspaceViews: (workspaceId: string) => `workspace-views:${workspaceId}`,
  nodePosts: (nodeId: string) => `posts:${nodeId}`,
  workspaceFeed: (workspaceId: string) => `workspace-feed:${workspaceId}`,
  nodeLinks: (nodeId: string) => `links:${nodeId}`,
  nodeMemoryPrimitives: (nodeId: string) => `memory-primitives:${nodeId}`,
  agentSettings: (instanceId: string) => `agent-settings:${instanceId}`,
  agentRuns: (nodeId: string) => `agent-runs:${nodeId}`,
};

// Next 16 `revalidateTag` requires a profile arg; "max" = stale-while-revalidate.
const PROFILE = "max";

// `{ expire: 0 }` forces the tag to expire NOW so the next read fetches fresh
// data instead of a stale-while-revalidate snapshot.
const IMMEDIATE = { expire: 0 } as const;

export function revalidateNode(id: string, parentId: string | null) {
  revalidateTag(cacheTags.node(id), PROFILE);
  if (parentId) revalidateTag(cacheTags.children(parentId), PROFILE);
}

export function revalidateNodeChildren(parentId: string) {
  revalidateTag(cacheTags.children(parentId), PROFILE);
}

export function revalidateNodePath(id: string) {
  revalidateTag(cacheTags.nodePath(id), PROFILE);
}

export function revalidateThreadSurface(nodeId: string) {
  revalidateTag(cacheTags.threadSurface(nodeId), PROFILE);
}

export function revalidateWorkspaceBoard(workspaceId: string) {
  revalidateTag(cacheTags.workspaceBoard(workspaceId), PROFILE);
}

export function revalidateRootNodes() {
  revalidateTag(cacheTags.rootNodes(), PROFILE);
}

export function revalidateSidebarPins() {
  revalidateTag(cacheTags.sidebarPins(), PROFILE);
}

export function revalidateInstanceFields(instanceId: string) {
  revalidateTag(cacheTags.instanceFields(instanceId), PROFILE);
}

export function revalidateAIStandards(instanceId: string) {
  revalidateTag(cacheTags.aiStandards(instanceId), IMMEDIATE);
}

export function revalidateWorkspaceViews(workspaceId: string) {
  revalidateTag(cacheTags.workspaceViews(workspaceId), PROFILE);
}

// Post threads are interactive — when the agent (1.11) inserts a reply or a
// user submits a new post, the next read MUST return the fresh value, not a
// stale-while-revalidate snapshot. Using the "max" SWR profile here caused a
// "whiplash" bug where Claude's reply only appeared after the *next* user
// @-mention (because every poll was being served the stale snapshot while a
// background refresh ran). Other tags keep "max" because their reads are
// read-heavy and tolerate brief staleness.

export function revalidateNodePosts(nodeId: string) {
  revalidateTag(cacheTags.nodePosts(nodeId), IMMEDIATE);
}

export function revalidateWorkspaceFeed(workspaceId: string) {
  revalidateTag(cacheTags.workspaceFeed(workspaceId), IMMEDIATE);
}

export function revalidateNodeLinksFor(nodeIds: string[]) {
  for (const id of nodeIds) {
    revalidateTag(cacheTags.nodeLinks(id), PROFILE);
  }
}

export function revalidateNodeMemoryPrimitives(nodeId: string) {
  revalidateTag(cacheTags.nodeMemoryPrimitives(nodeId), PROFILE);
}

export function revalidateAgentSettings(instanceId: string) {
  revalidateTag(cacheTags.agentSettings(instanceId), IMMEDIATE);
}

export function revalidateAgentRuns(nodeId: string) {
  revalidateTag(cacheTags.agentRuns(nodeId), IMMEDIATE);
}
