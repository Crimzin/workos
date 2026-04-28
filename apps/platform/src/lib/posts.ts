import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";

export interface PostRecord {
  id: string;
  node_id: string;
  actor_id: string | null;
  post_type: string; // 'post' | 'card_created' | 'link_created'
  body: string | null;
  metadata: Record<string, string> | null;
  pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  actor: { id: string; name: string; kind: string } | null;
}

export interface FeedPost extends PostRecord {
  node: { id: string; title: string; type: string };
}

export function getNodePosts(nodeId: string): Promise<PostRecord[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*, actor:actors(id,name,kind)")
        .eq("node_id", nodeId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Pure chronological sort; pinned decoration is handled client-side.
      return (data ?? []) as PostRecord[];
    },
    [`posts-node-${nodeId}`],
    { tags: [cacheTags.nodePosts(nodeId)], revalidate: false }
  )();
}

export async function getWorkspaceFeed(
  workspaceId: string,
  scope: "workspace" | "all"
): Promise<FeedPost[]> {
  if (scope === "workspace") {
    // Fetch all node IDs in the workspace (workspace node itself + its children)
    const { data: nodes, error: nodesErr } = await supabase
      .from("nodes")
      .select("id")
      .or(`id.eq.${workspaceId},parent_id.eq.${workspaceId}`);
    if (nodesErr) throw nodesErr;

    const nodeIds = (nodes ?? []).map((n) => n.id);
    if (nodeIds.length === 0) return [];

    const { data, error } = await supabase
      .from("posts")
      .select("*, actor:actors(id,name,kind), node:nodes(id,title,type)")
      .in("node_id", nodeIds)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as FeedPost[];
  }

  // scope === "all"
  const { data, error } = await supabase
    .from("posts")
    .select("*, actor:actors(id,name,kind), node:nodes(id,title,type)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}
