import type { WorkNode } from "./types";

export interface SidebarTreeNode extends WorkNode {
  children: SidebarTreeNode[];
  depth: number;
  rootId: string;
}

export function buildSidebarTree(nodes: WorkNode[]): SidebarTreeNode[] {
  const byParent = new Map<string | null, WorkNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parent_id) ?? [];
    siblings.push(node);
    byParent.set(node.parent_id, siblings);
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.position - b.position);
  }

  function build(
    parentId: string | null,
    depth: number,
    rootId?: string
  ): SidebarTreeNode[] {
    return (byParent.get(parentId) ?? []).map((node) => {
      const nodeRootId = rootId ?? node.id;
      return {
        ...node,
        depth,
        rootId: nodeRootId,
        children: build(node.id, depth + 1, nodeRootId),
      };
    });
  }

  return build(null, 0);
}

export function getProjectSidebarTree(tree: SidebarTreeNode[]): SidebarTreeNode[] {
  return tree
    .filter((node) => node.source_kind !== "imported_ai_chat")
    .map((node) => ({
      ...node,
      children: getProjectSidebarTree(node.children),
    }));
}
