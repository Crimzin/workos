import { revalidateTag } from "next/cache";

// Tag helpers. Read functions in nodes.ts / board.ts wrap themselves in
// `unstable_cache` with these tags; server actions call the `revalidate*`
// helpers after mutating. Keep tag shapes consistent so one mutation can
// invalidate every read that depends on the touched data.

export const cacheTags = {
  rootNodes: () => "root-nodes",
  node: (id: string) => `node:${id}`,
  children: (parentId: string) => `node-children:${parentId}`,
  workspaceBoard: (workspaceId: string) => `workspace-board:${workspaceId}`,
  instanceFields: (instanceId: string) => `instance-fields:${instanceId}`,
  workspaceViews: (workspaceId: string) => `workspace-views:${workspaceId}`,
  nodePosts: (nodeId: string) => `posts:${nodeId}`,
  workspaceFeed: (workspaceId: string) => `workspace-feed:${workspaceId}`,
};

// Next 16 `revalidateTag` requires a profile arg; "max" = stale-while-revalidate.
const PROFILE = "max";

export function revalidateNode(id: string, parentId: string | null) {
  revalidateTag(cacheTags.node(id), PROFILE);
  if (parentId) revalidateTag(cacheTags.children(parentId), PROFILE);
}

export function revalidateWorkspaceBoard(workspaceId: string) {
  revalidateTag(cacheTags.workspaceBoard(workspaceId), PROFILE);
}

export function revalidateRootNodes() {
  revalidateTag(cacheTags.rootNodes(), PROFILE);
}

export function revalidateInstanceFields(instanceId: string) {
  revalidateTag(cacheTags.instanceFields(instanceId), PROFILE);
}

export function revalidateWorkspaceViews(workspaceId: string) {
  revalidateTag(cacheTags.workspaceViews(workspaceId), PROFILE);
}

export function revalidateNodePosts(nodeId: string) {
  revalidateTag(cacheTags.nodePosts(nodeId), PROFILE);
}

export function revalidateWorkspaceFeed(workspaceId: string) {
  revalidateTag(cacheTags.workspaceFeed(workspaceId), PROFILE);
}
