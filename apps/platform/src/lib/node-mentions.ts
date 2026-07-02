import { sourceAppLabel } from "./post-source-links";
import type { NodeType, SourceApp, SourceKind } from "./types";
import { buildContextSearchResults, type ContextSearchCandidate } from "./context-search";

export interface NodeMentionRef {
  id: string;
  title: string;
  type: NodeType;
}

export interface NodeMentionSearchRow {
  id: string;
  title: string;
  type: NodeType;
  parent_id: string | null;
  source_kind?: SourceKind | null;
  source_app?: SourceApp | null;
  source_title?: string | null;
  source_conversation_id?: string | null;
}

export interface NodeMentionCandidate extends NodeMentionRef {
  path: string;
  sourceApp: SourceApp;
}

interface BlockNodeShape {
  type?: string;
  content?: unknown;
  children?: unknown;
}

export const MAX_MENTIONED_NODE_CONTEXTS = 5;
export const MENTIONED_NODE_POST_LIMIT = 10;

export function findNodeMentions(
  bodyJson: string | null | undefined
): NodeMentionRef[] {
  if (!bodyJson) return [];

  let doc: unknown;
  try {
    doc = JSON.parse(bodyJson);
  } catch {
    return [];
  }
  if (!Array.isArray(doc)) return [];

  const found = new Map<string, NodeMentionRef>();
  for (const block of doc as BlockNodeShape[]) {
    walkBlockForNodeMentions(block, found);
  }
  return [...found.values()];
}

export function limitNodeMentions(
  mentions: NodeMentionRef[],
  limit = MAX_MENTIONED_NODE_CONTEXTS
): { included: NodeMentionRef[]; omittedCount: number } {
  return {
    included: mentions.slice(0, limit),
    omittedCount: Math.max(0, mentions.length - limit),
  };
}

export function buildNodeMentionCandidates(
  rows: NodeMentionSearchRow[],
  query: string,
  limit: number
): NodeMentionCandidate[] {
  const pathsById = buildPathMap(rows);
  const candidates: ContextSearchCandidate[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    path: pathsById.get(row.id) ?? row.title,
    href: `/n/${row.id}`,
    sourceApp: sourceAppForRow(row),
    bodyPreview: sourceSearchText(row),
  }));

  if (!query.trim()) {
    return candidates.slice(0, limit).map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      type: candidate.type,
      path: candidate.path,
      sourceApp: candidate.sourceApp ?? "workos",
    }));
  }

  return buildContextSearchResults(candidates, query, limit).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    type: candidate.type,
    path: candidate.path,
    sourceApp: candidate.sourceApp ?? "workos",
  }));
}

function sourceAppForRow(row: NodeMentionSearchRow): SourceApp {
  if (row.source_kind === "imported_ai_chat") {
    return row.source_app ?? "unknown";
  }
  return row.source_app ?? "workos";
}

function sourceSearchText(row: NodeMentionSearchRow): string {
  const sourceApp = sourceAppForRow(row);
  if (row.source_kind !== "imported_ai_chat") return "";

  return [
    row.source_title,
    row.source_conversation_id,
    sourceAppLabel(sourceApp),
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
}

function walkBlockForNodeMentions(
  block: BlockNodeShape | unknown,
  out: Map<string, NodeMentionRef>
): void {
  if (!block || typeof block !== "object") return;
  const b = block as BlockNodeShape;

  if (Array.isArray(b.content)) {
    for (const inline of b.content) {
      const mention = nodeMentionFromInline(inline);
      if (mention && !out.has(mention.id)) out.set(mention.id, mention);
    }
  }

  if (Array.isArray(b.children)) {
    for (const child of b.children) {
      walkBlockForNodeMentions(child, out);
    }
  }
}

function nodeMentionFromInline(inline: unknown): NodeMentionRef | null {
  if (!inline || typeof inline !== "object") return null;
  const item = inline as { type?: unknown; props?: unknown };
  if (item.type !== "nodeMention") return null;
  if (!item.props || typeof item.props !== "object") return null;

  const props = item.props as {
    id?: unknown;
    title?: unknown;
    type?: unknown;
    nodeType?: unknown;
  };
  const nodeType = props.type ?? props.nodeType;
  if (
    typeof props.id !== "string" ||
    typeof props.title !== "string" ||
    !isNodeType(nodeType)
  ) {
    return null;
  }

  return { id: props.id, title: props.title, type: nodeType };
}

function isNodeType(value: unknown): value is NodeType {
  return value === "workspace" || value === "stack" || value === "card";
}

function buildPathMap(rows: NodeMentionSearchRow[]): Map<string, string> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const paths = new Map<string, string>();

  for (const row of rows) {
    paths.set(row.id, buildPathForRow(row, byId));
  }

  return paths;
}

function buildPathForRow(
  row: NodeMentionSearchRow,
  byId: Map<string, NodeMentionSearchRow>
): string {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: NodeMentionSearchRow | undefined = row;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.push(cursor.title);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }

  return path.reverse().join(" / ");
}
