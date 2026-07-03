import assert from "node:assert/strict";
import {
  buildThreadPlacementCandidates,
  filterThreadPlacementCandidates,
  getExactThreadPlacementMatch,
  includeAncestorThreadPlacementCandidates,
  type ThreadPlacementMirrorRow,
  type ThreadPlacementNodeRow,
} from "./thread-placement.ts";

const baseNode = {
  instance_id: "instance-1",
  source_kind: null,
  source_app: null,
  archived_at: null,
} satisfies Omit<
  ThreadPlacementNodeRow,
  "id" | "parent_id" | "type" | "title" | "updated_at" | "source_updated_at"
>;

function node(
  id: string,
  title: string,
  parentId: string | null,
  updatedAt: string,
  sourceUpdatedAt: string | null = null
): ThreadPlacementNodeRow {
  return {
    ...baseNode,
    id,
    title,
    parent_id: parentId,
    type: "card",
    updated_at: updatedAt,
    source_updated_at: sourceUpdatedAt,
  };
}

const mirrors: ThreadPlacementMirrorRow[] = [
  { node_id: "already-mirrored", mirror_parent_id: "target" },
];

const candidates = buildThreadPlacementCandidates({
  nodes: [
    node("old", "Older thread", "elsewhere", "2026-07-01T10:00:00.000Z"),
    node("recent", "Recent thread", "elsewhere", "2026-07-03T10:00:00.000Z"),
    node("source-recent", "Imported source", "elsewhere", "2026-07-01T00:00:00.000Z", "2026-07-04T00:00:00.000Z"),
    node("already-home", "Already home", "target", "2026-07-05T00:00:00.000Z"),
    node("already-mirrored", "Already mirrored", "elsewhere", "2026-07-05T00:00:00.000Z"),
    { ...node("archived", "Archived", "elsewhere", "2026-07-06T00:00:00.000Z"), archived_at: "2026-07-06T01:00:00.000Z" },
    node("target", "Target parent", null, "2026-07-07T00:00:00.000Z"),
    node("ancestor", "Ancestor", null, "2026-07-08T00:00:00.000Z"),
  ],
  mirrors,
  targetParentId: "target",
  excludedNodeIds: new Set(["ancestor"]),
});

assert.deepEqual(
  candidates.map((candidate) => candidate.id),
  ["source-recent", "recent", "old"]
);

assert.deepEqual(
  filterThreadPlacementCandidates(candidates, "source", 10).map(
    (candidate) => candidate.id
  ),
  ["source-recent"]
);

assert.deepEqual(
  filterThreadPlacementCandidates(candidates, "recent", 1).map(
    (candidate) => candidate.id
  ),
  ["recent"]
);

assert.deepEqual(
  filterThreadPlacementCandidates(
    [
      {
        id: "path-child",
        title: "Visualize the migration",
        type: "card",
        parentId: "workos",
        updatedAt: "2026-07-10T00:00:00.000Z",
        sourceKind: null,
        sourceApp: null,
        path: "WorkOS Development / Onboarding/migration / Visualize the migration",
      },
      {
        id: "workos",
        title: "WorkOS Development",
        type: "workspace",
        parentId: null,
        updatedAt: "2026-06-01T00:00:00.000Z",
        sourceKind: null,
        sourceApp: null,
        path: "WorkOS Development",
      },
      {
        id: "path-child-2",
        title: "LLM import topic clustering",
        type: "card",
        parentId: "migration",
        updatedAt: "2026-07-09T00:00:00.000Z",
        sourceKind: null,
        sourceApp: null,
        path: "WorkOS Development / Onboarding/migration / LLM import topic clustering",
      },
    ],
    "workos development",
    3
  ).map((candidate) => candidate.id),
  ["workos", "path-child", "path-child-2"]
);

const workOSParentCandidate = {
  id: "ux",
  title: "UX continuous improvement",
  type: "stack" as const,
  parentId: "workos",
  updatedAt: "2026-06-01T00:00:00.000Z",
  sourceKind: null,
  sourceApp: null,
  path: "WorkOS Development / UX continuous improvement",
};
const workOSChildCandidate = {
  id: "board-pin",
  title: "Board: Make it possible to pin columns",
  type: "card" as const,
  parentId: "ux",
  updatedAt: "2026-07-10T00:00:00.000Z",
  sourceKind: null,
  sourceApp: null,
  path: "WorkOS Development / UX continuous improvement / Board: Make it possible to pin columns",
};

assert.deepEqual(
  filterThreadPlacementCandidates(
    includeAncestorThreadPlacementCandidates(
      [workOSChildCandidate, workOSParentCandidate],
      [workOSChildCandidate]
    ),
    "continuous improvement",
    2
  ).map((candidate) => candidate.id),
  ["ux", "board-pin"]
);

assert.equal(
  getExactThreadPlacementMatch(candidates, " recent THREAD ")?.id,
  "recent"
);
assert.equal(getExactThreadPlacementMatch(candidates, "new thread"), null);
