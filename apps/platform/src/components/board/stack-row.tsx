"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitFork, GripVertical, MoreHorizontal, Pencil, Plus, Unlink } from "lucide-react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BoardActor, BoardField, BoardStack } from "@/lib/board-types";
import { UNASSIGNED_COL_ID } from "@/lib/board-types";
import { createCard, updateNodeTitle, moveStackUpDown, archiveNode, unarchiveNode, deleteNode, unmirrorNode } from "@/lib/actions/nodes";
import { ConfirmModal } from "../confirm-modal";
import { updateFieldOption } from "@/lib/actions/fields";
import { InlineCreate } from "../inline-create";
import { CardTile, MirrorCardTile } from "./card-tile";
import { InlineFieldEditor } from "./inline-field-editor";
import { BoardAvatar } from "./board-avatar";

interface StackRowProps {
  stack: BoardStack;
  workspaceId: string;
  columnField: BoardField | null;
  columnFieldId: string | null;
  fields: BoardField[];
  activeDetailId: string | null;
  stackIndex: number;
  totalStacks: number;
  actors: Record<string, BoardActor>;
  collapsedColumnIds: string[];
  onToggleColumnCollapse: (colId: string) => void;
  onColumnFieldChange: (fieldId: string | null) => void;
}

export function StackRow({ stack, workspaceId, columnField, columnFieldId, fields, activeDetailId, stackIndex, totalStacks, actors, collapsedColumnIds, onToggleColumnCollapse, onColumnFieldChange }: StackRowProps) {
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

  // Assign each home card to exactly one column (first matching value) for DnD correctness.
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

  // Assign mirror cards to columns (same logic, but these are non-draggable).
  const mirrorCardsByColumn = new Map<string, BoardStack["mirror_cards"]>();
  for (const col of columns) mirrorCardsByColumn.set(col.id, []);

  for (const card of stack.mirror_cards ?? []) {
    if (!columnField) {
      mirrorCardsByColumn.get(UNASSIGNED_COL_ID)!.push(card);
      continue;
    }
    const values = card.field_values[columnField.id] ?? [];
    let assigned = false;
    for (const optionId of values) {
      if (mirrorCardsByColumn.has(optionId)) {
        mirrorCardsByColumn.get(optionId)!.push(card);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      mirrorCardsByColumn.get(UNASSIGNED_COL_ID)!.push(card);
    }
  }

  const isArchived = !!stack.archived_at;

  return (
    <div ref={setNodeRef} style={style} className={["border-b border-border", isArchived ? "opacity-50 grayscale" : ""].join(" ")}>
      <div className="flex items-stretch">
        <StackHeader
          stack={stack}
          workspaceId={workspaceId}
          isActive={isActive}
          isArchived={isArchived}
          fields={fields}
          dragListeners={listeners}
          dragAttributes={attributes}
          stackIndex={stackIndex}
          totalStacks={totalStacks}
          actors={actors}
          columnFieldId={columnFieldId}
          onColumnFieldChange={onColumnFieldChange}
        />
        <div className="flex flex-1 min-w-0">
          {columns.map((col) => {
            const cards = cardsByColumn.get(col.id) ?? [];
            const mirrorCards = mirrorCardsByColumn.get(col.id) ?? [];
            const isUnassigned = col.id === UNASSIGNED_COL_ID;
            return (
              <DroppableColumn
                key={col.id}
                stackId={stack.id}
                col={col}
                cards={cards}
                mirrorCards={mirrorCards}
                isUnassigned={isUnassigned}
                workspaceId={workspaceId}
                fields={fields}
                columnField={columnField}
                actors={actors}
                collapsed={collapsedColumnIds.includes(col.id)}
                onToggleCollapse={() => onToggleColumnCollapse(col.id)}
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
  mirrorCards,
  isUnassigned,
  workspaceId,
  fields,
  columnField,
  actors,
  collapsed,
  onToggleCollapse,
  onAddCard,
}: {
  stackId: string;
  col: { id: string; name: string; color: string | null };
  cards: BoardStack["cards"];
  mirrorCards: BoardStack["mirror_cards"];
  isUnassigned: boolean;
  workspaceId: string;
  fields: BoardField[];
  columnField: BoardField | null;
  actors: Record<string, BoardActor>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAddCard: (title: string) => Promise<void | { id: string }>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${stackId}:${col.id}`,
    data: { type: "column", stackId, columnId: col.id },
  });

  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(col.name);
  const [pending, startTransition] = useTransition();
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (!trimmed || trimmed === col.name) { setRenameValue(col.name); return; }
    startTransition(async () => {
      await updateFieldOption(col.id, workspaceId, { name: trimmed });
      router.refresh();
    });
  };

  // ── Collapsed view ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className="flex w-8 shrink-0 cursor-pointer flex-col items-center border-l border-border bg-bg-primary hover:bg-bg-hover transition-colors"
        onClick={onToggleCollapse}
        title={`Expand ${col.name} (${cards.length})`}
      >
        <div className="flex flex-1 flex-col items-center justify-start pt-3 gap-2">
          <span
            className={[
              "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium",
              isUnassigned ? "text-text-tertiary" : "bg-bg-hover text-text-secondary",
            ].join(" ")}
          >
            {cards.length + mirrorCards.length}
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {col.name}
          </span>
        </div>
      </div>
    );
  }

  // ── Expanded view ─────────────────────────────────────────────────────────
  return (
    <div
      ref={setNodeRef}
      className={[
        "flex w-72 shrink-0 flex-col border-l border-border transition-colors",
        isOver ? "bg-bg-hover" : "bg-bg-primary",
      ].join(" ")}
    >
      <div className="group flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {renaming ? (
            <input
              ref={renameRef}
              type="text"
              value={renameValue}
              disabled={pending}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setRenaming(false); setRenameValue(col.name); }
              }}
              onBlur={commitRename}
              className="w-32 rounded border border-border-strong bg-bg-card px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          ) : col.color ? (
            <span className={`badge badge-${colorToBadgeIndex(col.color)} px-1.5 py-0.5 text-[10px]`}>
              {col.name}
            </span>
          ) : (
            <span className="section-label truncate">{col.name}</span>
          )}
          {!isUnassigned && !renaming && (
            <button
              type="button"
              onClick={() => { setRenameValue(col.name); setRenaming(true); }}
              aria-label="Rename column"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
            >
              <Pencil size={10} />
            </button>
          )}
          <span
            className={[
              "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium",
              isUnassigned ? "text-text-tertiary" : "bg-bg-hover text-text-secondary",
            ].join(" ")}
          >
            {cards.length + mirrorCards.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse column"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100 group/header hover:opacity-100"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5h6M2 2l3 3-3 3" />
          </svg>
        </button>
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
              stackId={stackId}
              fields={fields}
              columnFieldId={columnField?.id ?? null}
              actors={actors}
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
          {/* Mirror copies — non-draggable, shown below home cards */}
          {mirrorCards.length > 0 && (
            <div className="mt-1 flex flex-col gap-2">
              {mirrorCards.map((c) => (
                <MirrorCardTile
                  key={`mirror-${c.id}`}
                  card={c}
                  workspaceId={workspaceId}
                  stackId={stackId}
                  fields={fields}
                  columnFieldId={columnField?.id ?? null}
                  actors={actors}
                />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function StackHeader({
  stack,
  workspaceId,
  isActive,
  isArchived,
  fields,
  dragListeners,
  dragAttributes,
  stackIndex,
  totalStacks,
  actors,
  columnFieldId,
  onColumnFieldChange,
}: {
  stack: BoardStack;
  workspaceId: string;
  isActive: boolean;
  isArchived: boolean;
  fields: BoardField[];
  dragListeners: ReturnType<typeof useSortable>["listeners"];
  dragAttributes: ReturnType<typeof useSortable>["attributes"];
  stackIndex: number;
  totalStacks: number;
  actors: Record<string, BoardActor>;
  columnFieldId: string | null;
  onColumnFieldChange: (fieldId: string | null) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(stack.title);
  const [pending, startTransition] = useTransition();
  const columnFieldName = columnFieldId ? (fields.find((f) => f.id === columnFieldId)?.name ?? null) : null;
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === stack.title) {
      setRenaming(false);
      setRenameValue(stack.title);
      return;
    }
    startTransition(async () => {
      await updateNodeTitle(stack.id, trimmed, workspaceId, workspaceId);
      router.refresh();
      setRenaming(false);
    });
  };

  return (
    <>
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

        {renaming ? (
          <div className="min-w-0 flex-1">
            <div className="section-label">Stack{columnFieldName ? ` · ${columnFieldName}` : ""}</div>
            <input
              ref={renameRef}
              type="text"
              value={renameValue}
              disabled={pending}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setRenaming(false); setRenameValue(stack.title); }
              }}
              onBlur={commitRename}
              className="mt-0.5 w-full rounded border border-border-strong bg-bg-card px-1 py-0.5 text-base font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        ) : (
          <Link
            href={`/n/${workspaceId}?d=${stack.id}`}
            scroll={false}
            className="min-w-0 flex-1 group"
          >
            <div className="section-label">Stack{columnFieldName ? ` · ${columnFieldName}` : ""}</div>
            <div className="flex items-start gap-1">
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
              {stack.is_mirrored && (
                <GitFork
                  size={10}
                  className="mt-2 shrink-0 text-text-tertiary"
                  aria-label="Mirrored"
                />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRenameValue(stack.title);
                  setRenaming(true);
                }}
                aria-label="Rename stack"
                className="mt-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
              >
                <Pencil size={10} />
              </button>
            </div>
            {stack.description && (
              <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{stack.description}</p>
            )}
            {fields.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {fields.map((field) => (
                  <InlineFieldEditor
                    key={field.id}
                    field={field}
                    selectedOptionIds={stack.field_values[field.id] ?? []}
                    nodeId={stack.id}
                    parentId={workspaceId}
                    workspaceId={workspaceId}
                  />
                ))}
              </div>
            )}
            {stack.owner_id && actors[stack.owner_id] && (
              <div className="mt-2">
                <BoardAvatar actor={actors[stack.owner_id]} size={20} />
              </div>
            )}
          </Link>
        )}

        {/* QUAM */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Stack actions"
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-border bg-bg-card py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setRenameValue(stack.title); setRenaming(true); }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={stackIndex === 0 || pending}
                  onClick={() => {
                    setMenuOpen(false);
                    startTransition(async () => {
                      await moveStackUpDown(stack.id, workspaceId, "up");
                      router.refresh();
                    });
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40"
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={stackIndex === totalStacks - 1 || pending}
                  onClick={() => {
                    setMenuOpen(false);
                    startTransition(async () => {
                      await moveStackUpDown(stack.id, workspaceId, "down");
                      router.refresh();
                    });
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40"
                >
                  Move down
                </button>
                {fields.length > 0 && (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">Columns</div>
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onColumnFieldChange(null); }}
                      className={[
                        "block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover",
                        columnFieldId === null ? "font-medium text-text-primary" : "text-text-secondary hover:text-text-primary",
                      ].join(" ")}
                    >
                      None
                    </button>
                    {fields.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => { setMenuOpen(false); onColumnFieldChange(f.id); }}
                        className={[
                          "block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover",
                          f.id === columnFieldId ? "font-medium text-text-primary" : "text-text-secondary hover:text-text-primary",
                        ].join(" ")}
                      >
                        {f.name}
                      </button>
                    ))}
                  </>
                )}
                <div className="my-1 h-px bg-border" />
                {isArchived ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setMenuOpen(false);
                      startTransition(async () => {
                        await unarchiveNode(stack.id, workspaceId, workspaceId);
                        router.refresh();
                      });
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40"
                  >
                    Unarchive
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setMenuOpen(false);
                      startTransition(async () => {
                        await archiveNode(stack.id, workspaceId, workspaceId);
                        router.refresh();
                      });
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40"
                  >
                    Archive
                  </button>
                )}
                {/* Mirror context: "Remove from this workspace" before Delete */}
                {stack.is_mirror_here && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmRemove(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40"
                  >
                    <Unlink size={12} />
                    Remove from here
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-red-500 transition-colors hover:bg-bg-hover disabled:cursor-default disabled:opacity-40"
                >
                  {stack.is_mirror_here || stack.is_mirrored ? "Delete from everywhere" : "Delete"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {confirmDelete && (
      <ConfirmModal
        title="Delete stack?"
        body={
          stack.is_mirror_here
            ? "This deletes the stack from all workspaces, including all its cards. This cannot be undone."
            : stack.is_mirrored
            ? "This stack appears in other workspaces. Deleting it removes it everywhere, including all its cards. This cannot be undone."
            : "Are you sure? Deleted stacks and all their cards can't be recovered."
        }
        confirmLabel={stack.is_mirror_here || stack.is_mirrored ? "Delete from everywhere" : "Delete"}
        onConfirm={() => {
          setConfirmDelete(false);
          startTransition(async () => {
            await deleteNode(stack.id, workspaceId, workspaceId);
            router.refresh();
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    )}
    {confirmRemove && (
      <ConfirmModal
        title="Remove from this workspace?"
        body="This removes the stack from this workspace. It stays in all other workspaces where it appears."
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirmRemove(false);
          startTransition(async () => {
            await unmirrorNode(stack.id, workspaceId, workspaceId);
            router.refresh();
          });
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    )}
    </>
  );
}

function colorToBadgeIndex(color: string): number {
  const match = /badge-([1-6])/.exec(color);
  return match ? Number(match[1]) : 1;
}
