"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor, type CurrentActor } from "../actor";
import {
  revalidateImportedChats,
  revalidateImportSessions,
  revalidateRootNodes,
} from "../cache";
import {
  assertHasReadableImportedConversations,
  buildImportMaterializationPlan,
  buildImportNodeWritePlan,
  buildImportPostWriteRows,
  type ExistingImportedNode,
  type ImportPostWriteRow,
} from "../import-materialize";
import {
  MAX_IMPORT_CONVERSATION_BATCH_BYTES,
  assertValidImportConversationBatch,
  serializedImportConversationBatchBytes,
} from "../import-batches";
import type {
  ImportInventoryItem,
  ImportSourceApp,
  NormalizedImportedConversation,
} from "../import-sources";
import { supabase } from "../supabase";

export interface ImportPreflightSummary {
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
}

export interface StartAISourceImportInput {
  inventory: ImportInventoryItem[];
  sourceApps: ImportSourceApp[];
  summary: ImportPreflightSummary;
}

export interface StartAISourceImportResult {
  importSessionId: string;
}

export interface ImportAISourceConversationBatchResult {
  importedCount: number;
}

export async function startAISourceImport(
  input: StartAISourceImportInput
): Promise<StartAISourceImportResult> {
  const actor = await getCurrentActor();
  const inventory = validatedInventory(input.inventory);
  const sourceApps = validatedSourceApps(input.sourceApps);
  const summary = validatedPreflightSummary(input.summary);

  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .insert({
      instance_id: actor.instance_id,
      actor_id: actor.id,
      source_apps: sourceApps,
      import_name: "AI chat import",
      status: "processing",
      source_counts: sourceCounts(inventory),
      metadata: { inventory, summary },
    })
    .select("id")
    .single();
  if (sessionError) throw sessionError;
  return { importSessionId: session.id as string };
}

export async function importAISourceConversationBatch(input: {
  importSessionId: string;
  conversations: NormalizedImportedConversation[];
}): Promise<ImportAISourceConversationBatchResult> {
  const actor = await getCurrentActor();
  await assertActiveImportSession(input.importSessionId, actor.instance_id);

  try {
    assertValidImportConversationBatch(input.conversations);
    if (
      serializedImportConversationBatchBytes(input.conversations) >
      MAX_IMPORT_CONVERSATION_BATCH_BYTES
    ) {
      throw new Error("Imported conversation batch exceeds the safe size limit.");
    }

    const importedCount = await materializeImportedConversations({
      actor,
      importSessionId: input.importSessionId,
      conversations: input.conversations,
    });
    return { importedCount };
  } catch (error) {
    try {
      await markImportSessionFailed(
        input.importSessionId,
        actor.instance_id,
        error
      );
      revalidateAfterImport(actor.instance_id);
    } catch {
      // Preserve the original materialization error for callers.
    }
    throw error;
  }
}

export async function completeAISourceImport(input: {
  importSessionId: string;
}): Promise<void> {
  const actor = await getCurrentActor();
  await assertActiveImportSession(input.importSessionId, actor.instance_id);
  await updateImportSession(input.importSessionId, { status: "completed" });
  revalidateAfterImport(actor.instance_id);
}

export async function failAISourceImport(input: {
  importSessionId: string;
  message: string;
}): Promise<void> {
  const actor = await getCurrentActor();
  await markImportSessionFailed(
    input.importSessionId,
    actor.instance_id,
    new Error(input.message || "Import failed.")
  );
  revalidateAfterImport(actor.instance_id);
}

async function materializeImportedConversations(input: {
  actor: CurrentActor;
  importSessionId: string;
  conversations: NormalizedImportedConversation[];
}): Promise<number> {
  assertHasReadableImportedConversations(input.conversations);
  const firstPosition = await nextRootPosition(input.actor.instance_id);
  const plan = buildImportMaterializationPlan({
    instanceId: input.actor.instance_id,
    importSessionId: input.importSessionId,
    conversations: input.conversations,
    firstPosition,
  });

  const existingNodes = await getExistingImportedNodes(
    input.actor.instance_id,
    plan.nodes
  );
  const nodeWrites = buildImportNodeWritePlan(plan.nodes, existingNodes);
  const nodeIdByClientKey = new Map(nodeWrites.nodeIdByClientKey);

  for (const update of nodeWrites.updates) {
    const { error } = await supabase
      .from("nodes")
      .update({
        source_title: update.source_title,
        source_hash: update.source_hash,
        source_created_at: update.source_created_at,
        source_updated_at: update.source_updated_at,
      })
      .eq("id", update.id);
    if (error) throw error;
  }

  for (const node of nodeWrites.inserts) {
    const { client_key, ...insert } = node;
    const { data, error } = await supabase
      .from("nodes")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw error;
    nodeIdByClientKey.set(client_key, data.id as string);
  }

  const existingSourceMessageIdsByNodeId =
    await getExistingImportedSourceMessageIdsByNodeId(
      [...new Set(nodeIdByClientKey.values())]
    );
  const postRows = buildImportPostWriteRows({
    posts: plan.posts,
    nodeIdByClientKey,
    existingSourceMessageIdsByNodeId,
  });
  await insertPostRows(postRows);
  return plan.nodes.length;
}

async function nextRootPosition(instanceId: string): Promise<number> {
  const { data, error } = await supabase
    .from("nodes")
    .select("position")
    .eq("instance_id", instanceId)
    .is("parent_id", null)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data?.[0]?.position as number | undefined) ?? 0) + 1000;
}

async function getExistingImportedSourceMessageIdsByNodeId(
  nodeIds: string[]
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (nodeIds.length === 0) return result;

  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("posts")
      .select("node_id,metadata")
      .in("node_id", nodeIds)
      .contains("metadata", { imported_message: true })
      .range(start, start + pageSize - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      const nodeId = metadataString(row.node_id);
      const sourceMessageId = metadataString(row.metadata?.source_message_id);
      if (!nodeId || !sourceMessageId) continue;
      const sourceMessageIds = result.get(nodeId) ?? new Set<string>();
      sourceMessageIds.add(sourceMessageId);
      result.set(nodeId, sourceMessageIds);
    }

    if (!data || data.length < pageSize) break;
  }

  return result;
}

async function getExistingImportedNodes(
  instanceId: string,
  nodes: Array<{ source_app: string; source_conversation_id: string }>
): Promise<ExistingImportedNode[]> {
  const sourceApps = [...new Set(nodes.map((node) => node.source_app))];
  const sourceConversationIds = [
    ...new Set(nodes.map((node) => node.source_conversation_id)),
  ];
  if (sourceApps.length === 0 || sourceConversationIds.length === 0) return [];

  const { data, error } = await supabase
    .from("nodes")
    .select("id,source_app,source_conversation_id")
    .eq("instance_id", instanceId)
    .eq("source_kind", "imported_ai_chat")
    .in("source_app", sourceApps)
    .in("source_conversation_id", sourceConversationIds);
  if (error) throw error;

  return ((data ?? []) as ExistingImportedNode[]).filter(
    (node) => node.source_app === "claude" || node.source_app === "chatgpt"
  );
}

async function updateImportSession(
  sessionId: string,
  values: {
    status: "completed" | "failed";
    source_counts?: Record<string, number>;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase
    .from("import_sessions")
    .update(values)
    .eq("id", sessionId);
  if (error) throw error;
}

async function assertActiveImportSession(
  sessionId: string,
  instanceId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("import_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("instance_id", instanceId)
    .eq("status", "processing")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Import session is no longer active.");
}

async function markImportSessionFailed(
  sessionId: string,
  instanceId: string,
  errorValue: unknown
): Promise<void> {
  const { data, error } = await supabase
    .from("import_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .eq("instance_id", instanceId)
    .eq("status", "processing")
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const metadata = isRecord(data.metadata) ? data.metadata : {};
  await updateImportSession(sessionId, {
    status: "failed",
    metadata: {
      ...metadata,
      error: errorMetadata(errorValue),
    },
  });
}

function validatedInventory(inventory: ImportInventoryItem[]): ImportInventoryItem[] {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    throw new Error("Import inventory is required.");
  }

  return inventory.map((item) => {
    if (
      !isRecord(item) ||
      !metadataString(item.fileName) ||
      !isInventorySourceApp(item.sourceApp) ||
      !Number.isInteger(item.conversationCount) ||
      item.conversationCount < 0 ||
      (item.error !== null && typeof item.error !== "string")
    ) {
      throw new Error("Import inventory is invalid.");
    }

    return {
      fileName: item.fileName.trim(),
      sourceApp: item.sourceApp,
      conversationCount: item.conversationCount,
      error: item.error,
    };
  });
}

function validatedSourceApps(sourceApps: ImportSourceApp[]): ImportSourceApp[] {
  if (!Array.isArray(sourceApps)) throw new Error("Import sources are invalid.");
  const values = [...new Set(sourceApps.filter(isImportSourceApp))];
  if (values.length === 0 || values.length !== sourceApps.length) {
    throw new Error("Import sources are invalid.");
  }
  return values;
}

function validatedPreflightSummary(
  summary: ImportPreflightSummary
): ImportPreflightSummary {
  if (
    !isRecord(summary) ||
    !isNonNegativeInteger(summary.newCount) ||
    !isNonNegativeInteger(summary.updatedCount) ||
    !isNonNegativeInteger(summary.unchangedCount) ||
    summary.newCount + summary.updatedCount === 0
  ) {
    throw new Error("Import summary is invalid.");
  }

  return {
    newCount: summary.newCount,
    updatedCount: summary.updatedCount,
    unchangedCount: summary.unchangedCount,
  };
}

function sourceCounts(inventory: ImportInventoryItem[]): Record<string, number> {
  return inventory.reduce<Record<string, number>>((counts, item) => {
    counts[item.sourceApp] = (counts[item.sourceApp] ?? 0) + item.conversationCount;
    return counts;
  }, {});
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isImportSourceApp(value: unknown): value is ImportSourceApp {
  return value === "claude" || value === "chatgpt";
}

function isInventorySourceApp(
  value: unknown
): value is ImportInventoryItem["sourceApp"] {
  return isImportSourceApp(value) || value === "unknown";
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function revalidateAfterImport(instanceId: string): void {
  revalidateImportedChats(instanceId);
  revalidateImportSessions(instanceId);
  revalidateRootNodes();
  revalidatePath("/", "layout");
}

async function insertPostRows(rows: ImportPostWriteRow[]): Promise<void> {
  const chunkSize = 200;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const { error } = await supabase.from("posts").insert(chunk);
    if (!error) continue;
    if (!isDuplicateError(error)) throw error;
    await insertPostRowsIndividually(chunk);
  }
}

async function insertPostRowsIndividually(
  rows: ImportPostWriteRow[]
): Promise<void> {
  for (const row of rows) {
    const { error } = await supabase.from("posts").insert(row);
    if (error && !isDuplicateError(error)) throw error;
  }
}

function isDuplicateError(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function errorMetadata(error: unknown): Record<string, string> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}
