import type {
  ImportSourceApp,
  NormalizedImportedConversation,
  NormalizedImportedMessage,
} from "./import-sources";
import { stableConversationHash } from "./import-sources";
import type { SourceApp } from "./types";

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
