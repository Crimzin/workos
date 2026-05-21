import type { SidebarTreeNode } from "./sidebar-tree";

export interface FlatSidebarTreeNode extends SidebarTreeNode {
  parentId: string | null;
  ancestorIds: string[];
}

export interface SidebarDropPlan {
  parentId: string | null;
  previousId: string | null;
  nextId: string | null;
}

export interface PinnedSidebarNode {
  node: SidebarTreeNode;
  position: number;
}

export function flattenSidebarTree(
  tree: SidebarTreeNode[],
  expandedIds: Set<string>
): FlatSidebarTreeNode[] {
  const rows: FlatSidebarTreeNode[] = [];

  function visit(
    node: SidebarTreeNode,
    parentId: string | null,
    ancestorIds: string[]
  ) {
    rows.push({ ...node, parentId, ancestorIds });
    if (!expandedIds.has(node.id)) return;
    for (const child of node.children) {
      visit(child, node.id, [...ancestorIds, node.id]);
    }
  }

  for (const node of tree) visit(node, null, []);
  return rows;
}

export function getSidebarDropPlan({
  activeId,
  overId,
  flattened,
  indentationDelta,
}: {
  activeId: string;
  overId: string;
  flattened: FlatSidebarTreeNode[];
  indentationDelta: number;
}): SidebarDropPlan | null {
  const active = flattened.find((row) => row.id === activeId);
  const over = flattened.find((row) => row.id === overId);
  if (!active || !over || active.id === over.id) return null;
  if (over.ancestorIds.includes(active.id)) return null;

  const withoutActive = flattened.filter(
    (row) => row.id !== active.id && !row.ancestorIds.includes(active.id)
  );
  const overIndex = withoutActive.findIndex((row) => row.id === over.id);
  if (overIndex === -1) return null;

  const desiredDepth = clamp(
    over.depth + indentationDelta,
    0,
    maxDepthForDrop(withoutActive, overIndex)
  );
  const insertBeforeOver = indentationDelta < 0;
  const previousIndex = insertBeforeOver ? overIndex - 1 : overIndex;

  const previous = findPreviousAtDepth(withoutActive, previousIndex, desiredDepth);
  const next = insertBeforeOver
    ? over.depth === desiredDepth
      ? over
      : findNextAtDepth(withoutActive, previousIndex, desiredDepth)
    : findNextAtDepth(withoutActive, overIndex, desiredDepth);
  const parentId = parentForDepth(withoutActive, overIndex, desiredDepth);

  if (parentId === active.id || active.ancestorIds.includes(parentId ?? "")) {
    return null;
  }

  return {
    parentId,
    previousId: previous?.id ?? null,
    nextId: next?.id ?? null,
  };
}

export function nextSidebarPosition(
  previousPosition: number | null,
  nextPosition: number | null
): number {
  if (previousPosition === null && nextPosition === null) return 0;
  if (previousPosition === null) return nextPosition! - 1;
  if (nextPosition === null) return previousPosition + 1;
  return previousPosition + (nextPosition - previousPosition) / 2;
}

export function getPinnedNodes(pins: PinnedSidebarNode[]): PinnedSidebarNode[] {
  return [...pins].sort((a, b) => a.position - b.position);
}

function maxDepthForDrop(rows: FlatSidebarTreeNode[], overIndex: number) {
  const previous = rows[overIndex - 1];
  return previous ? previous.depth + 1 : 0;
}

function parentForDepth(
  rows: FlatSidebarTreeNode[],
  overIndex: number,
  depth: number
): string | null {
  if (depth === 0) return null;
  for (let i = overIndex - 1; i >= 0; i -= 1) {
    if (rows[i].depth === depth - 1) return rows[i].id;
  }
  return null;
}

function findPreviousAtDepth(
  rows: FlatSidebarTreeNode[],
  overIndex: number,
  depth: number
): FlatSidebarTreeNode | null {
  for (let i = overIndex; i >= 0; i -= 1) {
    if (rows[i].depth === depth) return rows[i];
    if (rows[i].depth < depth) return null;
  }
  return null;
}

function findNextAtDepth(
  rows: FlatSidebarTreeNode[],
  overIndex: number,
  depth: number
): FlatSidebarTreeNode | null {
  for (let i = overIndex + 1; i < rows.length; i += 1) {
    if (rows[i].depth === depth) return rows[i];
    if (rows[i].depth < depth) return null;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
