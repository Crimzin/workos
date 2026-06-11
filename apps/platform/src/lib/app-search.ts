import type { NodeType } from "./types";
import type { SidebarTreeNode } from "./sidebar-tree";

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
  const trimmed = query.trim().toLocaleLowerCase();
  if (!trimmed || limit <= 0) return [];

  const results: AppSearchResult[] = [];

  function visit(node: SidebarTreeNode, ancestors: string[]) {
    if (results.length >= limit) return;

    const pathParts = [...ancestors, node.title];
    const path = pathParts.join(" / ");
    const haystack = `${node.title} ${path}`.toLocaleLowerCase();

    if (haystack.includes(trimmed)) {
      results.push({
        id: node.id,
        title: node.title,
        type: node.type,
        href: `/n/${node.id}`,
        path,
      });
    }

    for (const child of node.children) {
      visit(child, pathParts);
      if (results.length >= limit) return;
    }
  }

  for (const node of tree) {
    visit(node, []);
    if (results.length >= limit) break;
  }

  return results;
}
