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

/**
 * Read a node's posts directly from Supabase, newest-first. Deliberately
 * NOT wrapped in `unstable_cache`.
 *
 * Why uncached: post threads are an interactive surface where freshness
 * matters more than the ~80ms saved by a cache hit. The 1.11 streaming
 * agent flow updates a post body up to 85 times during a single reply, and
 * `revalidateTag` calls from inside `after()` callbacks were observed to
 * NOT reliably invalidate `unstable_cache` entries in Next 16 dev — leaving
 * page renders stuck on a stale snapshot even after dozens of revalidations.
 * Hitting Supabase on every detail-panel render and every poll keeps the
 * surface always-fresh; the cost is one DB round-trip per call.
 *
 * Workspace feed (`getWorkspaceFeed` below) keeps SWR caching because it's
 * read-heavy and tolerates brief staleness.
 */
export async function getNodePosts(nodeId: string): Promise<PostRecord[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("*, actor:actors(id,name,kind)")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // Pure chronological sort; pinned decoration is handled client-side.
  return (data ?? []) as PostRecord[];
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
