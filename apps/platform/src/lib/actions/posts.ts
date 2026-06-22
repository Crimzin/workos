"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import { getAgentSettings } from "../agent-settings";
import { DEFAULT_AI_STANDARDS } from "../ai-standards";
import { getEffectiveAIStandards } from "../ai-standards-server";
import { revalidateNodePosts, revalidateWorkspaceFeed } from "../cache";
import { recordWorkOSEvent } from "../events";
import {
  getNodePosts,
  getPostReactionSummaries,
  type PostRecord,
} from "../posts";
import {
  isValidReactionEmoji,
  type PostReactionSummary,
} from "../post-reactions";
import { findAgentMentions, type MentionedAgent } from "../agents/mention-detection";
import { buildRequestedAgentMentions } from "../agents/response-selection";
import {
  plainTextFromBody,
  type NodeContext,
} from "../agents/node-context";
import { renderClaudePrompt } from "../agents/claude-prompt";
import { streamClaude } from "../agents/claude";
import {
  modelSelectionMetadata,
  providerKeyForResponderName,
  resolveDefaultModelFromConfig,
  resolveModelSelection,
  type AgentModelSelection,
  type AgentModelSelectionInput,
} from "../agents/model-selection";
import {
  createStreamingAgentReply,
  updateStreamingAgentReply,
  type StreamingReplyHandle,
} from "../agents/reply-poster";
import { agentInvocationFailureReply } from "../agents/invocation-error";
import { routeAgentMentions } from "../agents/router";
import { isAgentRunConfirmation } from "../agents/confirmation";
import { queueAwaitingRunsForConfirmation } from "../agents/runs";
import { processNextQueuedAgentRun } from "../agents/worker";

/**
 * Server action used by the 1.11 streaming-agent polling effect. Returns the
 * latest posts for a node directly from Supabase — `getNodePosts` is
 * deliberately uncached (see the docstring there for rationale).
 */
export async function pollNodePosts(nodeId: string): Promise<PostRecord[]> {
  const actor = await getCurrentActor();
  return getNodePosts(nodeId, actor.id);
}

/** Cadence at which we flush the accumulated streaming text to Supabase
 *  during an agent reply. Balances perceived latency against DB write rate.
 *  At 400ms + the client's 750ms poll cadence the user sees new text every
 *  ~1.2s on average — close enough to feel real-time. */
const STREAM_FLUSH_INTERVAL_MS = 400;

async function getNodeInstanceId(nodeId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nodes")
    .select("instance_id")
    .eq("id", nodeId)
    .single();
  if (error) throw error;
  return data.instance_id as string;
}

export async function createPost(
  nodeId: string,
  workspaceId: string,
  body: string,
  options: {
    requestAgentResponse?: boolean;
    selectedAgent?: MentionedAgent | null;
    modelSelection?: AgentModelSelectionInput | null;
  } = {}
): Promise<void> {
  console.log(
    `[1.11] createPost ENTER nodeId=${nodeId.slice(0, 8)} bodyChars=${body.length}`
  );
  const trimmed = body.trim();
  if (!trimmed) return;
  const actor = await getCurrentActor();
  const plainText = plainTextFromBody(trimmed);
  const mentionedAgents = findAgentMentions(trimmed);
  const selectedProviderKey =
    options.modelSelection?.providerKey ??
    (options.selectedAgent
      ? providerKeyForResponderName(options.selectedAgent.name)
      : mentionedAgents.length === 1
        ? providerKeyForResponderName(mentionedAgents[0].name)
      : "inline_claude");
  const mayRequestAgent =
    (options.requestAgentResponse ?? false) || mentionedAgents.length > 0;
  const agentSettings = mayRequestAgent
    ? await getAgentSettings(actor.instance_id)
    : null;
  const selectedProviderSettings = agentSettings?.providers.find(
    (provider) => provider.provider_key === selectedProviderKey
  );
  const modelSelection = options.modelSelection
    ? resolveModelSelection(selectedProviderKey, options.modelSelection)
    : resolveDefaultModelFromConfig(
        selectedProviderKey,
        selectedProviderSettings?.config
      );
  const postMetadata =
    mayRequestAgent && modelSelection
      ? { agent_request: modelSelectionMetadata(modelSelection) }
      : {};

  const { data: insertedPost, error } = await supabase
    .from("posts")
    .insert({
      node_id: nodeId,
      actor_id: actor.id,
      post_type: "post",
      body: trimmed,
      metadata: postMetadata,
    })
    .select(
      "id,node_id,actor_id,post_type,body,metadata,pinned,pinned_at,created_at,updated_at"
    )
    .single();
  if (error) throw error;

  const targetPost: PostRecord = {
    ...insertedPost,
    actor: { id: actor.id, name: actor.name, kind: "human" },
    reactions: [],
  } as PostRecord;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.created",
    subjectType: "post",
    subjectId: insertedPost.id,
    summary: `${actor.name} posted in this thread.`,
    metadata: {
      post_type: "post",
      body_preview: plainText.slice(0, 240),
      requested_agent_response: mayRequestAgent,
    },
    occurredAt: insertedPost.created_at,
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);

  const confirmationAgentIds =
    mentionedAgents.length > 0
      ? mentionedAgents.map((agent) => agent.id)
      : options.selectedAgent
        ? [options.selectedAgent.id]
        : [];

  if (isAgentRunConfirmation(plainText)) {
    try {
      const queued = await queueAwaitingRunsForConfirmation({
        nodeId,
        workspaceId,
        requesterActorId: actor.id,
        confirmationPostId: targetPost.id,
        agentActorIds: confirmationAgentIds,
      });
      if (queued > 0) {
        after(async () => {
          await processNextQueuedAgentRun();
        });
        return;
      }
    } catch (err) {
      console.error("[agent-runtime] confirmation failed:", err);
    }
    return;
  }

  const mentions = buildRequestedAgentMentions({
    requestAgentResponse: options.requestAgentResponse ?? false,
    mentionedAgents,
    selectedAgent: options.selectedAgent ?? null,
  });
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
      modelSelection,
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
      scheduleInlineClaude: (agent, ctxPrompt, selectedModel) => {
        console.log(
          `[1.11] createPost: scheduling after() for ${agent.name}(${agent.id.slice(0, 8)}) model=${selectedModel?.modelId ?? "default"}`
        );
        after(async () => {
          await streamInlineClaudeReply({
            agent,
            nodeId,
            workspaceId,
            ctxPrompt,
            modelSelection: selectedModel,
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
  modelSelection: AgentModelSelection | null;
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
      attachments: input.ctxPrompt.attachments,
      model: input.modelSelection?.modelId,
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

    if (handle) {
      const instanceId = await getNodeInstanceId(input.nodeId);
      await recordWorkOSEvent({
        instanceId,
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
        actorId: input.agent.id,
        eventType: "agent.reply_completed",
        subjectType: "post",
        subjectId: handle.postId,
        summary: `${input.agent.name} completed an AI reply.`,
        metadata: {
          flush_count: flushCount,
          body_preview: accumulated.slice(0, 240),
        },
      });
    }

    console.log(
      `[1.11] after(): stream finalized ✓ for ${input.agent.name} (flushes=${flushCount}, chars=${accumulated.length}, total ${Date.now() - t0}ms)`
    );
  } catch (err) {
    console.error("[1.11] agent invocation failed:", err);
    // Best-effort: always leave a visible post. Provider failures before the
    // first streamed token otherwise look like an infinite thinking state.
    const failureReply = agentInvocationFailureReply(accumulated, err);
    try {
      if (handle) {
        await updateStreamingAgentReply(
          handle,
          input.nodeId,
          input.workspaceId,
          failureReply
        );
      } else {
        handle = await createStreamingAgentReply(
          input.nodeId,
          input.workspaceId,
          input.agent.id,
          failureReply,
          { recordStarted: false }
        );
      }
    } catch {
      /* ignore — we already logged the original error */
    }
    if (handle) {
      const instanceId = await getNodeInstanceId(input.nodeId);
      await recordWorkOSEvent({
        instanceId,
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
        actorId: input.agent.id,
        eventType: "agent.reply_failed",
        subjectType: "post",
        subjectId: handle.postId,
        summary: `${input.agent.name} failed to complete an AI reply.`,
        metadata: { body_preview: failureReply.slice(0, 240) },
      });
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

  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("posts")
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.updated",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} updated a post in this thread.`,
    metadata: { body_preview: plainTextFromBody(trimmed).slice(0, 240) },
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function deletePost(
  postId: string,
  nodeId: string,
  workspaceId: string
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.deleted",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} deleted a post from this thread.`,
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function pinPost(
  postId: string,
  nodeId: string,
  workspaceId: string,
  pinned: boolean
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("posts")
    .update({
      pinned,
      pinned_at: pinned ? new Date().toISOString() : null,
    })
    .eq("id", postId);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: pinned ? "post.pinned" : "post.unpinned",
    subjectType: "post",
    subjectId: postId,
    summary: pinned
      ? `${actor.name} pinned a post in this thread.`
      : `${actor.name} unpinned a post in this thread.`,
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}

export async function togglePostReaction(
  postId: string,
  nodeId: string,
  workspaceId: string,
  emoji: string
): Promise<PostReactionSummary[]> {
  const normalizedEmoji = emoji.trim();
  if (!isValidReactionEmoji(normalizedEmoji)) {
    throw new Error("Invalid reaction emoji.");
  }

  const actor = await getCurrentActor();
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id,post_type")
    .eq("id", postId)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (postError) throw postError;
  if (!post || post.post_type !== "post") {
    throw new Error("Reactions are only available on normal posts.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("actor_id", actor.id)
    .eq("emoji", normalizedEmoji)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("post_reactions").insert({
      post_id: postId,
      actor_id: actor.id,
      emoji: normalizedEmoji,
    });
    if (error) throw error;
  }

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: existing ? "post.reaction_removed" : "post.reaction_added",
    subjectType: "post",
    subjectId: postId,
    summary: existing
      ? `${actor.name} removed a reaction from a post.`
      : `${actor.name} reacted to a post.`,
    metadata: { emoji: normalizedEmoji },
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  return getPostReactionSummaries(postId, actor.id);
}
