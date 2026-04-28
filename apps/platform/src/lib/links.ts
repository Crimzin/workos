import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkType = "related" | "blocks";

export interface LinkRecord {
  id: string;
  link_type: LinkType;
  /** The node on the OTHER side of the link (not the perspective node). */
  other_node: {
    id: string;
    title: string;
    type: string;
    workspace: { id: string; title: string } | null;
  };
  from_node_id: string;
  to_node_id: string;
  created_at: string;
}

export interface NodeLinks {
  /** Symmetric: this node is related to these. */
  related: LinkRecord[];
  /** Directional: this node blocks these. */
  blocks: LinkRecord[];
  /** Directional: this node is blocked by these. */
  blockedBy: LinkRecord[];
}

// ---------------------------------------------------------------------------
// getNodeLinks — primary read for the Linked Context section
// ---------------------------------------------------------------------------

// Walks up to 3 levels via parent_id so card → stack → workspace ancestry is
// available for the workspace label on each chip.
const NODE_WITH_ANCESTRY = `
  id,
  title,
  type,
  parent_id,
  parent:parent_id (
    id,
    title,
    type,
    parent_id,
    parent:parent_id (
      id,
      title,
      type
    )
  )
`;

interface RawNode {
  id: string;
  title: string;
  type: string;
  parent_id: string | null;
  parent?: RawNode | RawNode[] | null;
}

function unwrapParent(parent: RawNode | RawNode[] | null | undefined): RawNode | null {
  if (!parent) return null;
  if (Array.isArray(parent)) return parent[0] ?? null;
  return parent;
}

function findWorkspaceAncestor(node: RawNode): { id: string; title: string } | null {
  let cur: RawNode | null = node;
  while (cur) {
    if (cur.type === "workspace") return { id: cur.id, title: cur.title };
    cur = unwrapParent(cur.parent);
  }
  return null;
}

export function getNodeLinks(nodeId: string): Promise<NodeLinks> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("node_links")
        .select(
          `
          id,
          link_type,
          from_node_id,
          to_node_id,
          created_at,
          from_node:from_node_id (${NODE_WITH_ANCESTRY}),
          to_node:to_node_id (${NODE_WITH_ANCESTRY})
        `
        )
        .or(`from_node_id.eq.${nodeId},to_node_id.eq.${nodeId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const related: LinkRecord[] = [];
      const blocks: LinkRecord[] = [];
      const blockedBy: LinkRecord[] = [];

      for (const row of (data ?? []) as Array<{
        id: string;
        link_type: string;
        from_node_id: string;
        to_node_id: string;
        created_at: string;
        from_node: RawNode | RawNode[] | null;
        to_node: RawNode | RawNode[] | null;
      }>) {
        const isOutgoing = row.from_node_id === nodeId;
        const otherRaw = isOutgoing ? unwrapParent(row.to_node) : unwrapParent(row.from_node);
        if (!otherRaw) continue;

        const workspace = findWorkspaceAncestor(otherRaw);
        const linkType = (row.link_type as LinkType) ?? "related";

        const record: LinkRecord = {
          id: row.id,
          link_type: linkType,
          other_node: {
            id: otherRaw.id,
            title: otherRaw.title,
            type: otherRaw.type,
            workspace,
          },
          from_node_id: row.from_node_id,
          to_node_id: row.to_node_id,
          created_at: row.created_at,
        };

        if (linkType === "related") {
          related.push(record);
        } else if (linkType === "blocks") {
          if (isOutgoing) blocks.push(record);
          else blockedBy.push(record);
        }
      }

      return { related, blocks, blockedBy };
    },
    [`links-node-${nodeId}`],
    { tags: [cacheTags.nodeLinks(nodeId)], revalidate: false }
  )();
}

// ---------------------------------------------------------------------------
// searchLinkableNodes — async picker for the Add Link popover
// ---------------------------------------------------------------------------

export interface LinkableNode {
  id: string;
  title: string;
  type: string;
  workspace_title: string | null;
}

export async function searchLinkableNodes(
  query: string,
  excludeNodeId: string,
  max = 20
): Promise<LinkableNode[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("nodes")
    .select(NODE_WITH_ANCESTRY)
    .ilike("title", `%${trimmed}%`)
    .neq("id", excludeNodeId)
    .in("type", ["card", "stack"])
    .is("archived_at", null)
    .order("title", { ascending: true })
    .limit(max);
  if (error) throw error;

  return ((data ?? []) as RawNode[]).map((n) => ({
    id: n.id,
    title: n.title,
    type: n.type,
    workspace_title: findWorkspaceAncestor(n)?.title ?? null,
  }));
}
