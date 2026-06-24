import type {
  ImportSourceApp,
  NormalizedImportedConversation,
  NormalizedImportedMessage,
} from "./import-sources";
import { stableConversationHash } from "./import-sources";
import type { SourceApp } from "./types";

export const NO_READABLE_IMPORTED_CHATS_ERROR =
  "No readable Claude or ChatGPT chats found.";

export interface ImportNodeInsert {
  instance_id: string;
  parent_id: string | null;
  type: "stack";
  title: string;
  description: string | null;
  position: number;
  source_kind: "imported_ai_chat";
  source_app: ImportSourceApp;
  source_import_session_id: string;
  source_conversation_id: string;
  source_title: string;
  source_hash: string;
  source_created_at: string | null;
  source_updated_at: string | null;
  imported_visibility: "visible";
  suggestion_status: "allowed";
}

export interface ImportPostInsert {
  node_client_key: string;
  actor_id: null;
  post_type: "post";
  body: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

export interface ImportMaterializationPlan {
  nodes: Array<ImportNodeInsert & { client_key: string }>;
  posts: ImportPostInsert[];
}

export interface ExistingImportedNode {
  id: string;
  source_app: ImportSourceApp;
  source_conversation_id: string;
}

export interface ImportNodeSourceUpdate {
  id: string;
  client_key: string;
  source_title: string;
  source_hash: string;
  source_created_at: string | null;
  source_updated_at: string | null;
}

export interface ImportNodeWritePlan {
  inserts: Array<ImportNodeInsert & { client_key: string }>;
  updates: ImportNodeSourceUpdate[];
  nodeIdByClientKey: Map<string, string>;
}

export function assertHasReadableImportedConversations(
  conversations: NormalizedImportedConversation[]
): void {
  if (conversations.length === 0) {
    throw new Error(NO_READABLE_IMPORTED_CHATS_ERROR);
  }
}

export function buildImportMaterializationPlan(input: {
  instanceId: string;
  importSessionId: string;
  conversations: NormalizedImportedConversation[];
  firstPosition: number;
}): ImportMaterializationPlan {
  const nodes = input.conversations.map((conversation, index) => ({
    client_key: conversationKey(conversation),
    instance_id: input.instanceId,
    parent_id: null,
    type: "stack" as const,
    title: conversation.title || "Untitled imported chat",
    description: null,
    position: input.firstPosition + index,
    source_kind: "imported_ai_chat" as const,
    source_app: conversation.sourceApp,
    source_import_session_id: input.importSessionId,
    source_conversation_id: conversation.sourceConversationId,
    source_title: conversation.title,
    source_hash: stableConversationHash(conversation),
    source_created_at: conversation.createdAt,
    source_updated_at: conversation.updatedAt,
    imported_visibility: "visible" as const,
    suggestion_status: "allowed" as const,
  }));

  const posts = input.conversations.flatMap((conversation) =>
    conversation.messages.map((message) => ({
      node_client_key: conversationKey(conversation),
      actor_id: null,
      post_type: "post" as const,
      body: message.text,
      metadata: importedMessageMetadata(conversation, message),
      created_at: message.createdAt,
    }))
  );

  return { nodes, posts };
}

export function buildImportNodeWritePlan(
  nodes: Array<ImportNodeInsert & { client_key: string }>,
  existingNodes: ExistingImportedNode[]
): ImportNodeWritePlan {
  const existingByClientKey = new Map(
    existingNodes.map((node) => [sourceIdentityKey(node), node])
  );
  const nodeIdByClientKey = new Map<string, string>();
  const inserts: Array<ImportNodeInsert & { client_key: string }> = [];
  const updates: ImportNodeSourceUpdate[] = [];

  for (const node of nodes) {
    const existing = existingByClientKey.get(node.client_key);
    if (!existing) {
      inserts.push(node);
      continue;
    }

    nodeIdByClientKey.set(node.client_key, existing.id);
    updates.push({
      id: existing.id,
      client_key: node.client_key,
      source_title: node.source_title,
      source_hash: node.source_hash,
      source_created_at: node.source_created_at,
      source_updated_at: node.source_updated_at,
    });
  }

  return { inserts, updates, nodeIdByClientKey };
}

export function importedMessageMetadata(
  conversation: NormalizedImportedConversation,
  message: NormalizedImportedMessage
): Record<string, unknown> {
  return {
    imported_message: true,
    source_app: conversation.sourceApp,
    source_conversation_id: conversation.sourceConversationId,
    source_message_id: message.sourceMessageId,
    source_role: message.role,
    source_author: message.authorName,
    source_index: message.sourceIndex,
    source_timestamp: message.createdAt,
  };
}

export function handoffPostMetadata(sourceApp: SourceApp): Record<string, unknown> {
  return {
    import_handoff: true,
    source_app: sourceApp,
  };
}

function conversationKey(conversation: NormalizedImportedConversation): string {
  return `${conversation.sourceApp}:${conversation.sourceConversationId}`;
}

function sourceIdentityKey(identity: {
  source_app: ImportSourceApp;
  source_conversation_id: string;
}): string {
  return `${identity.source_app}:${identity.source_conversation_id}`;
}
