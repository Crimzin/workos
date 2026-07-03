import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type { WorkNode } from "./types";
import { getCurrentActor } from "./actor";
import { getImportedChats, type ImportedChatRow } from "./imported-chats";
import {
  buildSidebarTree,
  getProjectSidebarTree,
  type SidebarTreeNode,
} from "./sidebar-tree";
import type { PinnedSidebarNode } from "./sidebar-tree-dnd";
import {
  buildNodeMentionCandidates,
  type NodeMentionCandidate,
  type NodeMentionSearchRow,
} from "./node-mentions";

export async function getRootNodes(): Promise<WorkNode[]> {
  return cachedGetRootNodes();
}

const cachedGetRootNodes = unstable_cache(
  async (): Promise<WorkNode[]> => {
    const { data, error } = await supabase
      .from("nodes")
      .select("*")
      .is("parent_id", null)
      .is("archived_at", null)
      .order("position", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  ["root-nodes"],
  {
    tags: [cacheTags.rootNodes()],
    revalidate: 300,
  }
);

export async function getNode(id: string): Promise<WorkNode | null> {
  const cached = unstable_cache(
    async (): Promise<WorkNode | null> => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    ["node", id],
    {
      tags: [cacheTags.node(id)],
      revalidate: 300,
    }
  );
  return cached();
}

export async function getChildren(parentId: string): Promise<WorkNode[]> {
  const cached = unstable_cache(
    async (): Promise<WorkNode[]> => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("parent_id", parentId)
        .is("archived_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    ["node-children", parentId],
    {
      tags: [cacheTags.children(parentId)],
      revalidate: 300,
    }
  );
  return cached();
}

export async function searchNodeMentionCandidates(
  instanceId: string,
  query: string,
  limit = 12
): Promise<NodeMentionCandidate[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id,title,type,parent_id,source_kind,source_app,source_title,source_conversation_id")
    .eq("instance_id", instanceId)
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) throw error;

  return buildNodeMentionCandidates(
    (data ?? []) as NodeMentionSearchRow[],
    query,
    limit
  );
}

export async function getSidebarTree(): Promise<SidebarTreeNode[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  return buildSidebarTree((data ?? []) as WorkNode[]);
}

export interface SidebarData {
  projectTree: SidebarTreeNode[];
  searchTree: SidebarTreeNode[];
  pinnedNodes: PinnedSidebarNode[];
  importedChats: ImportedChatRow[];
}

export async function getSidebarData(): Promise<SidebarData> {
  const [searchTree, actor] = await Promise.all([
    getSidebarTree(),
    getCurrentActor(),
  ]);
  const projectTree = getProjectSidebarTree(searchTree);
  const [pinnedNodes, importedChats] = await Promise.all([
    getSidebarPins(searchTree),
    getImportedChats(actor.instance_id),
  ]);
  return { projectTree, searchTree, pinnedNodes, importedChats };
}

interface PinRow {
  position: number;
  node: WorkNode | null;
}

export async function getSidebarPins(
  projectTree: SidebarTreeNode[]
): Promise<PinnedSidebarNode[]> {
  const cached = unstable_cache(
    async (): Promise<PinRow[]> => {
      const { data, error } = await supabase
        .from("node_pins")
        .select("position,node:nodes(*)")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PinRow[];
    },
    ["sidebar-pins"],
    {
      tags: [cacheTags.sidebarPins()],
      revalidate: 300,
    }
  );

  const nodeById = flattenTree(projectTree);
  const rows = await cached();
  return rows
    .map((row) => {
      const node = row.node ? nodeById.get(row.node.id) : null;
      return node ? { node, position: row.position } : null;
    })
    .filter((pin): pin is PinnedSidebarNode => pin !== null);
}

function flattenTree(tree: SidebarTreeNode[]): Map<string, SidebarTreeNode> {
  const nodes = new Map<string, SidebarTreeNode>();
  function visit(node: SidebarTreeNode) {
    nodes.set(node.id, node);
    for (const child of node.children) visit(child);
  }
  for (const node of tree) visit(node);
  return nodes;
}
