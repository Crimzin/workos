"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import {
  revalidateAnswerTraces,
  revalidateClaim,
  revalidateNodeMemoryPrimitives,
  revalidateReasonTrace,
  revalidateThreadContext,
  revalidateThreadContextSheet,
  revalidateThreadSurface,
  revalidateWorkingModel,
} from "../cache";
import { recordWorkOSEvent } from "../events";
import { supabase } from "../supabase";
import {
  getThreadContextSheet,
  upsertThreadContextSheetRecord,
} from "../thread-context-sheet";
import {
  buildClearWorkingModelOverrideUpdate,
  buildCorrectedThreadSheetUpdate,
  buildCorrectWorkingModelClaimRpcArgs,
  buildWorkingModelExclusionInsert,
} from "./working-model-payloads";

export async function correctWorkingModelClaim(input: {
  claimId: string;
  threadId: string;
  workspaceId: string;
  replacementStatement?: string | null;
  replacementBody?: string | null;
  replacementStatus?: string | null;
  reason: string;
}): Promise<{ replacementClaimId: string | null }> {
  const actor = await getCurrentActor();
  const claim = await getClaimForMutation(input.claimId, input.threadId);
  if (claim.instance_id !== actor.instance_id) {
    throw new Error("This belief belongs to another WorkOS instance.");
  }

  const args = buildCorrectWorkingModelClaimRpcArgs({
    claimId: input.claimId,
    actorId: actor.id,
    workspaceId: input.workspaceId,
    replacementStatement: input.replacementStatement,
    replacementBody: input.replacementBody,
    replacementStatus: input.replacementStatus,
    reason: input.reason,
  });
  const { data, error } = await supabase.rpc(
    "rpc_correct_memory_primitive",
    args
  );
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  const replacementClaimId =
    result && typeof result.replacement_claim_id === "string"
      ? result.replacement_claim_id
      : null;
  const now = new Date().toISOString();
  await syncThreadSheetCorrection({
    instanceId: actor.instance_id,
    threadId: input.threadId,
    claimId: input.claimId,
    replacementClaimId,
    previousStatement: claim.statement,
    replacementStatement: args.p_replacement_statement,
    now,
  });

  await revalidateHistoricalTraceDiffs(input.threadId);

  revalidateWorkingModelMutation(
    input.threadId,
    input.workspaceId,
    input.claimId,
    replacementClaimId
  );
  return { replacementClaimId };
}

export async function excludeWorkingModelClaimHere(input: {
  claimId: string;
  threadId: string;
  workspaceId: string;
  reason: string;
}): Promise<{ overrideId: string }> {
  const actor = await getCurrentActor();
  const claim = await getClaimForMutation(input.claimId, input.threadId);
  if (claim.instance_id !== actor.instance_id) {
    throw new Error("This belief belongs to another WorkOS instance.");
  }

  const existing = await findActiveOverride(input.threadId, input.claimId);
  if (existing) return { overrideId: existing };

  const payload = buildWorkingModelExclusionInsert({
    instanceId: actor.instance_id,
    threadId: input.threadId,
    claimId: input.claimId,
    actorId: actor.id,
    reason: input.reason,
  });
  const { data, error } = await supabase
    .from("context_retrieval_overrides")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const duplicate = await findActiveOverride(input.threadId, input.claimId);
      if (duplicate) return { overrideId: duplicate };
    }
    throw error;
  }

  const overrideId = String(data.id);
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId: input.workspaceId,
    nodeId: input.threadId,
    actorId: actor.id,
    eventType: "context.excluded",
    subjectType: "context_retrieval_override",
    subjectId: overrideId,
    summary: `${actor.name} marked a belief as not relevant here.`,
    metadata: { claim_id: input.claimId, directive: "exclude" },
  });

  revalidateWorkingModelMutation(
    input.threadId,
    input.workspaceId,
    input.claimId,
    null
  );
  return { overrideId };
}

export async function clearWorkingModelOverride(input: {
  overrideId: string;
  threadId: string;
  workspaceId: string;
}): Promise<void> {
  const actor = await getCurrentActor();
  const { data: override, error: readError } = await supabase
    .from("context_retrieval_overrides")
    .select("id,instance_id,thread_id,target_id,cleared_at")
    .eq("id", input.overrideId)
    .maybeSingle();
  if (readError) throw readError;
  if (!override || override.thread_id !== input.threadId) {
    throw new Error("This relevance override is no longer available.");
  }
  if (override.instance_id !== actor.instance_id) {
    throw new Error("This relevance override belongs to another WorkOS instance.");
  }
  if (override.cleared_at) return;

  const { error } = await supabase
    .from("context_retrieval_overrides")
    .update(buildClearWorkingModelOverrideUpdate(actor.id, new Date().toISOString()))
    .eq("id", input.overrideId)
    .is("cleared_at", null);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId: input.workspaceId,
    nodeId: input.threadId,
    actorId: actor.id,
    eventType: "context.override_cleared",
    subjectType: "context_retrieval_override",
    subjectId: input.overrideId,
    summary: `${actor.name} restored a belief to this thread's context.`,
    metadata: { claim_id: override.target_id },
  });

  revalidateWorkingModelMutation(
    input.threadId,
    input.workspaceId,
    String(override.target_id),
    null
  );
}

async function getClaimForMutation(claimId: string, threadId: string) {
  const { data, error } = await supabase
    .from("memory_primitives")
    .select("id,instance_id,node_id,statement,status")
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.node_id !== threadId) {
    throw new Error("This belief is no longer available in this thread.");
  }
  return data;
}

async function findActiveOverride(
  threadId: string,
  claimId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("context_retrieval_overrides")
    .select("id")
    .eq("thread_id", threadId)
    .eq("target_type", "memory_primitive")
    .eq("target_id", claimId)
    .is("cleared_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? String(data.id) : null;
}

async function syncThreadSheetCorrection(input: {
  instanceId: string;
  threadId: string;
  claimId: string;
  replacementClaimId: string | null;
  previousStatement: string;
  replacementStatement: string | null;
  now: string;
}): Promise<boolean> {
  try {
    const sheet = await getThreadContextSheet(input.threadId);
    if (!sheet) return false;
    return upsertThreadContextSheetRecord({
      instanceId: input.instanceId,
      threadId: input.threadId,
      update: buildCorrectedThreadSheetUpdate({ sheet, ...input }),
    });
  } catch {
    return false;
  }
}

async function revalidateHistoricalTraceDiffs(threadId: string): Promise<void> {
  const { data, error } = await supabase
    .from("reason_traces")
    .select("subject_id")
    .eq("thread_id", threadId)
    .eq("trace_kind", "answer")
    .eq("subject_type", "post")
    .limit(100);
  if (error) return;
  for (const trace of data ?? []) {
    revalidateReasonTrace(String(trace.subject_id));
  }
}

function revalidateWorkingModelMutation(
  threadId: string,
  workspaceId: string,
  claimId: string,
  replacementClaimId: string | null
) {
  revalidateWorkingModel(threadId);
  revalidateNodeMemoryPrimitives(threadId);
  revalidateThreadContext(threadId);
  revalidateThreadContextSheet(threadId);
  revalidateAnswerTraces(threadId);
  revalidateThreadSurface(threadId);
  revalidateClaim(claimId);
  if (replacementClaimId) revalidateClaim(replacementClaimId);
  revalidatePath(`/n/${workspaceId}`);
}
