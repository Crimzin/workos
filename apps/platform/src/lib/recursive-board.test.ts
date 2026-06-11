import assert from "node:assert/strict";
import {
  buildRecursiveBoardData,
  type RecursiveBoardFieldValueRow,
  type RecursiveBoardNodeRow,
} from "./recursive-board";

function node(
  id: string,
  parentId: string | null,
  type: RecursiveBoardNodeRow["type"],
  position: number
): RecursiveBoardNodeRow {
  return {
    id,
    instance_id: "instance",
    parent_id: parentId,
    type,
    title: id,
    description: null,
    owner_id: null,
    position,
    stack_lifecycle_status: "prioritized",
    thread_resolution_status: "active",
    resolved_at: null,
    resolved_by_actor_id: null,
    resolution_summary: null,
    resolution_source_post_id: null,
    archived_at: null,
    created_at: "2026-05-28T00:00:00.000Z",
    updated_at: "2026-05-28T00:00:00.000Z",
  };
}

const root = node("current-card", "parent", "card", 0);
const rows = [
  node("phase-b", root.id, "card", 2),
  node("task-b1", "phase-b", "workspace", 0),
  node("phase-a", root.id, "workspace", 1),
  node("task-a2", "phase-a", "stack", 2),
  node("task-a1", "phase-a", "card", 1),
];

const fieldValues: RecursiveBoardFieldValueRow[] = [
  { node_id: "task-a1", field_id: "status", option_id: "doing" },
  { node_id: "phase-a", field_id: "status", option_id: "planning" },
];

const board = buildRecursiveBoardData({
  root,
  rows,
  fields: [],
  fieldValues,
  mirroredNodeIds: new Set(["task-a2"]),
  mirrorRows: [],
  actors: {},
});

assert.equal(board.workspace.id, "current-card");
assert.deepEqual(
  board.stacks.map((stack) => stack.id),
  ["phase-a", "phase-b"]
);
assert.deepEqual(
  board.stacks[0].cards.map((card) => card.id),
  ["task-a1", "task-a2"]
);
assert.equal(board.stacks[0].field_values.status[0], "planning");
assert.equal(board.stacks[0].cards[0].field_values.status[0], "doing");
assert.equal(board.stacks[0].cards[1].is_mirrored, true);
assert.equal(board.stacks[0].cards[1].dnd_id, "task-a2:phase-a");
