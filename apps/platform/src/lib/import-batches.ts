import type {
  ImportSourceApp,
  ImportedMessageRole,
  NormalizedImportedConversation,
} from "./import-sources";

export const MAX_IMPORT_CONVERSATION_BATCH_BYTES = 3 * 1024 * 1024;

export interface ImportedConversationManifestEntry {
  sourceApp: ImportSourceApp;
  sourceConversationId: string;
  sourceUpdatedAt: string | null;
}

interface ImportConversationIdentity {
  sourceApp: ImportSourceApp;
  sourceConversationId: string;
  updatedAt: string | null;
}

export interface ImportConversationClassification<TConversation> {
  unchanged: TConversation[];
  updated: TConversation[];
  fresh: TConversation[];
  pending: TConversation[];
}

export function classifyImportConversations<
  TConversation extends ImportConversationIdentity,
>(
  conversations: TConversation[],
  existing: ImportedConversationManifestEntry[]
): ImportConversationClassification<TConversation> {
  const existingByIdentity = new Map(
    existing.map((item) => [conversationIdentity(item), item])
  );
  const unchanged: TConversation[] = [];
  const updated: TConversation[] = [];
  const fresh: TConversation[] = [];
  const pending: TConversation[] = [];

  for (const conversation of conversations) {
    const current = existingByIdentity.get(conversationIdentity(conversation));
    if (!current) {
      fresh.push(conversation);
      pending.push(conversation);
      continue;
    }

    if (timestampsMatch(current.sourceUpdatedAt, conversation.updatedAt)) {
      unchanged.push(conversation);
      continue;
    }

    updated.push(conversation);
    pending.push(conversation);
  }

  return { unchanged, updated, fresh, pending };
}

export function buildImportConversationBatches(
  conversations: NormalizedImportedConversation[],
  maxBytes = MAX_IMPORT_CONVERSATION_BATCH_BYTES
): NormalizedImportedConversation[][] {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error("Import batch size must be greater than zero.");
  }

  const batches: NormalizedImportedConversation[][] = [];
  let currentBatch: NormalizedImportedConversation[] = [];

  for (const conversation of conversations) {
    if (serializedImportConversationBatchBytes([conversation]) > maxBytes) {
      throw new Error(
        `The chat “${conversation.title}” is too large to import safely.`
      );
    }

    const candidate = [...currentBatch, conversation];
    if (
      currentBatch.length > 0 &&
      serializedImportConversationBatchBytes(candidate) > maxBytes
    ) {
      batches.push(currentBatch);
      currentBatch = [conversation];
      continue;
    }

    currentBatch = candidate;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

export function serializedImportConversationBatchBytes(
  conversations: NormalizedImportedConversation[]
): number {
  return new TextEncoder().encode(JSON.stringify({ conversations })).byteLength;
}

export function assertValidImportConversationBatch(
  value: unknown
): asserts value is NormalizedImportedConversation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidConversationBatchError();
  }

  for (const conversation of value) {
    if (!isRecord(conversation)) throw invalidConversationBatchError();
    if (!isImportSourceApp(conversation.sourceApp)) {
      throw invalidConversationBatchError();
    }
    if (!isNonEmptyString(conversation.sourceConversationId)) {
      throw invalidConversationBatchError();
    }
    if (typeof conversation.title !== "string") {
      throw invalidConversationBatchError();
    }
    if (!isNullableString(conversation.createdAt)) {
      throw invalidConversationBatchError();
    }
    if (!isNullableString(conversation.updatedAt)) {
      throw invalidConversationBatchError();
    }
    if (!Array.isArray(conversation.messages) || conversation.messages.length === 0) {
      throw invalidConversationBatchError();
    }

    for (const message of conversation.messages) {
      if (!isRecord(message)) throw invalidConversationBatchError();
      if (!isNonEmptyString(message.sourceMessageId)) {
        throw invalidConversationBatchError();
      }
      if (!isImportedMessageRole(message.role)) {
        throw invalidConversationBatchError();
      }
      if (!isNullableString(message.authorName)) {
        throw invalidConversationBatchError();
      }
      if (!isNonEmptyString(message.text)) {
        throw invalidConversationBatchError();
      }
      if (!isNullableString(message.createdAt)) {
        throw invalidConversationBatchError();
      }
      if (
        typeof message.sourceIndex !== "number" ||
        !Number.isInteger(message.sourceIndex) ||
        message.sourceIndex < 0
      ) {
        throw invalidConversationBatchError();
      }
    }
  }
}

function timestampsMatch(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime === rightTime
  );
}

function conversationIdentity(identity: {
  sourceApp: ImportSourceApp;
  sourceConversationId: string;
}): string {
  return `${identity.sourceApp}:${identity.sourceConversationId}`;
}

function isImportSourceApp(value: unknown): value is ImportSourceApp {
  return value === "claude" || value === "chatgpt";
}

function isImportedMessageRole(value: unknown): value is ImportedMessageRole {
  return (
    value === "human" ||
    value === "assistant" ||
    value === "system" ||
    value === "tool" ||
    value === "unknown"
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidConversationBatchError(): Error {
  return new Error("Invalid imported conversation batch.");
}
