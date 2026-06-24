"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import {
  revalidateImportedChats,
  revalidateImportSessions,
  revalidateRootNodes,
} from "../cache";
import {
  assertHasReadableImportedConversations,
  buildImportMaterializationPlan,
  buildImportNodeWritePlan,
  type ExistingImportedNode,
} from "../import-materialize";
import {
  normalizeImportFiles,
  type RawImportFile,
} from "../import-sources";
import { supabase } from "../supabase";

export interface ImportSourcesResult {
  importSessionId: string;
  importedCount: number;
  inventory: ReturnType<typeof normalizeImportFiles>["inventory"];
}

export async function importAISourceFiles(
  files: RawImportFile[]
): Promise<ImportSourcesResult> {
  const actor = await getCurrentActor();
  const normalized = normalizeImportFiles(files);
  assertHasReadableImportedConversations(normalized.conversations);

  const sourceApps = [
    ...new Set(
      normalized.conversations.map((conversation) => conversation.sourceApp)
    ),
  ];

  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .insert({
      instance_id: actor.instance_id,
      actor_id: actor.id,
      source_apps: sourceApps,
      import_name: "AI chat import",
      status: "processing",
      source_counts: {},
      metadata: { inventory: normalized.inventory },
    })
    .select("id")
    .single();
  if (sessionError) throw sessionError;
  const sessionId = session.id as string;

  try {
    const firstPosition = await nextRootPosition(actor.instance_id);
    const plan = buildImportMaterializationPlan({
      instanceId: actor.instance_id,
      importSessionId: sessionId,
      conversations: normalized.conversations,
      firstPosition,
    });

    const existingNodes = await getExistingImportedNodes(
      actor.instance_id,
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

    const postsByClientKey = new Map<string, typeof plan.posts>();
    for (const post of plan.posts) {
      const posts = postsByClientKey.get(post.node_client_key) ?? [];
      posts.push(post);
      postsByClientKey.set(post.node_client_key, posts);
    }

    for (const [clientKey, posts] of postsByClientKey) {
      const nodeId = nodeIdByClientKey.get(clientKey);
      if (!nodeId) continue;

      const existingSourceMessageIds =
        await getExistingImportedSourceMessageIds(nodeId);

      for (const post of posts) {
        const sourceMessageId = metadataString(post.metadata.source_message_id);
        if (sourceMessageId && existingSourceMessageIds.has(sourceMessageId)) {
          continue;
        }

        const { error } = await supabase.from("posts").insert({
          node_id: nodeId,
          actor_id: post.actor_id,
          post_type: post.post_type,
          body: post.body,
          metadata: post.metadata,
          ...(post.created_at ? { created_at: post.created_at } : {}),
        });

        if (error) {
          if (sourceMessageId && isDuplicateError(error)) continue;
          throw error;
        }

        if (sourceMessageId) existingSourceMessageIds.add(sourceMessageId);
      }
    }

    await updateImportSession(sessionId, {
      status: "completed",
      source_counts: sourceCounts(normalized.inventory),
      metadata: { inventory: normalized.inventory },
    });

    revalidateImportedChats(actor.instance_id);
    revalidateImportSessions(actor.instance_id);
    revalidateRootNodes();
    revalidatePath("/", "layout");

    return {
      importSessionId: sessionId,
      importedCount: plan.nodes.length,
      inventory: normalized.inventory,
    };
  } catch (error) {
    try {
      await updateImportSession(sessionId, {
        status: "failed",
        metadata: {
          inventory: normalized.inventory,
          error: errorMetadata(error),
        },
      });
      revalidateImportSessions(actor.instance_id);
      revalidatePath("/", "layout");
    } catch {
      // Preserve the original materialization error for callers.
    }
    throw error;
  }
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

async function getExistingImportedSourceMessageIds(
  nodeId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("posts")
    .select("metadata")
    .eq("node_id", nodeId)
    .contains("metadata", { imported_message: true });
  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row) => metadataString(row.metadata?.source_message_id))
      .filter((sourceMessageId): sourceMessageId is string =>
        Boolean(sourceMessageId)
      )
  );
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
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase
    .from("import_sessions")
    .update(values)
    .eq("id", sessionId);
  if (error) throw error;
}

function sourceCounts(
  inventory: ReturnType<typeof normalizeImportFiles>["inventory"]
): Record<string, number> {
  return inventory.reduce<Record<string, number>>((counts, item) => {
    counts[item.sourceApp] = (counts[item.sourceApp] ?? 0) + item.conversationCount;
    return counts;
  }, {});
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
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
