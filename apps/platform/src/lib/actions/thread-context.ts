"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateNodePosts, revalidateThreadContext } from "../cache";
import { supabase } from "../supabase";
import {
  buildContextEventMetadata,
  normalizeSourceApp,
  type ContextEventAction,
} from "../thread-context";
import type { ContextAttachedBy, SourceApp } from "../types";

export interface AttachThreadContextInput {
  threadId: string;
  sourceNodeId: string;
  attachedBy: ContextAttachedBy;
  reason?: string | null;
  sourcePostId?: string | null;
  sourceMessageId?: string | null;
}

interface SourceNodeForContext {
  id: string;
  title: string;
  source_app: SourceApp | null;
}

export async function attachThreadContext(
  input: AttachThreadContextInput
): Promise<void> {
  const actor = await getCurrentActor();
  await validateThread(input.threadId, actor.instance_id);
  const source = await getSourceNode(input.sourceNodeId, actor.instance_id);

  const { error } = await supabase.from("thread_context_attachments").upsert(
    {
      instance_id: actor.instance_id,
      thread_id: input.threadId,
      context_source_node_id: input.sourceNodeId,
      attached_by: input.attachedBy,
      status: "active",
      reason: input.reason ?? null,
      source_post_id: input.sourcePostId ?? null,
      source_message_id: input.sourceMessageId ?? null,
      removed_at: null,
    },
    { onConflict: "thread_id,context_source_node_id" }
  );
  if (error) throw error;

  await insertContextEventPost({
    threadId: input.threadId,
    action: "attached",
    source,
    sourcePostId: input.sourcePostId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    reason: input.reason ?? null,
  });
  revalidateContextSurfaces(input.threadId);
}

export async function removeThreadContext(
  threadId: string,
  sourceNodeId: string
): Promise<void> {
  await updateThreadContextStatus(threadId, sourceNodeId, "removed");
}

export async function ignoreThreadContext(
  threadId: string,
  sourceNodeId: string
): Promise<void> {
  await updateThreadContextStatus(
    threadId,
    sourceNodeId,
    "ignored_for_suggestions"
  );
}

export async function allowThreadContext(
  threadId: string,
  sourceNodeId: string
): Promise<void> {
  await updateThreadContextStatus(threadId, sourceNodeId, "active");
}

async function updateThreadContextStatus(
  threadId: string,
  sourceNodeId: string,
  status: "active" | "removed" | "ignored_for_suggestions"
): Promise<void> {
  const actor = await getCurrentActor();
  await validateThread(threadId, actor.instance_id);
  const source = await getSourceNode(sourceNodeId, actor.instance_id);
  const now = new Date().toISOString();
  const { data: attachment, error } = await supabase
    .from("thread_context_attachments")
    .update({
      status,
      removed_at: status === "active" ? null : now,
    })
    .eq("thread_id", threadId)
    .eq("context_source_node_id", sourceNodeId)
    .select("source_post_id,source_message_id,reason")
    .maybeSingle();
  if (error) throw error;
  if (!attachment) throw new Error("Thread context attachment not found");

  await insertContextEventPost({
    threadId,
    action: contextEventActionForStatus(status),
    source,
    sourcePostId: attachment.source_post_id,
    sourceMessageId: attachment.source_message_id,
    reason: attachment.reason,
  });
  revalidateContextSurfaces(threadId);
}

async function validateThread(
  threadId: string,
  instanceId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id")
    .eq("id", threadId)
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Thread not found");
}

async function getSourceNode(
  sourceNodeId: string,
  instanceId: string
): Promise<SourceNodeForContext> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id,title,source_app")
    .eq("id", sourceNodeId)
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Context source not found");

  return {
    id: data.id as string,
    title: data.title as string,
    source_app: normalizeSourceApp(data.source_app),
  };
}

async function insertContextEventPost(input: {
  threadId: string;
  action: ContextEventAction;
  source: SourceNodeForContext;
  sourcePostId?: string | null;
  sourceMessageId?: string | null;
  reason?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("posts").insert({
    node_id: input.threadId,
    actor_id: null,
    post_type: "context_event",
    body: null,
    metadata: buildContextEventMetadata({
      action: input.action,
      sourceNodeId: input.source.id,
      sourceTitle: input.source.title,
      sourceApp: input.source.source_app,
      sourcePostId: input.sourcePostId,
      sourceMessageId: input.sourceMessageId,
      reason: input.reason,
    }),
  });
  if (error) throw error;
}

function contextEventActionForStatus(
  status: "active" | "removed" | "ignored_for_suggestions"
): ContextEventAction {
  if (status === "removed") return "removed";
  if (status === "ignored_for_suggestions") return "ignored";
  return "allowed";
}

function revalidateContextSurfaces(threadId: string): void {
  revalidateThreadContext(threadId);
  revalidateNodePosts(threadId);
  revalidatePath(`/n/${threadId}`);
}
