// Inserts an agent's reply as a post in the same thread, authored by the
// agent actor. Renders the reply text from Markdown → BlockNote JSON so that
// **bold**, *italic*, `code`, headings, lists and links display correctly in
// the post viewer. Falls back to a single paragraph for empty input.

import { supabase } from "../supabase";
import { revalidateNodePosts, revalidateWorkspaceFeed } from "../cache";
import { recordWorkOSEvent } from "../events";
import { revalidatePath } from "next/cache";
import { markdownToBlockNote } from "./markdown-to-blocknote";

async function getNodeInstanceId(nodeId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nodes")
    .select("instance_id")
    .eq("id", nodeId)
    .single();
  if (error) throw error;
  return data.instance_id as string;
}

export async function postAgentReply(
  nodeId: string,
  workspaceId: string,
  agentActorId: string,
  text: string
): Promise<void> {
  const blocks = markdownToBlockNote(text);
  const body = JSON.stringify(blocks);

  const { data, error } = await supabase
    .from("posts")
    .insert({
      node_id: nodeId,
      actor_id: agentActorId,
      post_type: "post",
      body,
    })
    .select("id,created_at")
    .single();
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: await getNodeInstanceId(nodeId),
    workspaceId,
    nodeId,
    actorId: agentActorId,
    eventType: "agent.reply_completed",
    subjectType: "post",
    subjectId: data.id as string,
    summary: "AI reply completed.",
    metadata: { body_preview: text.slice(0, 240), mode: "single_insert" },
    occurredAt: data.created_at as string,
  });

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

// ---------------------------------------------------------------------------
// Streaming variant — used by 1.11 Inline AI so Claude's reply appears
// incrementally instead of all-at-once after a 60s+ wait.
//
// Flow:
//   1. Caller waits for Claude's first chunk, then calls `createStreamingAgentReply`
//      to insert a post containing that first chunk. The post is visible
//      immediately via revalidation.
//   2. As more chunks arrive, the caller batches them (every ~400ms) and
//      calls `updateStreamingAgentReply` to update the post body in-place.
//   3. After the stream completes, one final `updateStreamingAgentReply` is
//      called with the full text to ensure no truncation.
// ---------------------------------------------------------------------------

export interface StreamingReplyHandle {
  postId: string;
}

export interface CreateStreamingAgentReplyOptions {
  recordStarted?: boolean;
}

/**
 * Insert a brand-new agent reply post seeded with `initialText`. Returns a
 * handle the caller uses with `updateStreamingAgentReply` to keep updating
 * the same post as more text streams in. Set `recordStarted: false` only for
 * terminal failure posts that did not actually begin streaming.
 */
export async function createStreamingAgentReply(
  nodeId: string,
  workspaceId: string,
  agentActorId: string,
  initialText: string,
  options: CreateStreamingAgentReplyOptions = { recordStarted: true }
): Promise<StreamingReplyHandle> {
  const body = JSON.stringify(markdownToBlockNote(initialText));

  const { data, error } = await supabase
    .from("posts")
    .insert({
      node_id: nodeId,
      actor_id: agentActorId,
      post_type: "post",
      body,
    })
    .select("id,created_at")
    .single();
  if (error) throw error;

  if (options.recordStarted ?? true) {
    await recordWorkOSEvent({
      instanceId: await getNodeInstanceId(nodeId),
      workspaceId,
      nodeId,
      actorId: agentActorId,
      eventType: "agent.reply_started",
      subjectType: "post",
      subjectId: data.id as string,
      summary: "AI reply started.",
      metadata: { body_preview: initialText.slice(0, 240), mode: "streaming" },
      occurredAt: data.created_at as string,
    });
  }

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);

  return { postId: data.id as string };
}

/**
 * Update an in-flight streaming reply's body with the full accumulated text
 * so far. We re-render markdown→BlockNote each flush; cheap relative to the
 * Supabase round-trip. Revalidates the posts cache so the next client poll
 * picks up the new body.
 */
export async function updateStreamingAgentReply(
  handle: StreamingReplyHandle,
  nodeId: string,
  workspaceId: string,
  fullText: string
): Promise<void> {
  const body = JSON.stringify(markdownToBlockNote(fullText));

  const { error } = await supabase
    .from("posts")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", handle.postId);
  if (error) throw error;

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
}
