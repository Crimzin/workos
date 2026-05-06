"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import { revalidateNodePosts, revalidateWorkspaceFeed } from "../cache";
import { findAgentMentions, type MentionedAgent } from "../agents/mention-detection";
import { assembleNodeContext } from "../agents/context-assembly";
import { invokeClaude } from "../agents/claude";
import { postAgentReply } from "../agents/reply-poster";

export async function createPost(
  nodeId: string,
  workspaceId: string,
  body: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  const actor = await getCurrentActor();

  const { error } = await supabase.from("posts").insert({
    node_id: nodeId,
    actor_id: actor.id,
    post_type: "post",
    body: trimmed,
  });
  if (error) throw error;

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);

  // 1.11 Inline AI: if Claude was @-mentioned, schedule a reply. Runs after
  // the response is sent so the user's post lands instantly; Claude's reply
  // appears via cache revalidation a few seconds later.
  const mentions = findAgentMentions(trimmed);
  if (mentions.length > 0) {
    const claudeAgents = await filterClaudeAgents(mentions);
    for (const agent of claudeAgents) {
      after(async () => {
        try {
          const ctx = await assembleNodeContext(nodeId);
          const reply = await invokeClaude({
            systemPrompt: ctx.systemPrompt,
            userMessage: ctx.userMessage,
          });
          await postAgentReply(nodeId, workspaceId, agent.id, reply);
        } catch (err) {
          console.error("[1.11 inline-ai] agent invocation failed:", err);
        }
      });
    }
  }
}

/**
 * Resolve a list of mentioned agent ids to those whose names start with
 * "Claude" (case-insensitive). v1 fragile match; replaced by an
 * `agent_provider` column in v1 polished.
 */
async function filterClaudeAgents(
  mentions: MentionedAgent[]
): Promise<MentionedAgent[]> {
  if (mentions.length === 0) return [];
  const ids = mentions.map((m) => m.id);
  const { data, error } = await supabase
    .from("actors")
    .select("id, name, kind")
    .in("id", ids)
    .eq("kind", "agent");
  if (error) throw error;
  const claudeIds = new Set(
    (data ?? [])
      .filter((a) => a.name && a.name.toLowerCase().startsWith("claude"))
      .map((a) => a.id)
  );
  return mentions.filter((m) => claudeIds.has(m.id));
}

export async function updatePost(
  postId: string,
  nodeId: string,
  workspaceId: string,
  body: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const { error } = await supabase
    .from("posts")
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) throw error;

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function deletePost(
  postId: string,
  nodeId: string,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function pinPost(
  postId: string,
  nodeId: string,
  workspaceId: string,
  pinned: boolean
): Promise<void> {
  const { error } = await supabase
    .from("posts")
    .update({
      pinned,
      pinned_at: pinned ? new Date().toISOString() : null,
    })
    .eq("id", postId);
  if (error) throw error;

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}
