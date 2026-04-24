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
import type { BoardActor, BoardCard, BoardData, BoardField, BoardStack } from "@/lib/board-types";
import { UNASSIGNED_COL_ID } from "@/lib/board-types";
import type { ViewFilter, WorkspaceView } from "@/lib/views";
import { createStack } from "@/lib/actions/nodes";
import { updateViewColumnField, updateViewFilters } from "@/lib/actions/views";
import { moveCard, reorderStack } from "@/lib/actions/dnd";
import { InlineCreate } from "../inline-create";
import { FieldCreateDialog } from "../field-create-dialog";
import { StackRow } from "./stack-row";
import { CardTileOverlay } from "./card-tile";
import { ViewTabs } from "./view-tabs";
import { FilterMenu } from "./filter-menu";

type ActiveCard = { type: "card"; card: BoardCard };
type ActiveStack = { type: "stack"; stack: BoardStack };
type ActiveItem = ActiveCard | ActiveStack | null;

interface BoardProps {
  data: BoardData;
  views: WorkspaceView[];
}

export function Board({ data, views }: BoardProps) {
  const starredView = views.find((v) => v.starred) ?? views[0] ?? null;
  const [activeView, setActiveView] = useState<WorkspaceView | null>(starredView);
  const [localViews, setLocalViews] = useState<WorkspaceView[]>(views);

  const initialColumnFieldId = activeView?.column_field_id ?? data.defaultColumnFieldId;
  const [columnFieldId, setColumnFieldId] = useState<string | null>(initialColumnFieldId);
  const [filters, setFilters] = useState<ViewFilter[]>(activeView?.filters ?? []);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [localStacks, setLocalStacks] = useState<BoardStack[]>(data.stacks);
  const [activeItem, setActiveItem] = useState<ActiveItem>(null);
  const preDragStacks = useRef<BoardStack[]>(data.stacks);
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeDetailId = searchParams.get("d");
  const workspaceId = data.workspace.id;

  // Sync local state when server data refreshes.
  useEffect(() => { setLocalStacks(data.stacks); }, [data.stacks]);
  useEffect(() => { setLocalViews(views); }, [views]);

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
  };

  const handleFiltersChange = (newFilters: ViewFilter[]) => {
    setFilters(newFilters);
    if (activeView) updateViewFilters(activeView.id, workspaceId, newFilters);
  };

  const columnField = useMemo(
    () => data.fields.find((f) => f.id === columnFieldId) ?? null,
    [data.fields, columnFieldId]
  );

  // Apply filters: a card passes if every active filter has at least one matching optionId.
  const filteredStacks = useMemo(() => {
    if (filters.length === 0) return localStacks;
    return localStacks.map((stack) => ({
      ...stack,
      cards: stack.cards.filter((card) =>
        filters.every((f) => {
          const vals = card.field_values[f.fieldId] ?? [];
          return f.optionIds.some((oid) => vals.includes(oid));
        })
      ),
    }));
  }, [localStacks, filters]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart({ active }: DragStartEvent) {
    preDragStacks.current = localStacks;
    const type = active.data.current?.type as string;

    if (type === "stack") {
      const stack = localStacks.find((s) => s.id === active.id);
      if (stack) setActiveItem({ type: "stack", stack });
    } else if (type === "card") {
      for (const stack of localStacks) {
        const card = stack.cards.find((c) => c.id === active.id);
        if (card) { setActiveItem({ type: "card", card }); break; }
      }
    }
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    if (active.data.current?.type !== "card") return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const overType = over.data.current?.type as string | undefined;

    setLocalStacks((prev) => {
      if (overType === "column") {
        return applyCardOverColumn(
          prev, activeId,
          over.data.current!.stackId as string,
          over.data.current!.columnId as string,
          columnFieldId
        );
      }
      if (overType === "card") {
        return applyCardOverCard(prev, activeId, overId, columnFieldId);
      }
      return prev;
    });
  }

  function handleDragCancel() {
    setLocalStacks(preDragStacks.current);
    setActiveItem(null);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
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
      // localStacks already has the card in its new position from onDragOver.
      const loc = findCardLocation(localStacks, activeId, columnFieldId);
      if (!loc) return;

      const colCards = localStacks[loc.stackIdx].cards.filter(
        (c) => getCardColumn(c, columnFieldId) === loc.columnId
      );
      const cardIdxInCol = colCards.findIndex((c) => c.id === activeId);
      const newPos = midpoint(
        colCards[cardIdxInCol - 1]?.position ?? null,
        colCards[cardIdxInCol + 1]?.position ?? null
      );
      const newOptionId = loc.columnId === UNASSIGNED_COL_ID ? null : loc.columnId;

      try {
        await moveCard(activeId, workspaceId, localStacks[loc.stackIdx].id, newPos, columnFieldId, newOptionId);
        router.refresh();
      } catch {
        setLocalStacks(preDragStacks.current);
        router.refresh();
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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
            }}
            currentColumnFieldId={columnFieldId}
            currentFilters={filters}
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
              filters={filters}
              onChange={handleFiltersChange}
            />
            <div className="flex-1" />
            <InlineCreate
              label="New Stack"
              placeholder="Stack name"
              icon={<Plus size={13} />}
              onSubmit={async (title) => {
                const res = await createStack(workspaceId, title);
                router.refresh();
                return res;
              }}
              buttonClassName="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              inputClassName="w-48 rounded-md border border-border-strong bg-bg-card px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            {localStacks.length === 0 ? (
              <EmptyWorkspace />
            ) : (
              <SortableContext
                items={localStacks.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredStacks.map((stack, i) => (
                  <StackRow
                    key={stack.id}
                    stack={stack}
                    workspaceId={workspaceId}
                    columnField={columnField}
                    fields={data.fields}
                    activeDetailId={activeDetailId}
                    stackIndex={i}
                    totalStacks={localStacks.length}
                    actors={data.actors}
                  />
                ))}
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
              columnFieldId={columnFieldId}
            />
          </div>
        )}
        {activeItem?.type === "stack" && (
          <div className="w-60 rounded-md border border-accent bg-bg-secondary/80 px-4 py-3 shadow-lg">
            <div className="section-label">Stack</div>
            <div className="mt-0.5 truncate text-base font-semibold text-text-primary">
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

function getCardColumn(card: BoardCard, columnFieldId: string | null): string {
  if (!columnFieldId) return UNASSIGNED_COL_ID;
  const vals = card.field_values[columnFieldId] ?? [];
  return vals[0] ?? UNASSIGNED_COL_ID;
}

function setCardColumn(card: BoardCard, columnFieldId: string | null, colId: string): BoardCard {
  if (!columnFieldId) return card;
  return {
    ...card,
    field_values: {
      ...card.field_values,
      [columnFieldId]: colId === UNASSIGNED_COL_ID ? [] : [colId],
    },
  };
}

function findCardLocation(
  stacks: BoardStack[],
  cardId: string,
  columnFieldId: string | null
): { stackIdx: number; cardIdx: number; columnId: string } | null {
  for (let si = 0; si < stacks.length; si++) {
    const ci = stacks[si].cards.findIndex((c) => c.id === cardId);
    if (ci !== -1) {
      return {
        stackIdx: si,
        cardIdx: ci,
        columnId: getCardColumn(stacks[si].cards[ci], columnFieldId),
      };
    }
  }
  return null;
}

function applyCardOverCard(
  stacks: BoardStack[],
  activeId: string,
  overId: string,
  columnFieldId: string | null
): BoardStack[] {
  const activeLoc = findCardLocation(stacks, activeId, null);
  const overLoc = findCardLocation(stacks, overId, null);
  if (!activeLoc || !overLoc) return stacks;

  const overCard = stacks[overLoc.stackIdx].cards[overLoc.cardIdx];
  const overColId = getCardColumn(overCard, columnFieldId);
  const updatedActive = setCardColumn(stacks[activeLoc.stackIdx].cards[activeLoc.cardIdx], columnFieldId, overColId);

  const next = stacks.map((s) => ({ ...s, cards: [...s.cards] }));

  if (activeLoc.stackIdx === overLoc.stackIdx) {
    next[activeLoc.stackIdx].cards[activeLoc.cardIdx] = updatedActive;
    next[activeLoc.stackIdx].cards = arrayMove(
      next[activeLoc.stackIdx].cards,
      activeLoc.cardIdx,
      overLoc.cardIdx
    );
  } else {
    next[activeLoc.stackIdx].cards.splice(activeLoc.cardIdx, 1);
    const adjustedOverIdx =
      overLoc.stackIdx > activeLoc.stackIdx
        ? overLoc.cardIdx
        : overLoc.cardIdx;
    next[overLoc.stackIdx].cards.splice(adjustedOverIdx, 0, updatedActive);
  }

  return next;
}

function applyCardOverColumn(
  stacks: BoardStack[],
  activeId: string,
  targetStackId: string,
  targetColId: string,
  columnFieldId: string | null
): BoardStack[] {
  const activeLoc = findCardLocation(stacks, activeId, null);
  if (!activeLoc) return stacks;

  const activeCard = stacks[activeLoc.stackIdx].cards[activeLoc.cardIdx];
  // Already in this column of this stack — nothing to do.
  if (
    stacks[activeLoc.stackIdx].id === targetStackId &&
    getCardColumn(activeCard, columnFieldId) === targetColId
  )
    return stacks;

  const updatedCard = setCardColumn(activeCard, columnFieldId, targetColId);
  const next = stacks.map((s) => ({ ...s, cards: [...s.cards] }));

  next[activeLoc.stackIdx].cards.splice(activeLoc.cardIdx, 1);

  const targetIdx = next.findIndex((s) => s.id === targetStackId);
  if (targetIdx !== -1) {
    next[targetIdx].cards.push(updatedCard);
  }

  return next;
}

function midpoint(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 0;
  if (prev === null) return next! - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EmptyWorkspace() {
  return (
    <div className="flex min-h-[240px] items-center justify-center px-6 py-16">
      <div className="max-w-sm text-center">
        <h3 className="text-base font-medium text-text-primary">This workspace is empty.</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Create your first stack to start organizing work.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <Plus size={14} />
          Create Stack
        </button>
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
