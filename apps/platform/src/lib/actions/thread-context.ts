"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateNodePosts, revalidateThreadContext } from "../cache";
import { supabase } from "../supabase";
import {
  buildContextEventMetadata,
  isContextEventMetadata,
  normalizeSourceApp,
  type ContextEventAction,
  updateContextEventMetadataAction,
} from "../thread-context";
import type {
  ContextAttachedBy,
  SourceApp,
  ThreadContextAttachmentStatus,
} from "../types";

export interface AttachThreadContextInput {
  threadId: string;
  sourceNodeId: string;
  attachedBy: ContextAttachedBy;
  reason?: string | null;
  sourcePostId?: string | null;
  sourceMessageId?: string | null;
  metadata?: Record<string, unknown>;
}

interface SourceNodeForContext {
  id: string;
  title: string;
  source_app: SourceApp | null;
}

interface ExistingAttachmentForContext {
  status: ThreadContextAttachmentStatus;
  source_post_id: string | null;
  source_message_id: string | null;
  reason: string | null;
}

interface ContextEventPostRow {
  id: string;
  metadata: Record<string, unknown> | null;
}

export async function attachThreadContext(
  input: AttachThreadContextInput
): Promise<void> {
  const actor = await getCurrentActor();
  await validateThread(input.threadId, actor.instance_id);
  const source = await getSourceNode(input.sourceNodeId, actor.instance_id);
  const existing = await getExistingAttachment(
    input.threadId,
    input.sourceNodeId
  );

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
      metadata: input.metadata ?? {},
      removed_at: null,
    },
    { onConflict: "thread_id,context_source_node_id" }
  );
  if (error) throw error;

  if (existing?.status === "active") {
    revalidateContextSurfaces(input.threadId);
    return;
  }

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
  sourceNodeId: string,
  contextEventPostId?: string
): Promise<void> {
  await updateThreadContextStatus(
    threadId,
    sourceNodeId,
    "removed",
    contextEventPostId
  );
}

export async function ignoreThreadContext(
  threadId: string,
  sourceNodeId: string,
  contextEventPostId?: string
): Promise<void> {
  await updateThreadContextStatus(
    threadId,
    sourceNodeId,
    "ignored_for_suggestions",
    contextEventPostId
  );
}

export async function allowThreadContext(
  threadId: string,
  sourceNodeId: string,
  contextEventPostId?: string
): Promise<void> {
  await updateThreadContextStatus(
    threadId,
    sourceNodeId,
    "active",
    contextEventPostId
  );
}

async function updateThreadContextStatus(
  threadId: string,
  sourceNodeId: string,
  status: ThreadContextAttachmentStatus,
  contextEventPostId?: string
): Promise<void> {
  const actor = await getCurrentActor();
  await validateThread(threadId, actor.instance_id);
  const source = await getSourceNode(sourceNodeId, actor.instance_id);
  const attachment = await getExistingAttachment(threadId, sourceNodeId);
  if (!attachment) throw new Error("Thread context attachment not found");
  if (attachment.status === status) return;

  const now = new Date().toISOString();
  const { data: updatedAttachment, error } = await supabase
    .from("thread_context_attachments")
    .update({
      status,
      removed_at: status === "active" ? null : now,
    })
    .eq("thread_id", threadId)
    .eq("context_source_node_id", sourceNodeId)
    .eq("status", attachment.status)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updatedAttachment) return;

  const eventInput = {
    threadId,
    action: contextEventActionForStatus(status),
    source,
    sourcePostId: attachment.source_post_id,
    sourceMessageId: attachment.source_message_id,
    reason: attachment.reason,
  };
  const updatedEvent = await updateContextEventPost({
    ...eventInput,
    contextEventPostId,
  });
  if (!updatedEvent) {
    await insertContextEventPost(eventInput);
  }
  revalidateContextSurfaces(threadId);
}

async function getExistingAttachment(
  threadId: string,
  sourceNodeId: string
): Promise<ExistingAttachmentForContext | null> {
  const { data, error } = await supabase
    .from("thread_context_attachments")
    .select("status,source_post_id,source_message_id,reason")
    .eq("thread_id", threadId)
    .eq("context_source_node_id", sourceNodeId)
    .maybeSingle();
  if (error) throw error;
  return data as ExistingAttachmentForContext | null;
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

async function updateContextEventPost(input: {
  threadId: string;
  action: ContextEventAction;
  source: SourceNodeForContext;
  contextEventPostId?: string | null;
  sourcePostId?: string | null;
  sourceMessageId?: string | null;
  reason?: string | null;
}): Promise<boolean> {
  const row = await findContextEventPost({
    threadId: input.threadId,
    sourceNodeId: input.source.id,
    contextEventPostId: input.contextEventPostId,
  });
  if (!row) return false;

  const baseMetadata = buildContextEventMetadata({
    action: isContextEventMetadata(row.metadata)
      ? row.metadata.action
      : input.action,
    sourceNodeId: input.source.id,
    sourceTitle: input.source.title,
    sourceApp: input.source.source_app,
    sourcePostId: input.sourcePostId,
    sourceMessageId: input.sourceMessageId,
    reason: input.reason,
  });
  const metadata = updateContextEventMetadataAction(
    baseMetadata,
    input.action
  );

  const { error } = await supabase
    .from("posts")
    .update({ metadata })
    .eq("id", row.id)
    .eq("node_id", input.threadId)
    .eq("post_type", "context_event");
  if (error) throw error;
  return true;
}

async function findContextEventPost(input: {
  threadId: string;
  sourceNodeId: string;
  contextEventPostId?: string | null;
}): Promise<ContextEventPostRow | null> {
  if (input.contextEventPostId) {
    const { data, error } = await supabase
      .from("posts")
      .select("id,metadata")
      .eq("id", input.contextEventPostId)
      .eq("node_id", input.threadId)
      .eq("post_type", "context_event")
      .maybeSingle();
    if (error) throw error;

    const row = data as ContextEventPostRow | null;
    if (
      row &&
      isContextEventMetadata(row.metadata) &&
      row.metadata.source_node_id === input.sourceNodeId
    ) {
      return row;
    }
  }

  const { data, error } = await supabase
    .from("posts")
    .select("id,metadata")
    .eq("node_id", input.threadId)
    .eq("post_type", "context_event")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const rows = (data ?? []) as ContextEventPostRow[];
  return (
    rows.find(
      (row) =>
        isContextEventMetadata(row.metadata) &&
        row.metadata.source_node_id === input.sourceNodeId
    ) ?? null
  );
}

function contextEventActionForStatus(
  status: ThreadContextAttachmentStatus
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
