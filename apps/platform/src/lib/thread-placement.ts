import type { SourceApp, SourceKind, WorkNode } from "./types";
import {
  buildContextSearchResults,
  normalizeSearchText,
  type ContextSearchCandidate,
} from "./context-search.ts";

export const THREAD_PLACEMENT_NODE_SELECT =
  "id,instance_id,parent_id,type,title,source_kind,source_app,source_updated_at,archived_at,updated_at";

export type ThreadPlacementNodeRow = Pick<
  WorkNode,
  | "id"
  | "instance_id"
  | "parent_id"
  | "type"
  | "title"
  | "source_kind"
  | "source_app"
  | "source_updated_at"
  | "archived_at"
  | "updated_at"
>;

export interface ThreadPlacementMirrorRow {
  node_id: string;
  mirror_parent_id: string;
}

export interface ThreadPlacementCandidate {
  id: string;
  title: string;
  type: WorkNode["type"];
  parentId: string | null;
  updatedAt: string;
  sourceKind: SourceKind | null;
  sourceApp: SourceApp | null;
  path: string;
}

interface BuildThreadPlacementCandidatesInput {
  nodes: ThreadPlacementNodeRow[];
  mirrors: ThreadPlacementMirrorRow[];
  targetParentId: string;
  excludedNodeIds?: Set<string>;
}

export function buildThreadPlacementCandidates({
  nodes,
  mirrors,
  targetParentId,
  excludedNodeIds = new Set(),
}: BuildThreadPlacementCandidatesInput): ThreadPlacementCandidate[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const occupiedIds = new Set(
    nodes
      .filter((node) => node.parent_id === targetParentId)
      .map((node) => node.id)
  );

  for (const mirror of mirrors) {
    if (mirror.mirror_parent_id === targetParentId) {
      occupiedIds.add(mirror.node_id);
    }
  }

  return nodes
    .filter((node) => {
      if (node.archived_at) return false;
      if (node.id === targetParentId) return false;
      if (excludedNodeIds.has(node.id)) return false;
      if (occupiedIds.has(node.id)) return false;
      return true;
    })
    .map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      parentId: node.parent_id,
      updatedAt: node.source_updated_at ?? node.updated_at,
      sourceKind: node.source_kind,
      sourceApp: node.source_app,
      path: buildThreadPath(node, nodesById),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function filterThreadPlacementCandidates(
  candidates: ThreadPlacementCandidate[],
  query: string,
  limit: number
): ThreadPlacementCandidate[] {
  if (limit <= 0) return [];

  const normalized = normalizeThreadPlacementQuery(query);
  if (!normalized) return candidates.slice(0, limit);

  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return buildContextSearchResults(
    candidates.map(toContextSearchCandidate),
    query,
    limit
  )
    .map((result) => candidatesById.get(result.id))
    .filter((candidate): candidate is ThreadPlacementCandidate => Boolean(candidate));
}

export function includeAncestorThreadPlacementCandidates(
  candidates: ThreadPlacementCandidate[],
  selectedCandidates: ThreadPlacementCandidate[]
): ThreadPlacementCandidate[] {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selectedById = new Map(
    selectedCandidates.map((candidate) => [candidate.id, candidate])
  );

  for (const candidate of selectedCandidates) {
    let cursor = candidate.parentId;
    const seen = new Set<string>([candidate.id]);

    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const ancestor = candidatesById.get(cursor);
      if (!ancestor) break;
      selectedById.set(ancestor.id, ancestor);
      cursor = ancestor.parentId;
    }
  }

  return [...selectedById.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function getExactThreadPlacementMatch(
  candidates: ThreadPlacementCandidate[],
  query: string
): ThreadPlacementCandidate | null {
  const normalized = normalizeThreadPlacementQuery(query);
  if (!normalized) return null;
  return (
    candidates.find(
      (candidate) => normalizeThreadPlacementQuery(candidate.title) === normalized
    ) ?? null
  );
}

function normalizeThreadPlacementQuery(value: string): string {
  return normalizeSearchText(value);
}

function toContextSearchCandidate(
  candidate: ThreadPlacementCandidate
): ContextSearchCandidate {
  return {
    id: candidate.id,
    title: candidate.title,
    type: candidate.type,
    href: `/n/${candidate.id}`,
    path: candidate.path,
    sourceApp: candidate.sourceApp ?? "workos",
    updatedAt: candidate.updatedAt,
  };
}

function buildThreadPath(
  node: ThreadPlacementNodeRow,
  nodesById: Map<string, ThreadPlacementNodeRow>
): string {
  const titles = [node.title];
  let cursor = node.parent_id;
  const seen = new Set<string>([node.id]);

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = nodesById.get(cursor);
    if (!parent) break;
    titles.unshift(parent.title);
    cursor = parent.parent_id;
  }

  return titles.join(" / ");
}
