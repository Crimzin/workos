import { createHash } from "node:crypto";
import type { SourceApp } from "./types";

export interface RawImportFile {
  fileName: string;
  text: string;
}

export type ImportedMessageRole = "human" | "assistant" | "system" | "tool" | "unknown";

export interface NormalizedImportedMessage {
  sourceMessageId: string;
  role: ImportedMessageRole;
  authorName: string | null;
  text: string;
  createdAt: string | null;
  sourceIndex: number;
}

export interface NormalizedImportedConversation {
  sourceApp: Exclude<SourceApp, "workos">;
  sourceConversationId: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  messages: NormalizedImportedMessage[];
}

export interface ImportInventoryItem {
  fileName: string;
  sourceApp: Exclude<SourceApp, "workos">;
  conversationCount: number;
  error: string | null;
}

export interface NormalizedImportBatch {
  inventory: ImportInventoryItem[];
  conversations: NormalizedImportedConversation[];
}

export function normalizeImportFiles(files: RawImportFile[]): NormalizedImportBatch {
  const inventory: ImportInventoryItem[] = [];
  const conversations: NormalizedImportedConversation[] = [];

  for (const file of files) {
    const parsed = parseJson(file.text);
    const sourceApp = detectSourceApp(file.fileName, parsed);
    if (!parsed || !sourceApp) {
      inventory.push({
        fileName: file.fileName,
        sourceApp: "unknown",
        conversationCount: 0,
        error: "File was not recognized as a Claude or ChatGPT conversation export.",
      });
      continue;
    }

    const normalized =
      sourceApp === "claude"
        ? normalizeClaudeConversations(parsed)
        : normalizeChatGPTConversations(parsed);
    inventory.push({
      fileName: file.fileName,
      sourceApp,
      conversationCount: normalized.length,
      error: null,
    });
    conversations.push(...normalized);
  }

  return { inventory, conversations };
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function detectSourceApp(
  fileName: string,
  parsed: unknown
): "claude" | "chatgpt" | null {
  if (!Array.isArray(parsed)) return null;
  const first = parsed[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  if ("chat_messages" in first || fileName.toLowerCase().includes("claude")) return "claude";
  if ("mapping" in first || fileName.toLowerCase().includes("conversations")) return "chatgpt";
  return null;
}

function normalizeClaudeConversations(parsed: unknown): NormalizedImportedConversation[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    const messages = Array.isArray(row.chat_messages) ? row.chat_messages : [];
    return {
      sourceApp: "claude",
      sourceConversationId: stringValue(row.uuid) || `claude:${index}`,
      title: stringValue(row.name) || "Untitled Claude chat",
      createdAt: stringValue(row.created_at),
      updatedAt: stringValue(row.updated_at),
      messages: messages
        .map((message, sourceIndex) => normalizeClaudeMessage(message, sourceIndex))
        .filter((message) => message.text.length > 0),
    };
  });
}

function normalizeClaudeMessage(
  message: unknown,
  sourceIndex: number
): NormalizedImportedMessage {
  const row = message as Record<string, unknown>;
  const sender = stringValue(row.sender);
  return {
    sourceMessageId: stringValue(row.uuid) || `claude-message:${sourceIndex}`,
    role: sender === "human" ? "human" : sender === "assistant" ? "assistant" : "unknown",
    authorName: sender === "human" ? "Human" : sender === "assistant" ? "Claude" : null,
    text: stringValue(row.text),
    createdAt: stringValue(row.created_at),
    sourceIndex,
  };
}

function normalizeChatGPTConversations(parsed: unknown): NormalizedImportedConversation[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    const messages = flattenChatGPTMessages(row.mapping);
    return {
      sourceApp: "chatgpt",
      sourceConversationId: stringValue(row.id) || `chatgpt:${index}`,
      title: stringValue(row.title) || "Untitled ChatGPT chat",
      createdAt: unixToIso(row.create_time),
      updatedAt: unixToIso(row.update_time),
      messages,
    };
  });
}

function flattenChatGPTMessages(mapping: unknown): NormalizedImportedMessage[] {
  if (!mapping || typeof mapping !== "object") return [];
  const rows = Object.values(mapping as Record<string, Record<string, unknown>>);
  return rows
    .map((row) => row.message as Record<string, unknown> | null)
    .filter((message): message is Record<string, unknown> => !!message)
    .map((message, sourceIndex) => {
      const author = (message.author ?? {}) as Record<string, unknown>;
      const role = stringValue(author.role);
      return {
        sourceMessageId: stringValue(message.id) || `chatgpt-message:${sourceIndex}`,
        role:
          role === "user"
            ? "human"
            : role === "assistant"
              ? "assistant"
              : role === "system"
                ? "system"
                : "unknown",
        authorName: stringValue(author.name) || (role === "assistant" ? "ChatGPT" : null),
        text: chatGptText(message.content),
        createdAt: unixToIso(message.create_time),
        sourceIndex,
      };
    })
    .filter((message) => message.text.length > 0)
    .sort(
      (a, b) =>
        (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.sourceIndex - b.sourceIndex
    )
    .map((message, sourceIndex) => ({ ...message, sourceIndex }));
}

function chatGptText(content: unknown): string {
  const row = content as Record<string, unknown> | null;
  const parts = Array.isArray(row?.parts) ? row.parts : [];
  return parts
    .map((part) => (typeof part === "string" ? part : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function stableConversationHash(conversation: NormalizedImportedConversation): string {
  const hash = createHash("sha256");
  hash.update(conversation.sourceApp);
  hash.update("\0");
  hash.update(conversation.sourceConversationId);
  hash.update("\0");
  for (const message of conversation.messages) {
    hash.update(message.sourceMessageId);
    hash.update("\0");
    hash.update(message.role);
    hash.update("\0");
    hash.update(message.text);
    hash.update("\0");
  }
  return hash.digest("hex");
}
