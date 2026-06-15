import { supabase } from "./supabase";
import {
  groupPostReactions,
  type PostReactionSummary,
  type RawPostReaction,
} from "./post-reactions";

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
  reactions: PostReactionSummary[];
}

export interface FeedPost extends PostRecord {
  node: { id: string; title: string; type: string };
}

const POST_WITH_RELATIONS_SELECT =
  "*, actor:actors(id,name,kind), reactions:post_reactions(id,post_id,actor_id,emoji,created_at,actor:actors(id,name,kind))";

const FEED_POST_WITH_RELATIONS_SELECT =
  "*, actor:actors(id,name,kind), node:nodes!posts_node_id_fkey(id,title,type), reactions:post_reactions(id,post_id,actor_id,emoji,created_at,actor:actors(id,name,kind))";

type PostWithRawReactions = Omit<PostRecord, "reactions"> & {
  reactions?: RawPostReaction[] | null;
};

type FeedPostWithRawReactions = Omit<FeedPost, "reactions"> & {
  reactions?: RawPostReaction[] | null;
};

function withGroupedReactions<T extends PostWithRawReactions>(
  posts: T[],
  currentActorId: string | null = null
): Array<Omit<T, "reactions"> & { reactions: PostReactionSummary[] }> {
  return posts.map((post) => ({
    ...post,
    reactions: groupPostReactions(post.reactions, currentActorId),
  }));
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
export async function getNodePosts(
  nodeId: string,
  currentActorId: string | null = null
): Promise<PostRecord[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_WITH_RELATIONS_SELECT)
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // Pure chronological sort; pinned decoration is handled client-side.
  return withGroupedReactions(
    (data ?? []) as PostWithRawReactions[],
    currentActorId
  ) as PostRecord[];
}

export async function getWorkspaceFeed(
  workspaceId: string,
  scope: "workspace" | "all",
  currentActorId: string | null = null
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
      .select(FEED_POST_WITH_RELATIONS_SELECT)
      .in("node_id", nodeIds)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return withGroupedReactions(
      (data ?? []) as FeedPostWithRawReactions[],
      currentActorId
    ) as FeedPost[];
  }

  // scope === "all"
  const { data, error } = await supabase
    .from("posts")
    .select(FEED_POST_WITH_RELATIONS_SELECT)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return withGroupedReactions(
    (data ?? []) as FeedPostWithRawReactions[],
    currentActorId
  ) as FeedPost[];
}

export async function getPostReactionSummaries(
  postId: string,
  currentActorId: string | null = null
): Promise<PostReactionSummary[]> {
  const { data, error } = await supabase
    .from("post_reactions")
    .select("id,post_id,actor_id,emoji,created_at,actor:actors(id,name,kind)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return groupPostReactions((data ?? []) as RawPostReaction[], currentActorId);
}
