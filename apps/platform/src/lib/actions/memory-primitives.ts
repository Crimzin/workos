"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import {
  revalidateAnswerTraces,
  revalidateNodeMemoryPrimitives,
  revalidateThreadContext,
  revalidateThreadContextSheet,
  revalidateThreadSurface,
  revalidateWorkingModel,
} from "../cache";
import { statusForPrimitiveType } from "../memory-primitives";
import { supabase } from "../supabase";
import type { MemoryPrimitiveType } from "../types";
import { correctWorkingModelClaim } from "./working-model";

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
  const tentative = status === "untested" || status === "tentative";
  const now = new Date().toISOString();

  const { data: primitive, error } = await supabase
    .from("memory_primitives")
    .insert({
      instance_id: actor.instance_id,
      node_id: input.nodeId,
      type: input.type,
      statement,
      body: input.body?.trim() || null,
      status,
      conviction: tentative ? 0.45 : 0.9,
      extraction_mode: "user_authored",
      conviction_posture: tentative ? "ask" : "assert",
      conviction_factors: [
        {
          code: "user_authored",
          direction: "supports",
          explanation: "A person added this directly in WorkOS.",
          evidence_refs: [],
        },
      ],
      last_confirmed_at: now,
      metadata: input.metadata ?? {},
      source_post_id: input.sourcePostId ?? null,
      source_label: input.sourceLabel?.trim() || "Current WorkOS thread",
      external_episode_id: input.externalEpisodeId?.trim() || null,
      created_by_actor_id: actor.id,
      updated_by_actor_id: actor.id,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: evidenceError } = await supabase
    .from("memory_primitive_evidence")
    .insert({
      instance_id: actor.instance_id,
      memory_primitive_id: primitive.id,
      relation: "extracted_from",
      source_kind: "user_authored_memory",
      source_app: "workos",
      source_node_id: input.nodeId,
      source_post_id: input.sourcePostId ?? null,
      excerpt: statement.slice(0, 280),
      actor_id: actor.id,
      observed_at: now,
      human_signal: "explicit_statement",
      authority_snapshot: {
        actor_id: actor.id,
        source: "direct_workos_edit",
      },
    });
  if (evidenceError) {
    await supabase.from("memory_primitives").delete().eq("id", primitive.id);
    throw evidenceError;
  }

  revalidateMemoryMutation(input.nodeId, input.workspaceId);
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
  const actor = await getCurrentActor();
  const { data: existing, error: readError } = await supabase
    .from("memory_primitives")
    .select("id,instance_id,node_id,type,statement,body,status")
    .eq("id", primitiveId)
    .maybeSingle();
  if (readError) throw readError;
  if (
    !existing ||
    existing.instance_id !== actor.instance_id ||
    existing.node_id !== nodeId
  ) {
    throw new Error("This memory item is no longer available in this thread.");
  }

  const payload: Record<string, unknown> = {};
  let targetPrimitiveId = primitiveId;
  const replacementStatement =
    updates.statement === undefined
      ? existing.statement
      : updates.statement.trim();
  if (!replacementStatement) return;
  const replacementBody =
    updates.body === undefined ? existing.body : updates.body?.trim() || null;
  const statementChanged = replacementStatement !== existing.statement;
  const bodyChanged = replacementBody !== existing.body;
  const replacementStatus = updates.status ?? existing.status;
  const statusChanged = replacementStatus !== existing.status;
  const retractRequested =
    statusChanged &&
    ["invalidated", "reversed", "retracted", "superseded"].includes(
      replacementStatus
    );

  if (retractRequested) {
    await correctWorkingModelClaim({
      claimId: primitiveId,
      threadId: nodeId,
      workspaceId,
      replacementStatement: null,
      reason: `Marked ${replacementStatus} from the legacy Memory editor.`,
    });
    return;
  }

  const rationaleMaterialChanged =
    existing.type === "rationale" && (statementChanged || bodyChanged);
  if (rationaleMaterialChanged) {
    const { error: rationaleError } = await supabase.rpc(
      "rpc_audit_legacy_rationale_update",
      {
        p_claim_id: primitiveId,
        p_actor_id: actor.id,
        p_workspace_id: workspaceId,
        p_replacement_statement: replacementStatement,
        p_replacement_body: replacementBody,
        p_reason: "Updated from the legacy Memory editor.",
      }
    );
    if (rationaleError) throw rationaleError;
  }

  const materialChanged =
    existing.type !== "rationale" &&
    (statementChanged || bodyChanged || statusChanged);

  if (materialChanged) {
    const correction = await correctWorkingModelClaim({
      claimId: primitiveId,
      threadId: nodeId,
      workspaceId,
      replacementStatement,
      ...(bodyChanged ? { replacementBody } : {}),
      ...(statusChanged ? { replacementStatus } : {}),
      reason: "Updated from the legacy Memory editor.",
    });
    if (!correction.replacementClaimId) {
      throw new Error("The edited memory did not create a replacement belief.");
    }
    targetPrimitiveId = correction.replacementClaimId;
  }
  if (
    updates.body !== undefined &&
    !materialChanged &&
    !rationaleMaterialChanged
  ) {
    payload.body = replacementBody;
  }
  if (updates.sourceLabel !== undefined) {
    payload.source_label = updates.sourceLabel?.trim() || null;
  }
  if (updates.metadata !== undefined) payload.metadata = updates.metadata;

  if (Object.keys(payload).length === 0) {
    if (rationaleMaterialChanged) {
      revalidateMemoryMutation(nodeId, workspaceId);
    }
    return;
  }

  const { error } = await supabase
    .from("memory_primitives")
    .update(payload)
    .eq("id", targetPrimitiveId)
    .eq("instance_id", actor.instance_id)
    .eq("node_id", nodeId);
  if (error) throw error;

  revalidateMemoryMutation(nodeId, workspaceId);
}

export async function deleteMemoryPrimitive(
  primitiveId: string,
  nodeId: string,
  workspaceId: string
): Promise<void> {
  await correctWorkingModelClaim({
    claimId: primitiveId,
    threadId: nodeId,
    workspaceId,
    replacementStatement: null,
    reason: "Removed from the legacy Memory editor.",
  });

  revalidateMemoryMutation(nodeId, workspaceId);
}

function revalidateMemoryMutation(nodeId: string, workspaceId: string) {
  revalidateNodeMemoryPrimitives(nodeId);
  revalidateWorkingModel(nodeId);
  revalidateThreadContext(nodeId);
  revalidateThreadContextSheet(nodeId);
  revalidateAnswerTraces(nodeId);
  revalidateThreadSurface(nodeId);
  revalidatePath(`/n/${workspaceId}`);
}
