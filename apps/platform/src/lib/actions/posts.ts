"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import { DEFAULT_AI_STANDARDS } from "../ai-standards";
import { getEffectiveAIStandards } from "../ai-standards-server";
import { revalidateNodePosts, revalidateWorkspaceFeed } from "../cache";
import { getNodePosts, type PostRecord } from "../posts";
import { findAgentMentions, type MentionedAgent } from "../agents/mention-detection";
import {
  plainTextFromBody,
  type NodeContext,
} from "../agents/node-context";
import { renderClaudePrompt } from "../agents/claude-prompt";
import { streamClaude } from "../agents/claude";
import {
  createStreamingAgentReply,
  updateStreamingAgentReply,
  type StreamingReplyHandle,
} from "../agents/reply-poster";
import { routeAgentMentions } from "../agents/router";
import { isAgentRunConfirmation } from "../agents/confirmation";
import { queueAwaitingRunsForConfirmation } from "../agents/runs";

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

  const plainText = plainTextFromBody(trimmed);
  if (isAgentRunConfirmation(plainText)) {
    try {
      const queued = await queueAwaitingRunsForConfirmation({
        nodeId,
        workspaceId,
        requesterActorId: actor.id,
        confirmationPostId: targetPost.id,
      });
      if (queued > 0) return;
    } catch (err) {
      console.error("[agent-runtime] confirmation failed:", err);
    }
  }

  const mentions = findAgentMentions(trimmed);
  console.log(
    `[1.11] createPost: detected ${mentions.length} agent mention(s)`,
    mentions.map((m) => `${m.name}(${m.id.slice(0, 8)})`)
  );

  if (mentions.length === 0) return;

  const standards = await getEffectiveAIStandards(actor.instance_id).catch(
    (err) => {
      console.error("[1.11] ai standards fallback:", err);
      return DEFAULT_AI_STANDARDS;
    }
  );
  try {
    await routeAgentMentions({
      mentions,
      actor,
      nodeId,
      workspaceId,
      targetPost,
      renderClaudePromptForContext: (ctx) => {
        const targetAwareCtx = ensureTargetPostInOwnThread(ctx, targetPost);
        console.log(
          `[1.11] context gathered (own=${targetAwareCtx.ownThread.length} parent=${targetAwareCtx.parentThread ? targetAwareCtx.parentThread.posts.length : 0} siblings=${targetAwareCtx.siblingThreads.length} children=${targetAwareCtx.childThreads.length}, standards=${standards.length})`
        );
        const prompt = renderClaudePrompt(targetAwareCtx, {
          targetPostId: targetPost.id,
          standards,
        });
        console.log(
          `[1.11] claude prompt rendered (system=${prompt.systemPrompt.length}c, user=${prompt.userMessage.length}c)`
        );
        return prompt;
      },
      scheduleInlineClaude: (agent, ctxPrompt) => {
        console.log(
          `[1.11] createPost: scheduling after() for ${agent.name}(${agent.id.slice(0, 8)})`
        );
        after(async () => {
          await streamInlineClaudeReply({
            agent,
            nodeId,
            workspaceId,
            ctxPrompt,
          });
        });
      },
    });
  } catch (err) {
    console.error("[1.11] agent mention routing failed:", err);
  }
}

async function streamInlineClaudeReply(input: {
  agent: MentionedAgent;
  nodeId: string;
  workspaceId: string;
  ctxPrompt: ReturnType<typeof renderClaudePrompt>;
}): Promise<void> {
  const t0 = Date.now();
  console.log(`[1.11] after(): START for ${input.agent.name}`);

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
      systemPrompt: input.ctxPrompt.systemPrompt,
      userMessage: input.ctxPrompt.userMessage,
    })) {
      if (event.type === "delta") {
        accumulated += event.text;

        if (!handle) {
          // First chunk → create the post now. The user sees Claude
          // appear in the thread with their first sentence already
          // visible instead of a long blank wait.
          handle = await createStreamingAgentReply(
            input.nodeId,
            input.workspaceId,
            input.agent.id,
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
            input.nodeId,
            input.workspaceId,
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
        input.nodeId,
        input.workspaceId,
        input.agent.id,
        accumulated || "(Claude returned an empty response.)"
      );
    } else {
      // Final flush — ensures the last buffered tokens are visible.
      await updateStreamingAgentReply(
        handle,
        input.nodeId,
        input.workspaceId,
        accumulated
      );
      flushCount++;
    }

    console.log(
      `[1.11] after(): stream finalized ✓ for ${input.agent.name} (flushes=${flushCount}, chars=${accumulated.length}, total ${Date.now() - t0}ms)`
    );
  } catch (err) {
    console.error("[1.11] agent invocation failed:", err);
    // Best-effort: leave the user with what we got plus a visible error
    // marker so they don't think the indicator just vanished.
    if (handle) {
      try {
        await updateStreamingAgentReply(
          handle,
          input.nodeId,
          input.workspaceId,
          `${accumulated}\n\n_⚠️ Stream interrupted. Please try again._`
        );
      } catch {
        /* ignore — we already logged the original error */
      }
    }
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
