import assert from "node:assert/strict";
import { applyCardDrop } from "./board-dnd";

function card(id: string, position: number, fieldValues: Record<string, string[]> = {}) {
  return {
    id,
    title: id,
    description: null,
    owner_id: null,
    position,
    archived_at: null,
    is_mirrored: false,
    is_mirror_here: false,
    field_values: fieldValues,
    dnd_id: `${id}:stack-a`,
  };
}

const stacks = [
  {
    id: "stack-a",
    title: "Stack A",
    description: null,
    owner_id: null,
    position: 0,
    stack_lifecycle_status: "prioritized" as const,
    archived_at: null,
    field_values: {},
    is_mirrored: false,
    is_mirror_here: false,
    mirror_cards: [],
    cards: [
      card("active", 0, { priority: ["low"], status: ["todo"] }),
      card("target-1", 1, { priority: ["high"], status: ["todo"] }),
      card("target-2", 2, { priority: ["high"], status: ["todo"] }),
      card("target-3", 3, { priority: ["high"], status: ["todo"] }),
    ],
  },
];

const movedBefore = applyCardDrop(stacks, {
  activeId: "active:stack-a",
  targetStackId: "stack-a",
  targetColumnId: "high",
  columnFieldId: "priority",
  overCardId: "target-2:stack-a",
  overCardPlacement: "before",
});

assert.deepEqual(movedBefore[0].cards.map((c) => c.id), ["target-1", "active", "target-2", "target-3"]);
assert.deepEqual(movedBefore[0].cards[1].field_values.priority, ["high"]);
assert.deepEqual(movedBefore[0].cards[1].field_values.status, ["todo"]);

const movedAfter = applyCardDrop(stacks, {
  activeId: "active:stack-a",
  targetStackId: "stack-a",
  targetColumnId: "high",
  columnFieldId: "priority",
  overCardId: "target-2:stack-a",
  overCardPlacement: "after",
});

assert.deepEqual(movedAfter[0].cards.map((c) => c.id), ["target-1", "target-2", "active", "target-3"]);
