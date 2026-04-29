"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateNodeMemoryPrimitives } from "../cache";
import { statusForPrimitiveType } from "../memory-primitives";
import { supabase } from "../supabase";
import type { MemoryPrimitiveType } from "../types";

interface PrimitiveInput {
  nodeId: string;
  workspaceId: string;
  type: MemoryPrimitiveType;
  statement: string;
  body?: string | null;
  status?: string;
  sourcePostId?: string | null;
  sourceLabel?: string | null;
  externalEpisodeId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createMemoryPrimitive(
  input: PrimitiveInput
): Promise<void> {
  const statement = input.statement.trim();
  if (!statement) return;

  const actor = await getCurrentActor();
  const status = input.status ?? statusForPrimitiveType(input.type);

  const { error } = await supabase.from("memory_primitives").insert({
    instance_id: actor.instance_id,
    node_id: input.nodeId,
    type: input.type,
    statement,
    body: input.body?.trim() || null,
    status,
    conviction: 1,
    metadata: input.metadata ?? {},
    source_post_id: input.sourcePostId ?? null,
    source_label: input.sourceLabel?.trim() || null,
    external_episode_id: input.externalEpisodeId?.trim() || null,
    created_by_actor_id: actor.id,
  });
  if (error) throw error;

  revalidateNodeMemoryPrimitives(input.nodeId);
  revalidatePath(`/n/${input.workspaceId}`);
}

export async function updateMemoryPrimitive(
  primitiveId: string,
  nodeId: string,
  workspaceId: string,
  updates: {
    statement?: string;
    body?: string | null;
    status?: string;
    sourceLabel?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {};

  if (updates.statement !== undefined) {
    const statement = updates.statement.trim();
    if (!statement) return;
    payload.statement = statement;
  }
  if (updates.body !== undefined) payload.body = updates.body?.trim() || null;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.sourceLabel !== undefined) {
    payload.source_label = updates.sourceLabel?.trim() || null;
  }
  if (updates.metadata !== undefined) payload.metadata = updates.metadata;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("memory_primitives")
    .update(payload)
    .eq("id", primitiveId);
  if (error) throw error;

  revalidateNodeMemoryPrimitives(nodeId);
  revalidatePath(`/n/${workspaceId}`);
}

export async function deleteMemoryPrimitive(
  primitiveId: string,
  nodeId: string,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase
    .from("memory_primitives")
    .delete()
    .eq("id", primitiveId);
  if (error) throw error;

  revalidateNodeMemoryPrimitives(nodeId);
  revalidatePath(`/n/${workspaceId}`);
}
