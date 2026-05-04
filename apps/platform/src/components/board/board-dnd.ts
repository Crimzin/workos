export interface DndBoardCard {
  dnd_id: string;
  field_values: Record<string, string[]>;
}

export interface DndBoardStack<Card extends DndBoardCard = DndBoardCard> {
  id: string;
  cards: Card[];
}

export interface CardDropTarget {
  activeId: string;
  targetStackId: string;
  targetColumnId: string;
  columnFieldId: string | null;
  overCardId?: string | null;
  overCardPlacement?: "before" | "after";
  unassignedColumnId?: string;
}

export function getCardColumn(
  card: DndBoardCard,
  columnFieldId: string | null,
  unassignedColumnId: string
): string {
  if (!columnFieldId) return unassignedColumnId;
  const vals = card.field_values[columnFieldId] ?? [];
  return vals[0] ?? unassignedColumnId;
}

export function findCardLocation<Stack extends DndBoardStack>(
  stacks: Stack[],
  dndId: string,
  columnFieldId: string | null,
  unassignedColumnId: string
): { stackIdx: number; cardIdx: number; columnId: string } | null {
  for (let si = 0; si < stacks.length; si++) {
    const ci = stacks[si].cards.findIndex((c) => c.dnd_id === dndId);
    if (ci !== -1) {
      return {
        stackIdx: si,
        cardIdx: ci,
        columnId: getCardColumn(stacks[si].cards[ci], columnFieldId, unassignedColumnId),
      };
    }
  }
  return null;
}

export function applyCardDrop<Stack extends DndBoardStack>(
  stacks: Stack[],
  target: CardDropTarget
): Stack[] {
  const unassignedColumnId = target.unassignedColumnId ?? "__unassigned__";
  const activeLoc = findCardLocation(stacks, target.activeId, target.columnFieldId, unassignedColumnId);
  if (!activeLoc) return stacks;

  const activeCard = stacks[activeLoc.stackIdx].cards[activeLoc.cardIdx];
  const next = stacks.map((s) => ({ ...s, cards: [...s.cards] }));
  next[activeLoc.stackIdx].cards.splice(activeLoc.cardIdx, 1);

  const targetIdx = next.findIndex((s) => s.id === target.targetStackId);
  if (targetIdx === -1) return stacks;

  const updatedCard = setCardColumn(activeCard, target.columnFieldId, target.targetColumnId, unassignedColumnId);
  const insertIdx = getInsertIndex(
    next[targetIdx],
    target.overCardId,
    target.overCardPlacement,
    target.targetColumnId,
    target.columnFieldId,
    unassignedColumnId
  );
  next[targetIdx].cards.splice(insertIdx, 0, updatedCard);

  return next;
}

function setCardColumn<Card extends DndBoardCard>(
  card: Card,
  columnFieldId: string | null,
  colId: string,
  unassignedColumnId: string
): Card {
  if (!columnFieldId) return card;
  return {
    ...card,
    field_values: {
      ...card.field_values,
      [columnFieldId]: colId === unassignedColumnId ? [] : [colId],
    },
  };
}

function getInsertIndex<Stack extends DndBoardStack>(
  stack: Stack,
  overCardId: string | null | undefined,
  overCardPlacement: "before" | "after" | undefined,
  targetColumnId: string,
  columnFieldId: string | null,
  unassignedColumnId: string
): number {
  if (overCardId) {
    const overIdx = stack.cards.findIndex((c) => c.dnd_id === overCardId);
    if (overIdx !== -1) return overCardPlacement === "after" ? overIdx + 1 : overIdx;
  }

  let lastInColumnIdx = -1;
  for (let i = 0; i < stack.cards.length; i++) {
    if (getCardColumn(stack.cards[i], columnFieldId, unassignedColumnId) === targetColumnId) {
      lastInColumnIdx = i;
    }
  }
  return lastInColumnIdx === -1 ? stack.cards.length : lastInColumnIdx + 1;
}
