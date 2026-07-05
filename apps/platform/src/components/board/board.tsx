"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { BoardCard, BoardData, BoardStack } from "@/lib/board-types";
import { UNASSIGNED_COL_ID } from "@/lib/board-types";
import type { ViewFilter, WorkspaceView } from "@/lib/views";
import {
  createStack,
  getThreadPlacementCandidates,
  placeThreadInBoard,
} from "@/lib/actions/nodes";
import { updateViewColumnField, updateViewFilters, updateViewStackFilters, updateViewCollapsedColumns, updateViewStackColumnField } from "@/lib/actions/views";
import { moveCardAppearance, reorderStack } from "@/lib/actions/dnd";
import { FieldCreateDialog } from "../field-create-dialog";
import { StackRow } from "./stack-row";
import { CardTileOverlay } from "./card-tile";
import { ViewTabs } from "./view-tabs";
import { FilterMenu } from "./filter-menu";
import { ThreadPickerCreate } from "./thread-picker-create";
import {
  applyCardDrop,
  findCardLocation,
  getCardColumn,
} from "./board-dnd";

type ActiveCard = { type: "card"; card: BoardCard; columnFieldId: string | null };
type ActiveStack = { type: "stack"; stack: BoardStack };
type ActiveItem = ActiveCard | ActiveStack | null;

interface BoardProps {
  data: BoardData;
  views: WorkspaceView[];
  navigationMode?: "board-detail" | "thread";
}

export function Board({ data, views, navigationMode = "board-detail" }: BoardProps) {
  const starredView = views.find((v) => v.starred) ?? views[0] ?? null;
  const [activeView, setActiveView] = useState<WorkspaceView | null>(starredView);
  const [localViews, setLocalViews] = useState<WorkspaceView[]>(views);

  const initialColumnFieldId = activeView?.column_field_id ?? data.defaultColumnFieldId;
  const [columnFieldId, setColumnFieldId] = useState<string | null>(initialColumnFieldId);
  const [filters, setFilters] = useState<ViewFilter[]>(activeView?.filters ?? []);
  const [stackFilters, setStackFilters] = useState<ViewFilter[]>(activeView?.stack_filters ?? []);
  const [hiddenStackIds, setHiddenStackIds] = useState<string[]>(activeView?.hidden_stack_ids ?? []);
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<string[]>(activeView?.collapsed_column_ids ?? []);
  const [collapsedStackIds, setCollapsedStackIds] = useState<string[]>([]);
  const [stackColumnFields, setStackColumnFields] = useState<Record<string, string | null>>(activeView?.stack_column_fields ?? {});
  const [showArchived, setShowArchived] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [localStacks, setLocalStacks] = useState<BoardStack[]>(data.stacks);
  const [activeItem, setActiveItem] = useState<ActiveItem>(null);
  const preDragStacks = useRef<BoardStack[]>(data.stacks);
  const lastMoveRef = useRef<{
    activeId: string;
    targetStackId: string;
    targetColumnId: string;
    columnFieldId: string | null;
    overCardId: string | null;
    overCardPlacement: "before" | "after";
  } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeDetailId = searchParams.get("d");
  const workspaceId = data.workspace.id;
  const collapsedStackStorageKey = activeView
    ? `workos:collapsed-stacks:${workspaceId}:${activeView.id}`
    : `workos:collapsed-stacks:${workspaceId}:default`;

  // Sync local state when server data refreshes.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLocalStacks(data.stacks);
    });
    return () => {
      cancelled = true;
    };
  }, [data.stacks]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLocalViews(views);
    });
    return () => {
      cancelled = true;
    };
  }, [views]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setCollapsedStackIds(readCollapsedStackIds(collapsedStackStorageKey));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [collapsedStackStorageKey]);

  const handleColumnFieldChange = (fieldId: string | null) => {
    setColumnFieldId(fieldId);
    if (activeView) {
      updateViewColumnField(activeView.id, workspaceId, fieldId);
    }
  };

  const handleViewSwitch = (view: WorkspaceView) => {
    setActiveView(view);
    setColumnFieldId(view.column_field_id ?? data.defaultColumnFieldId);
    setFilters(view.filters ?? []);
    setStackFilters(view.stack_filters ?? []);
    setHiddenStackIds(view.hidden_stack_ids ?? []);
    setCollapsedColumnIds(view.collapsed_column_ids ?? []);
    setStackColumnFields(view.stack_column_fields ?? {});
  };

  const handleStackColumnFieldChange = (stackId: string, fieldId: string | null) => {
    const next = { ...stackColumnFields };
    if (fieldId === null) delete next[stackId];
    else next[stackId] = fieldId;
    setStackColumnFields(next);
    if (activeView) updateViewStackColumnField(activeView.id, workspaceId, stackId, fieldId);
  };

  const handleToggleColumnCollapse = (colId: string) => {
    const next = collapsedColumnIds.includes(colId)
      ? collapsedColumnIds.filter((id) => id !== colId)
      : [...collapsedColumnIds, colId];
    setCollapsedColumnIds(next);
    if (activeView) updateViewCollapsedColumns(activeView.id, workspaceId, next);
  };

  const handleToggleStackCollapse = (stackId: string) => {
    const next = collapsedStackIds.includes(stackId)
      ? collapsedStackIds.filter((id) => id !== stackId)
      : [...collapsedStackIds, stackId];
    setCollapsedStackIds(next);
    writeCollapsedStackIds(collapsedStackStorageKey, next);
  };

  const handleFiltersChange = (newFilters: ViewFilter[]) => {
    setFilters(newFilters);
    if (activeView) updateViewFilters(activeView.id, workspaceId, newFilters);
  };

  const handleStackFiltersChange = (newStackFilters: ViewFilter[], newHiddenIds: string[]) => {
    setStackFilters(newStackFilters);
    setHiddenStackIds(newHiddenIds);
    if (activeView) updateViewStackFilters(activeView.id, workspaceId, newStackFilters, newHiddenIds);
  };

  const columnField = useMemo(
    () => data.fields.find((f) => f.id === columnFieldId) ?? null,
    [data.fields, columnFieldId]
  );

  // Apply stack-level and card-level filters.
  const filteredStacks = useMemo(() => {
    let stacks = localStacks;

    // 0. Archived visibility
    if (!showArchived) {
      stacks = stacks
        .filter((s) => !s.archived_at)
        .map((s) => ({ ...s, cards: s.cards.filter((c) => !c.archived_at) }));
    }

    // 1. Stack on/off
    if (hiddenStackIds.length > 0) {
      stacks = stacks.filter((s) => !hiddenStackIds.includes(s.id));
    }

    // 2. Stack field filters (AND across fields, OR within a field)
    if (stackFilters.length > 0) {
      stacks = stacks.filter((stack) =>
        stackFilters.every((f) => {
          const vals = stack.field_values[f.fieldId] ?? [];
          return f.optionIds.some((oid) => vals.includes(oid));
        })
      );
    }

    // 3. Card field filters
    if (filters.length === 0) return stacks;
    return stacks.map((stack) => ({
      ...stack,
      cards: stack.cards.filter((card) =>
        filters.every((f) => {
          const vals = card.field_values[f.fieldId] ?? [];
          return f.optionIds.some((oid) => vals.includes(oid));
        })
      ),
    }));
  }, [localStacks, filters, stackFilters, hiddenStackIds, showArchived]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const collisionDetection: CollisionDetection = (args) => {
    const activeType = args.active?.data?.current?.type as string | undefined;

    if (activeType === "stack") {
      const stackOnly = args.droppableContainers.filter(
        (c) => c.data?.current?.type === "stack"
      );
      return closestCenter({ ...args, droppableContainers: stackOnly });
    }

    const colContainers = args.droppableContainers.filter(
      (c) => c.data?.current?.type === "column"
    );
    const cardContainers = args.droppableContainers.filter(
      (c) => c.data?.current?.type === "card"
    );

    // Step 1: determine which column the pointer is inside.
    // Checking columns first (before global card search) is what makes empty
    // columns work — a global closestCenter on cards would return a card from
    // another column and the column droppable would never fire.
    const pointerInColumn = pointerWithin({ ...args, droppableContainers: colContainers });

    if (pointerInColumn.length > 0) {
      const colRect = args.droppableRects.get(pointerInColumn[0].id);

      if (colRect) {
        // Scope card search to cards whose centers lie within this column's rect.
        // (droppableRects are stale during drag, but cards that haven't moved
        // since drag start will still have accurate rects for this check.)
        const cardsInColumn = cardContainers.filter((c) => {
          const r = args.droppableRects.get(c.id);
          if (!r) return false;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          return cx >= colRect.left && cx <= colRect.right && cy >= colRect.top && cy <= colRect.bottom;
        });

        // Prefer card the pointer is directly over; otherwise closest center.
        const over = pointerWithin({ ...args, droppableContainers: cardsInColumn });
        if (over.length > 0) return over;

        const closest = closestCenter({ ...args, droppableContainers: cardsInColumn });
        if (closest.length > 0) return closest;
      }

      // Column is empty (or rects not yet measured) — return the column droppable.
      return pointerInColumn;
    }

    // Pointer not in any column (between columns, over header, etc.).
    // Fall back to globally closest card so cross-column drags still work.
    const closest = closestCenter({ ...args, droppableContainers: cardContainers });
    if (closest.length > 0) return closest;

    return closestCenter({ ...args, droppableContainers: colContainers });
  };

  function handleDragStart({ active }: DragStartEvent) {
    preDragStacks.current = localStacks;
    lastMoveRef.current = null;
    const type = active.data.current?.type as string;

    if (type === "stack") {
      const stack = localStacks.find((s) => s.id === active.id);
      if (stack) setActiveItem({ type: "stack", stack });
    } else if (type === "card") {
      for (const stack of localStacks) {
        const card = stack.cards.find((c) => c.dnd_id === active.id);
        if (card) {
          const activeColumnFieldId = getDndColumnFieldId(active.data.current, columnFieldId);
          setActiveItem({ type: "card", card, columnFieldId: activeColumnFieldId });
          break;
        }
      }
    }
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    if (active.data.current?.type !== "card") return;

    const activeId = active.id as string;
    const overType = over.data.current?.type as string | undefined;
    const activeColumnFieldId = getDndColumnFieldId(active.data.current, columnFieldId);

    const activeLoc = findCardLocation(localStacks, activeId, activeColumnFieldId, UNASSIGNED_COL_ID);
    if (!activeLoc) return;
    const activeCard = localStacks[activeLoc.stackIdx].cards[activeLoc.cardIdx];
    const activeColId = getCardColumn(activeCard, activeColumnFieldId, UNASSIGNED_COL_ID);
    const activeStackId = localStacks[activeLoc.stackIdx].id;

    let targetStackId: string;
    let targetColId: string;
    let targetColumnFieldId: string | null;
    let overCardId: string | null = null;
    let overCardPlacement: "before" | "after" = "after";

    if (overType === "column") {
      targetStackId = over.data.current!.stackId as string;
      targetColId = over.data.current!.columnId as string;
      targetColumnFieldId = getDndColumnFieldId(over.data.current, columnFieldId);
    } else if (overType === "card") {
      const overId = over.id as string;
      targetColumnFieldId = getDndColumnFieldId(over.data.current, columnFieldId);
      const overLoc = findCardLocation(localStacks, overId, targetColumnFieldId, UNASSIGNED_COL_ID);
      if (!overLoc) return;
      const overCard = localStacks[overLoc.stackIdx].cards[overLoc.cardIdx];
      targetColId = getCardColumn(overCard, targetColumnFieldId, UNASSIGNED_COL_ID);
      targetStackId = localStacks[overLoc.stackIdx].id;
      overCardId = overId;
      overCardPlacement = getOverCardPlacement(active.rect.current.translated, over.rect);

      if (
        activeStackId === targetStackId &&
        activeColumnFieldId === targetColumnFieldId &&
        activeColId === targetColId
      ) {
        // Same column, same stack — let SortableContext handle the visual preview
        // and use arrayMove in handleDragOver to update localStacks for live feedback.
        // Dedup by (activeId, overId) to prevent stale-rect oscillation.
        if (
          lastMoveRef.current?.activeId === activeId &&
          lastMoveRef.current.targetStackId === targetStackId &&
          lastMoveRef.current.targetColumnId === targetColId &&
          lastMoveRef.current.columnFieldId === targetColumnFieldId &&
          lastMoveRef.current.overCardId === overId &&
          lastMoveRef.current.overCardPlacement === overCardPlacement
        ) return;
        lastMoveRef.current = { activeId, targetStackId, targetColumnId: targetColId, columnFieldId: targetColumnFieldId, overCardId, overCardPlacement };

        const stackIdx = activeLoc.stackIdx;
        if (activeLoc.cardIdx === overLoc.cardIdx) return;
        const newCards = arrayMove(localStacks[stackIdx].cards, activeLoc.cardIdx, overLoc.cardIdx);
        setLocalStacks((prev) =>
          prev.map((s, i) => (i === stackIdx ? { ...s, cards: newCards } : s))
        );
        return;
      }
    } else {
      return;
    }

    // Cross-column or cross-stack: move card to the target column, preserving
    // the hovered-card insertion point when DnD gives us one.
    if (
      activeStackId === targetStackId &&
      activeColumnFieldId === targetColumnFieldId &&
      activeColId === targetColId
    ) return;
    if (
      lastMoveRef.current?.activeId === activeId &&
      lastMoveRef.current.targetStackId === targetStackId &&
      lastMoveRef.current.targetColumnId === targetColId &&
      lastMoveRef.current.columnFieldId === targetColumnFieldId &&
      lastMoveRef.current.overCardId === overCardId &&
      lastMoveRef.current.overCardPlacement === overCardPlacement
    ) return;
    lastMoveRef.current = { activeId, targetStackId, targetColumnId: targetColId, columnFieldId: targetColumnFieldId, overCardId, overCardPlacement };
    setLocalStacks((prev) =>
      applyCardDrop(prev, {
        activeId,
        targetStackId,
        targetColumnId: targetColId,
        columnFieldId: targetColumnFieldId,
        overCardId,
        overCardPlacement,
        unassignedColumnId: UNASSIGNED_COL_ID,
      })
    );
  }

  function handleDragCancel() {
    setLocalStacks(preDragStacks.current);
    setActiveItem(null);
    lastMoveRef.current = null;
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    lastMoveRef.current = null;
    setActiveItem(null);
    if (!over) { setLocalStacks(preDragStacks.current); return; }

    const activeId = active.id as string;
    const type = active.data.current?.type as string;

    if (type === "stack") {
      const oldIdx = localStacks.findIndex((s) => s.id === activeId);
      const newIdx = localStacks.findIndex((s) => s.id === over.id);
      if (oldIdx === newIdx || newIdx === -1) return;

      const reordered = arrayMove(localStacks, oldIdx, newIdx);
      setLocalStacks(reordered);

      const newPos = midpoint(
        reordered[newIdx - 1]?.position ?? null,
        reordered[newIdx + 1]?.position ?? null
      );
      try {
        await reorderStack(activeId, workspaceId, newPos);
        router.refresh();
      } catch {
        setLocalStacks(preDragStacks.current);
        router.refresh();
      }
      return;
    }

    if (type === "card") {
      // handleDragOver already positioned the card correctly via arrayMove (same-column)
      // or applyCardDrop (cross-column/stack).
      const finalColumnFieldId = getDndColumnFieldId(over.data.current, getDndColumnFieldId(active.data.current, columnFieldId));
      const loc = findCardLocation(localStacks, activeId, finalColumnFieldId, UNASSIGNED_COL_ID);
      if (!loc) return;

      const colCards = localStacks[loc.stackIdx].cards.filter(
        (c) => getCardColumn(c, finalColumnFieldId, UNASSIGNED_COL_ID) === loc.columnId
      );
      const cardIdxInCol = colCards.findIndex((c) => c.dnd_id === activeId);
      const newPos = midpoint(
        colCards[cardIdxInCol - 1]?.position ?? null,
        colCards[cardIdxInCol + 1]?.position ?? null
      );
      const newOptionId = loc.columnId === UNASSIGNED_COL_ID ? null : loc.columnId;

      // Compound dnd_id = "${cardId}:${stackId}" — parse both parts.
      // UUIDs use only hyphens so splitting on ":" gives exactly two parts.
      const colonIdx = activeId.indexOf(":");
      const realCardId = activeId.slice(0, colonIdx);
      const sourceStackId = activeId.slice(colonIdx + 1);
      const targetStackId = localStacks[loc.stackIdx].id;

      try {
        await moveCardAppearance(realCardId, sourceStackId, targetStackId, newPos, finalColumnFieldId, newOptionId, workspaceId);
        router.refresh();
      } catch {
        setLocalStacks(preDragStacks.current);
        router.refresh();
      }
    }
  }

  return (
    <DndContext
      id={`board-${workspaceId}`}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full flex-col">
        {/* View tabs */}
        {localViews.length > 0 && activeView && (
          <ViewTabs
            views={localViews}
            activeViewId={activeView.id}
            workspaceId={workspaceId}
            onSwitch={handleViewSwitch}
            onViewCreated={(v) => {
              setLocalViews((prev) => [...prev, v]);
              setActiveView(v);
              setColumnFieldId(v.column_field_id ?? data.defaultColumnFieldId);
              setFilters(v.filters ?? []);
              setStackFilters(v.stack_filters ?? []);
              setHiddenStackIds(v.hidden_stack_ids ?? []);
              setCollapsedColumnIds(v.collapsed_column_ids ?? []);
              setCollapsedStackIds([]);
              setStackColumnFields(v.stack_column_fields ?? {});
            }}
            currentColumnFieldId={columnFieldId}
            currentFilters={filters}
            currentStackFilters={stackFilters}
            currentHiddenStackIds={hiddenStackIds}
            currentCollapsedColumnIds={collapsedColumnIds}
          />
        )}

        {/* Toolbar */}
        <div className="shrink-0 border-b border-border bg-bg-secondary/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-3">
            <div className="flex items-baseline gap-2">
              <span className="section-label">Columns</span>
              <ColumnFieldMenu
                fields={data.fields}
                currentId={columnFieldId}
                onSelect={handleColumnFieldChange}
                onAddField={() => setFieldDialogOpen(true)}
              />
            </div>
            <div className="mx-1 h-4 w-px bg-border" />
            <FilterMenu
              fields={data.fields}
              stacks={localStacks}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              stackFilters={stackFilters}
              hiddenStackIds={hiddenStackIds}
              onStackFiltersChange={handleStackFiltersChange}
              showArchived={showArchived}
              onShowArchivedChange={setShowArchived}
            />
            <div className="flex-1" />
            <ThreadPickerCreate
              label="Add Stack"
              placeholder="Stack name"
              icon={<Plus size={13} />}
              loadCandidates={(query, limit) =>
                getThreadPlacementCandidates(workspaceId, query, limit)
              }
              onSelect={async (threadId) => {
                const res = await placeThreadInBoard({
                  threadId,
                  targetParentId: workspaceId,
                  workspaceId,
                });
                router.refresh();
                return res;
              }}
              onCreate={async (title) => {
                const res = await createStack(workspaceId, title);
                router.refresh();
                return res;
              }}
              buttonClassName="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              inputClassName="w-48 rounded-md border border-border-strong bg-bg-card py-1 pl-7 pr-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              menuAlign="right"
              menuClassName="w-96 max-w-[calc(100vw-2rem)]"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            {localStacks.length === 0 ? (
              <EmptyWorkspace
                loadCandidates={(query, limit) =>
                  getThreadPlacementCandidates(workspaceId, query, limit)
                }
                onSelect={async (threadId) => {
                  const res = await placeThreadInBoard({
                    threadId,
                    targetParentId: workspaceId,
                    workspaceId,
                  });
                  router.refresh();
                  return res;
                }}
                onCreate={async (title) => {
                  const res = await createStack(workspaceId, title);
                  router.refresh();
                  return res;
                }}
              />
            ) : (
              <SortableContext
                items={localStacks.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredStacks.map((stack, i) => {
                  const overrideFieldId = stackColumnFields[stack.id];
                  const effectiveColumnField = overrideFieldId !== undefined
                    ? (data.fields.find((f) => f.id === overrideFieldId) ?? null)
                    : columnField;
                  return (
                    <StackRow
                      key={stack.id}
                      stack={stack}
                      workspaceId={workspaceId}
                      columnField={effectiveColumnField}
                      columnFieldId={overrideFieldId !== undefined ? overrideFieldId : columnFieldId}
                      fields={data.fields}
                      activeDetailId={activeDetailId}
                      stackIndex={i}
                      totalStacks={localStacks.length}
                      actors={data.actors}
                      navigationMode={navigationMode}
                      collapsedColumnIds={collapsedColumnIds}
                      isStackCollapsed={collapsedStackIds.includes(stack.id)}
                      onToggleColumnCollapse={handleToggleColumnCollapse}
                      onToggleStackCollapse={() => handleToggleStackCollapse(stack.id)}
                      onColumnFieldChange={(fieldId) => handleStackColumnFieldChange(stack.id, fieldId)}
                    />
                  );
                })}
              </SortableContext>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeItem?.type === "card" && (
          <div className="w-72">
            <CardTileOverlay
              card={activeItem.card}
              fields={data.fields}
              columnFieldId={activeItem.columnFieldId}
            />
          </div>
        )}
        {activeItem?.type === "stack" && (
          <div className="w-60 rounded-md border border-accent bg-bg-secondary/80 px-4 py-3 shadow-lg">
            <div className="line-clamp-2 text-base font-semibold text-text-primary">
              {activeItem.stack.title}
            </div>
          </div>
        )}
      </DragOverlay>

      <FieldCreateDialog
        workspaceId={workspaceId}
        open={fieldDialogOpen}
        onClose={() => setFieldDialogOpen(false)}
      />
    </DndContext>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function midpoint(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 0;
  if (prev === null) return next! - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

function getDndColumnFieldId(
  data: Record<string, unknown> | undefined,
  fallback: string | null
): string | null {
  if (!data || !("columnFieldId" in data)) return fallback;
  return (data.columnFieldId as string | null | undefined) ?? null;
}

function getOverCardPlacement(
  activeRect: { top: number; height: number } | null,
  overRect: { top: number; height: number }
): "before" | "after" {
  if (!activeRect) return "after";
  const activeMiddle = activeRect.top + activeRect.height / 2;
  const overMiddle = overRect.top + overRect.height / 2;
  return activeMiddle > overMiddle ? "after" : "before";
}

function readCollapsedStackIds(storageKey: string): string[] {
  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return [];
    const value = JSON.parse(rawValue);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeCollapsedStackIds(storageKey: string, stackIds: string[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(stackIds));
  } catch {
    // Ignore storage failures; collapse still works for the current session.
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EmptyWorkspace({
  loadCandidates,
  onSelect,
  onCreate,
}: {
  loadCandidates: (
    query: string,
    limit?: number
  ) => ReturnType<typeof getThreadPlacementCandidates>;
  onSelect: (threadId: string) => Promise<void | { id: string }>;
  onCreate: (title: string) => Promise<void | { id: string }>;
}) {
  return (
    <div className="flex min-h-[240px] items-center justify-center px-6 py-16">
      <div className="max-w-sm text-center">
        <h3 className="text-base font-medium text-text-primary">This workspace is empty.</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Create your first stack to start organizing work.
        </p>
        <div className="mt-4 inline-block text-left">
          <ThreadPickerCreate
            label="Add Stack"
            placeholder="Stack name"
            icon={<Plus size={14} />}
            loadCandidates={loadCandidates}
            onSelect={onSelect}
            onCreate={onCreate}
            buttonClassName="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          />
        </div>
      </div>
    </div>
  );
}

function ColumnFieldMenu({
  fields,
  currentId,
  onSelect,
  onAddField,
}: {
  fields: BoardData["fields"];
  currentId: string | null;
  onSelect: (id: string | null) => void;
  onAddField: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = fields.find((f) => f.id === currentId);
  const label = current ? current.name : "None";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
      >
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary">
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-bg-card py-1 shadow-sm">
            {fields.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">No list-type fields yet.</div>
            )}
            {fields.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { onSelect(f.id); setOpen(false); }}
                className={[
                  "block w-full px-3 py-1.5 text-left text-sm transition-colors",
                  f.id === currentId
                    ? "bg-bg-selected text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{f.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    {f.field_type === "single_select" ? "single" : "multi"}
                  </span>
                </div>
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => { setOpen(false); onAddField(); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <Plus size={12} />
              <span>Add field</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
