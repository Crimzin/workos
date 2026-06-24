import type { NodeType } from "./types";
import type { SidebarTreeNode } from "./sidebar-tree";
import { buildContextSearchResults, type ContextSearchCandidate } from "./context-search";

export interface AppSearchResult {
  id: string;
  title: string;
  type: NodeType;
  href: string;
  path: string;
}

export function buildAppSearchResults(
  tree: SidebarTreeNode[],
  query: string,
  limit: number
): AppSearchResult[] {
  if (!query.trim() || limit <= 0) return [];

  const candidates: ContextSearchCandidate[] = [];

  function visit(node: SidebarTreeNode, ancestors: string[]) {
    const pathParts = [...ancestors, node.title];
    const path = pathParts.join(" / ");

    candidates.push({
      id: node.id,
      title: node.title,
      type: node.type,
      href: `/n/${node.id}`,
      path,
      sourceApp: "workos",
    });

    for (const child of node.children) {
      visit(child, pathParts);
    }
  }

  for (const node of tree) {
    visit(node, []);
  }

  return buildContextSearchResults(candidates, query, limit).map((result) => ({
    id: result.id,
    title: result.title,
    type: result.type,
    href: result.href,
    path: result.path,
  }));
}
