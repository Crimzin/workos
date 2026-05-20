"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import { revalidateNodePosts, revalidateWorkspaceFeed } from "../cache";
import { getNodePosts, type PostRecord } from "../posts";
import { findAgentMentions, type MentionedAgent } from "../agents/mention-detection";
import { gatherNodeContext, type NodeContext } from "../agents/node-context";
import { renderClaudePrompt } from "../agents/claude-prompt";
import { streamClaude } from "../agents/claude";
import {
  createStreamingAgentReply,
  updateStreamingAgentReply,
  type StreamingReplyHandle,
} from "../agents/reply-poster";

/**
 * Server action used by the 1.11 streaming-agent polling effect. Returns the
 * latest posts for a node directly from Supabase — `getNodePosts` is
 * deliberately uncached (see the docstring there for rationale).
 */
export async function pollNodePosts(nodeId: string): Promise<PostRecord[]> {
  return getNodePosts(nodeId);
}

/** Cadence at which we flush the accumulated streaming text to Supabase
 *  during an agent reply. Balances perceived latency against DB write rate.
 *  At 400ms + the client's 750ms poll cadence the user sees new text every
 *  ~1.2s on average — close enough to feel real-time. */
const STREAM_FLUSH_INTERVAL_MS = 400;

export async function createPost(
  nodeId: string,
  workspaceId: string,
  body: string
): Promise<void> {
  console.log(
    `[1.11] createPost ENTER nodeId=${nodeId.slice(0, 8)} bodyChars=${body.length}`
  );
  const trimmed = body.trim();
  if (!trimmed) return;
  const actor = await getCurrentActor();

  const { data: insertedPost, error } = await supabase
    .from("posts")
    .insert({
      node_id: nodeId,
      actor_id: actor.id,
      post_type: "post",
      body: trimmed,
    })
    .select(
      "id,node_id,actor_id,post_type,body,metadata,pinned,pinned_at,created_at,updated_at"
    )
    .single();
  if (error) throw error;

  const targetPost: PostRecord = {
    ...insertedPost,
    actor: { id: actor.id, name: actor.name, kind: "human" },
  } as PostRecord;

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);

  // 1.11 Inline AI: if Claude was @-mentioned, schedule a reply. Runs after
  // the response is sent so the user's post lands instantly; Claude's reply
  // appears via cache revalidation a few seconds later.
  //
  // Verbose logging through the full pipeline (createPost → mention filter →
  // context assembly → Anthropic call → reply post) so we can pinpoint where
  // an invocation stalls. Search server logs for "[1.11]".
  const mentions = findAgentMentions(trimmed);
  console.log(
    `[1.11] createPost: detected ${mentions.length} agent mention(s)`,
    mentions.map((m) => `${m.name}(${m.id.slice(0, 8)})`)
  );

  if (mentions.length === 0) return;

  let claudeAgents: MentionedAgent[];
  try {
    claudeAgents = await filterClaudeAgents(mentions);
  } catch (err) {
    console.error("[1.11] filterClaudeAgents failed:", err);
    return;
  }
  console.log(
    `[1.11] createPost: ${claudeAgents.length} Claude actor(s) after filter`,
    claudeAgents.map((m) => `${m.name}(${m.id.slice(0, 8)})`)
  );

  if (claudeAgents.length === 0) {
    console.log(
      "[1.11] createPost: no Claude actors matched — invocation skipped. " +
        "Verify the mentioned actor's `name` starts with 'claude' (case-insensitive) and `kind='agent'`."
    );
    return;
  }

  // Gather agent-agnostic context + render Claude-specific prompt
  // SYNCHRONOUSLY, in request context. Doing the cache-backed reads inside
  // after() deadlocks against the revalidate*() calls above: unstable_cache
  // reads in post-response after() context hang waiting on a request scope
  // that no longer exists. Reading here costs ~750ms (1–2s with broader
  // family-thread context) but the user's post is already inserted and the
  // response has effectively been sent — only the slow Anthropic call (10–15s)
  // stays inside after().
  let ctxPrompt: ReturnType<typeof renderClaudePrompt>;
  try {
    const tCtx = Date.now();
    const ctx = await gatherNodeContext(nodeId);
    if (!ctx) {
      console.error("[1.11] gatherNodeContext: node not found:", nodeId);
      return;
    }
    const targetAwareCtx = ensureTargetPostInOwnThread(ctx, targetPost);
    console.log(
      `[1.11] context gathered (own=${targetAwareCtx.ownThread.length} parent=${targetAwareCtx.parentThread ? targetAwareCtx.parentThread.posts.length : 0} siblings=${targetAwareCtx.siblingThreads.length} children=${targetAwareCtx.childThreads.length}, ${Date.now() - tCtx}ms)`
    );
    ctxPrompt = renderClaudePrompt(targetAwareCtx, { targetPostId: targetPost.id });
    console.log(
      `[1.11] claude prompt rendered (system=${ctxPrompt.systemPrompt.length}c, user=${ctxPrompt.userMessage.length}c)`
    );
  } catch (err) {
    console.error("[1.11] context gather/render failed:", err);
    return;
  }

  for (const agent of claudeAgents) {
    console.log(
      `[1.11] createPost: scheduling after() for ${agent.name}(${agent.id.slice(0, 8)})`
    );
    after(async () => {
      const t0 = Date.now();
      console.log(`[1.11] after(): START for ${agent.name}`);

      // Streaming flow:
      //   1. Wait for Claude's first chunk → insert the reply post seeded
      //      with that text. The post is visible to clients via the next
      //      revalidation/poll cycle. This replaces the "Claude is thinking"
      //      placeholder with the actual reply, growing in real-time.
      //   2. Continue streaming. Every STREAM_FLUSH_INTERVAL_MS, update the
      //      post body in-place with the full accumulated text.
      //   3. After the stream ends, do one final update with the canonical
      //      complete text so no chunks are lost in the last flush window.
      let handle: StreamingReplyHandle | null = null;
      let accumulated = "";
      let lastFlush = 0;
      let flushCount = 0;

      try {
        for await (const event of streamClaude({
          systemPrompt: ctxPrompt.systemPrompt,
          userMessage: ctxPrompt.userMessage,
        })) {
          if (event.type === "delta") {
            accumulated += event.text;

            if (!handle) {
              // First chunk → create the post now. The user sees Claude
              // appear in the thread with their first sentence already
              // visible instead of a long blank wait.
              handle = await createStreamingAgentReply(
                nodeId,
                workspaceId,
                agent.id,
                accumulated
              );
              lastFlush = Date.now();
              console.log(
                `[1.11] after(): first delta + post created (id=${handle.postId.slice(0, 8)}, ${Date.now() - t0}ms)`
              );
              continue;
            }

            const now = Date.now();
            if (now - lastFlush >= STREAM_FLUSH_INTERVAL_MS) {
              await updateStreamingAgentReply(
                handle,
                nodeId,
                workspaceId,
                accumulated
              );
              flushCount++;
              lastFlush = now;
            }
          } else if (event.type === "complete") {
            // Canonical final text — supersedes anything we accumulated, in
            // case the SDK provided trailing content not in chunk deltas.
            accumulated = event.text;
          }
        }

        if (!handle) {
          // Stream completed without yielding any text deltas (e.g. an
          // entirely empty response). Create a placeholder post so the user
          // gets feedback instead of an indefinitely-spinning indicator.
          handle = await createStreamingAgentReply(
            nodeId,
            workspaceId,
            agent.id,
            accumulated || "(Claude returned an empty response.)"
          );
        } else {
          // Final flush — ensures the last buffered tokens are visible.
          await updateStreamingAgentReply(
            handle,
            nodeId,
            workspaceId,
            accumulated
          );
          flushCount++;
        }

        console.log(
          `[1.11] after(): stream finalized ✓ for ${agent.name} (flushes=${flushCount}, chars=${accumulated.length}, total ${Date.now() - t0}ms)`
        );
      } catch (err) {
        console.error("[1.11] agent invocation failed:", err);
        // Best-effort: leave the user with what we got plus a visible error
        // marker so they don't think the indicator just vanished.
        if (handle) {
          try {
            await updateStreamingAgentReply(
              handle,
              nodeId,
              workspaceId,
              `${accumulated}\n\n_⚠️ Stream interrupted. Please try again._`
            );
          } catch {
            /* ignore — we already logged the original error */
          }
        }
      }
    });
  }
}

function ensureTargetPostInOwnThread(
  ctx: NodeContext,
  targetPost: PostRecord
): NodeContext {
  if (ctx.ownThread.some((p) => p.id === targetPost.id)) return ctx;
  return {
    ...ctx,
    ownThread: [targetPost, ...ctx.ownThread].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  };
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
