import { createHash } from "node:crypto";
import type { SourceApp } from "./types";

const UNRECOGNIZED_IMPORT_ERROR =
  "File was not recognized as a Claude or ChatGPT conversation export.";

export interface RawImportFile {
  fileName: string;
  text: string;
}

export type ImportSourceApp = Extract<SourceApp, "claude" | "chatgpt">;

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
  sourceApp: ImportSourceApp;
  sourceConversationId: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  messages: NormalizedImportedMessage[];
}

export interface InspectedImportedConversation {
  sourceApp: ImportSourceApp;
  sourceConversationId: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  sourceIndex: number;
  raw: unknown;
}

export interface ImportInventoryItem {
  fileName: string;
  sourceApp: ImportSourceApp | "unknown";
  conversationCount: number;
  error: string | null;
}

export interface NormalizedImportBatch {
  inventory: ImportInventoryItem[];
  conversations: NormalizedImportedConversation[];
}

export interface InspectedImportBatch {
  inventory: ImportInventoryItem[];
  conversations: InspectedImportedConversation[];
}

export function normalizeImportFiles(files: RawImportFile[]): NormalizedImportBatch {
  const inspected = inspectImportFiles(files);
  return {
    inventory: inspected.inventory,
    conversations: normalizeInspectedConversations(inspected.conversations),
  };
}

export function inspectImportFiles(files: RawImportFile[]): InspectedImportBatch {
  const inventory: ImportInventoryItem[] = [];
  const conversations: InspectedImportedConversation[] = [];

  for (const file of files) {
    const parsed = parseJson(file.text);
    const sourceApp = detectSourceApp(file.fileName, parsed);
    if (!sourceApp) {
      inventory.push(rejectedInventoryItem(file.fileName));
      continue;
    }

    const inspected =
      sourceApp === "claude"
        ? inspectClaudeConversations(parsed)
        : inspectChatGPTConversations(parsed);
    if (inspected.length === 0) {
      inventory.push(rejectedInventoryItem(file.fileName));
      continue;
    }

    inventory.push({
      fileName: file.fileName,
      sourceApp,
      conversationCount: inspected.length,
      error: null,
    });
    conversations.push(...inspected);
  }

  return { inventory, conversations };
}

export function normalizeInspectedConversations(
  conversations: InspectedImportedConversation[]
): NormalizedImportedConversation[] {
  return conversations.flatMap((conversation) => {
    const normalized =
      conversation.sourceApp === "claude"
        ? normalizeClaudeConversation(conversation.raw, conversation.sourceIndex)
        : normalizeChatGPTConversation(conversation.raw, conversation.sourceIndex);
    return normalized ? [normalized] : [];
  });
}

function rejectedInventoryItem(fileName: string): ImportInventoryItem {
  return {
    fileName,
    sourceApp: "unknown",
    conversationCount: 0,
    error: UNRECOGNIZED_IMPORT_ERROR,
  };
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
): ImportSourceApp | null {
  if (!Array.isArray(parsed)) return null;

  const hasClaudeShape = parsed.some(isClaudeConversationRow);
  const hasChatGPTShape = parsed.some(isChatGPTConversationRow);

  if (hasClaudeShape && hasChatGPTShape) {
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.includes("claude")) return "claude";
    if (lowerFileName.includes("chatgpt") || lowerFileName.includes("conversation")) {
      return "chatgpt";
    }
    return null;
  }

  if (hasClaudeShape) return "claude";
  if (hasChatGPTShape) return "chatgpt";
  return null;
}

function inspectClaudeConversations(parsed: unknown): InspectedImportedConversation[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item, index) => {
    if (!isClaudeConversationRow(item)) return [];
    if (!hasReadableClaudeMessage(item)) return [];

    return [{
      sourceApp: "claude",
      sourceConversationId: stringValue(item.uuid) || `claude:${index}`,
      title: stringValue(item.name) || "Untitled Claude chat",
      createdAt: stringValue(item.created_at),
      updatedAt: stringValue(item.updated_at),
      sourceIndex: index,
      raw: item,
    }];
  });
}

function normalizeClaudeConversation(
  value: unknown,
  sourceIndex: number
): NormalizedImportedConversation | null {
  if (!isClaudeConversationRow(value)) return null;
  const messages = value.chat_messages
    .map((message, messageIndex) => normalizeClaudeMessage(message, messageIndex))
    .filter((message) => message.text.length > 0);
  if (messages.length === 0) return null;

  return {
    sourceApp: "claude",
    sourceConversationId: stringValue(value.uuid) || `claude:${sourceIndex}`,
    title: stringValue(value.name) || "Untitled Claude chat",
    createdAt: stringValue(value.created_at),
    updatedAt: stringValue(value.updated_at),
    messages,
  };
}

function hasReadableClaudeMessage(conversation: ClaudeConversationRow): boolean {
  return conversation.chat_messages.some((message) => {
    return isRecord(message) && stringValue(message.text).length > 0;
  });
}

function normalizeClaudeMessage(
  message: unknown,
  sourceIndex: number
): NormalizedImportedMessage {
  const row = isRecord(message) ? message : {};
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

function inspectChatGPTConversations(parsed: unknown): InspectedImportedConversation[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item, index) => {
    if (!isChatGPTConversationRow(item)) return [];
    if (!hasReadableChatGPTMessage(item)) return [];

    return [{
      sourceApp: "chatgpt",
      sourceConversationId: stringValue(item.id) || `chatgpt:${index}`,
      title: stringValue(item.title) || "Untitled ChatGPT chat",
      createdAt: unixToIso(item.create_time),
      updatedAt: unixToIso(item.update_time),
      sourceIndex: index,
      raw: item,
    }];
  });
}

function normalizeChatGPTConversation(
  value: unknown,
  sourceIndex: number
): NormalizedImportedConversation | null {
  if (!isChatGPTConversationRow(value)) return null;
  const messages = extractChatGPTMessages(
    value.mapping,
    stringValue(value.current_node)
  );
  if (messages.length === 0) return null;

  return {
    sourceApp: "chatgpt",
    sourceConversationId: stringValue(value.id) || `chatgpt:${sourceIndex}`,
    title: stringValue(value.title) || "Untitled ChatGPT chat",
    createdAt: unixToIso(value.create_time),
    updatedAt: unixToIso(value.update_time),
    messages,
  };
}

function hasReadableChatGPTMessage(conversation: ChatGPTConversationRow): boolean {
  const path = selectChatGPTPath(
    conversation.mapping,
    stringValue(conversation.current_node)
  );
  return path.some((node) => {
    const message = isRecord(node.message) ? node.message : null;
    return message ? chatGptText(message.content).length > 0 : false;
  });
}

function extractChatGPTMessages(
  mapping: Record<string, unknown>,
  currentNodeId: string
): NormalizedImportedMessage[] {
  const path = selectChatGPTPath(mapping, currentNodeId);
  return path
    .map((row) => row.message)
    .filter(isRecord)
    .map((message, sourceIndex) => normalizeChatGPTMessage(message, sourceIndex))
    .filter((message) => message.text.length > 0)
    .map((message, sourceIndex) => ({ ...message, sourceIndex }));
}

function normalizeChatGPTMessage(
  message: Record<string, unknown>,
  sourceIndex: number
): NormalizedImportedMessage {
  const author = isRecord(message.author) ? message.author : {};
  const role = stringValue(author.role);
  return {
    sourceMessageId: stringValue(message.id) || `chatgpt-message:${sourceIndex}`,
    role: chatGPTRole(role),
    authorName: stringValue(author.name) || (role === "assistant" ? "ChatGPT" : null),
    text: chatGptText(message.content),
    createdAt: unixToIso(message.create_time),
    sourceIndex,
  };
}

function selectChatGPTPath(
  mapping: Record<string, unknown>,
  currentNodeId: string
): Array<Record<string, unknown>> {
  const currentPath = currentNodeId ? pathFromCurrentNode(mapping, currentNodeId) : [];
  return currentPath.length > 0 ? currentPath : firstChildPath(mapping);
}

function pathFromCurrentNode(
  mapping: Record<string, unknown>,
  currentNodeId: string
): Array<Record<string, unknown>> {
  const path: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let nodeId = currentNodeId;

  while (nodeId && !seen.has(nodeId)) {
    const node = chatGPTNode(mapping, nodeId);
    if (!node) break;

    seen.add(nodeId);
    path.push(node);
    nodeId = stringValue(node.parent);
  }

  return path.reverse();
}

function firstChildPath(mapping: Record<string, unknown>): Array<Record<string, unknown>> {
  const rootEntry = rootChatGPTNode(mapping);
  if (!rootEntry) return [];

  const path: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let [nodeId, node] = rootEntry;

  while (node && !seen.has(nodeId)) {
    seen.add(nodeId);
    path.push(node);

    const nextNodeId = firstStringChild(node.children);
    const nextNode = nextNodeId ? chatGPTNode(mapping, nextNodeId) : null;
    if (!nextNodeId || !nextNode) break;

    nodeId = nextNodeId;
    node = nextNode;
  }

  return path;
}

function rootChatGPTNode(
  mapping: Record<string, unknown>
): [string, Record<string, unknown>] | null {
  const nodes = Object.entries(mapping).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])
  );
  return (
    nodes.find(([nodeId, node]) => nodeId === "root" || stringValue(node.id) === "root") ??
    nodes.find(([, node]) => node.parent === null) ??
    null
  );
}

function chatGPTNode(
  mapping: Record<string, unknown>,
  nodeId: string
): Record<string, unknown> | null {
  const node = mapping[nodeId];
  return isRecord(node) ? node : null;
}

function firstStringChild(children: unknown): string {
  if (!Array.isArray(children)) return "";
  const child = children.find((item) => typeof item === "string" && item.length > 0);
  return child ?? "";
}

function chatGPTRole(role: string): ImportedMessageRole {
  if (role === "user") return "human";
  if (role === "assistant" || role === "system" || role === "tool") return role;
  return "unknown";
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
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type ClaudeConversationRow = Record<string, unknown> & { chat_messages: unknown[] };

function isClaudeConversationRow(value: unknown): value is ClaudeConversationRow {
  return isRecord(value) && Array.isArray(value.chat_messages);
}

type ChatGPTConversationRow = Record<string, unknown> & {
  mapping: Record<string, unknown>;
};

function isChatGPTConversationRow(value: unknown): value is ChatGPTConversationRow {
  return isRecord(value) && isRecord(value.mapping);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
