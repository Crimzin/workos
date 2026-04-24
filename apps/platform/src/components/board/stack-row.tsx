"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BoardField, BoardStack } from "@/lib/board-types";
import { UNASSIGNED_COL_ID } from "@/lib/board-types";
import { createCard } from "@/lib/actions/nodes";
import { FieldBadge } from "../field-badge";
import { InlineCreate } from "../inline-create";
import { CardTile } from "./card-tile";

interface StackRowProps {
  stack: BoardStack;
  workspaceId: string;
  columnField: BoardField | null;
  fields: BoardField[];
  activeDetailId: string | null;
}

export function StackRow({ stack, workspaceId, columnField, fields, activeDetailId }: StackRowProps) {
  const router = useRouter();
  const isActive = activeDetailId === stack.id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stack.id,
    data: { type: "stack" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const columns = columnField
    ? [
        { id: UNASSIGNED_COL_ID, name: "No " + columnField.name, color: null as string | null },
        ...columnField.options.map((o) => ({ id: o.id, name: o.name, color: columnField.color })),
      ]
    : [{ id: UNASSIGNED_COL_ID, name: "All", color: null as string | null }];

  // Assign each card to exactly one column (first matching value) for DnD correctness.
  const cardsByColumn = new Map<string, BoardStack["cards"]>();
  for (const col of columns) cardsByColumn.set(col.id, []);

  const placed = new Set<string>();
  for (const card of stack.cards) {
    if (!columnField) {
      cardsByColumn.get(UNASSIGNED_COL_ID)!.push(card);
      placed.add(card.id);
      continue;
    }
    const values = card.field_values[columnField.id] ?? [];
    let assigned = false;
    for (const optionId of values) {
      if (cardsByColumn.has(optionId) && !placed.has(card.id)) {
        cardsByColumn.get(optionId)!.push(card);
        placed.add(card.id);
        assigned = true;
        break;
      }
    }
    if (!assigned && !placed.has(card.id)) {
      cardsByColumn.get(UNASSIGNED_COL_ID)!.push(card);
      placed.add(card.id);
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="border-b border-border">
      <div className="flex items-stretch">
        <StackHeader
          stack={stack}
          workspaceId={workspaceId}
          isActive={isActive}
          fields={fields}
          dragListeners={listeners}
          dragAttributes={attributes}
        />
        <div className="flex flex-1 min-w-0">
          {columns.map((col) => {
            const cards = cardsByColumn.get(col.id) ?? [];
            const isUnassigned = col.id === UNASSIGNED_COL_ID;
            return (
              <DroppableColumn
                key={col.id}
                stackId={stack.id}
                col={col}
                cards={cards}
                isUnassigned={isUnassigned}
                workspaceId={workspaceId}
                fields={fields}
                columnField={columnField}
                onAddCard={async (title) => {
                  const res = await createCard(
                    stack.id,
                    workspaceId,
                    title,
                    isUnassigned ? null : columnField?.id ?? null,
                    isUnassigned ? null : col.id
                  );
                  router.refresh();
                  return res;
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({
  stackId,
  col,
  cards,
  isUnassigned,
  workspaceId,
  fields,
  columnField,
  onAddCard,
}: {
  stackId: string;
  col: { id: string; name: string; color: string | null };
  cards: BoardStack["cards"];
  isUnassigned: boolean;
  workspaceId: string;
  fields: BoardField[];
  columnField: BoardField | null;
  onAddCard: (title: string) => Promise<void | { id: string }>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${stackId}:${col.id}`,
    data: { type: "column", stackId, columnId: col.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex w-72 shrink-0 flex-col border-l border-border transition-colors",
        isOver ? "bg-bg-hover" : "bg-bg-primary",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {col.color ? (
            <span className={`badge badge-${colorToBadgeIndex(col.color)} px-1.5 py-0.5 text-[10px]`}>
              {col.name}
            </span>
          ) : (
            <span className="section-label truncate">{col.name}</span>
          )}
          <span
            className={[
              "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium",
              isUnassigned ? "text-text-tertiary" : "bg-bg-hover text-text-secondary",
            ].join(" ")}
          >
            {cards.length}
          </span>
        </div>
      </div>

      <SortableContext
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
          {cards.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              workspaceId={workspaceId}
              fields={fields}
              columnFieldId={columnField?.id ?? null}
            />
          ))}
          <InlineCreate
            label="Add card"
            placeholder="Card title"
            icon={<Plus size={12} />}
            onSubmit={onAddCard}
            buttonClassName="mt-1 inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-xs text-text-tertiary hover:border-border-strong hover:text-text-secondary hover:bg-bg-hover transition-colors"
            inputClassName="mt-1 w-full rounded-md border border-border-strong bg-bg-card px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </SortableContext>
    </div>
  );
}

function StackHeader({
  stack,
  workspaceId,
  isActive,
  fields,
  dragListeners,
  dragAttributes,
}: {
  stack: BoardStack;
  workspaceId: string;
  isActive: boolean;
  fields: BoardField[];
  dragListeners: ReturnType<typeof useSortable>["listeners"];
  dragAttributes: ReturnType<typeof useSortable>["attributes"];
}) {
  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    const optionIds = stack.field_values[field.id] ?? [];
    for (const optionId of optionIds) {
      const opt = field.options.find((o) => o.id === optionId);
      if (opt) badges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }

  return (
    <div
      className={[
        "w-60 shrink-0 border-r border-border px-4 py-3 transition-colors",
        isActive
          ? "border-l-2 border-l-accent bg-bg-selected"
          : "bg-bg-secondary/60",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...dragListeners}
          {...dragAttributes}
          aria-label="Drag to reorder stack"
          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded text-text-tertiary hover:text-text-secondary active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
        <Link
          href={`/n/${workspaceId}?d=${stack.id}`}
          scroll={false}
          className="min-w-0 flex-1 group"
        >
          <div className="section-label">Stack</div>
          <h3
            className={[
              "mt-0.5 truncate text-base font-semibold transition-colors",
              isActive
                ? "text-accent"
                : "text-text-primary group-hover:text-accent",
            ].join(" ")}
          >
            {stack.title}
          </h3>
          {stack.description && (
            <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{stack.description}</p>
          )}
          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {badges.map((b) => (
                <FieldBadge key={b.id} name={b.name} color={b.color} />
              ))}
            </div>
          )}
        </Link>
        <button
          type="button"
          disabled
          title="Stack actions (coming soon)"
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}

function colorToBadgeIndex(color: string): number {
  const match = /badge-([1-6])/.exec(color);
  return match ? Number(match[1]) : 1;
}
