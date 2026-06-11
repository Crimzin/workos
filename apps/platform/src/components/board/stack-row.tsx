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
import { createCard, updateNodeTitle, moveStackUpDown, archiveNode, unarchiveNode, deleteNode, unmirrorNode, mirrorNode, getWorkspacesForStack, updateStackLifecycle } from "@/lib/actions/nodes";
import type { StackLifecycleStatus } from "@/lib/types";
import { ConfirmModal } from "../confirm-modal";
import { updateFieldOption } from "@/lib/actions/fields";
import { InlineCreate } from "../inline-create";
import { CardTile } from "./card-tile";
import { MirrorToSubmenu } from "./mirror-to-submenu";
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
  navigationMode: "board-detail" | "thread";
  collapsedColumnIds: string[];
  onToggleColumnCollapse: (colId: string) => void;
  onColumnFieldChange: (fieldId: string | null) => void;
}

export function StackRow({ stack, workspaceId, columnField, columnFieldId, fields, activeDetailId, stackIndex, totalStacks, actors, navigationMode, collapsedColumnIds, onToggleColumnCollapse, onColumnFieldChange }: StackRowProps) {
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

  // Assign each card (home + mirror) to exactly one column for DnD correctness.
  // All appearances share the same cards array after the board.ts merge.
  const cardsByColumn = new Map<string, BoardStack["cards"]>();
  for (const col of columns) cardsByColumn.set(col.id, []);

  const placed = new Set<string>();
  for (const card of stack.cards) {
    // Use dnd_id as the dedup key so two appearances of the same card in different
    // stacks are treated independently.
    if (!columnField) {
      cardsByColumn.get(UNASSIGNED_COL_ID)!.push(card);
      placed.add(card.dnd_id);
      continue;
    }
    const values = card.field_values[columnField.id] ?? [];
    let assigned = false;
    for (const optionId of values) {
      if (cardsByColumn.has(optionId) && !placed.has(card.dnd_id)) {
        cardsByColumn.get(optionId)!.push(card);
        placed.add(card.dnd_id);
        assigned = true;
        break;
      }
    }
    if (!assigned && !placed.has(card.dnd_id)) {
      cardsByColumn.get(UNASSIGNED_COL_ID)!.push(card);
      placed.add(card.dnd_id);
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
          navigationMode={navigationMode}
          onColumnFieldChange={onColumnFieldChange}
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
                actors={actors}
                navigationMode={navigationMode}
                collapsed={collapsedColumnIds.includes(col.id)}
                onToggleCollapse={() => onToggleColumnCollapse(col.id)}
                onAddCard={async (title) => {
                  const res = await createCard(
                    stack.id,
                    workspaceId,
                    title,
                    columnField?.id ?? null,
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
  actors,
  navigationMode,
  collapsed,
  onToggleCollapse,
  onAddCard,
}: {
  stackId: string;
  col: { id: string; name: string; color: string | null };
  cards: BoardStack["cards"];
  isUnassigned: boolean;
  workspaceId: string;
  fields: BoardField[];
  columnField: BoardField | null;
  actors: Record<string, BoardActor>;
  navigationMode: "board-detail" | "thread";
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAddCard: (title: string) => Promise<void | { id: string }>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${stackId}:${col.id}`,
    data: { type: "column", stackId, columnId: col.id, columnFieldId: columnField?.id ?? null },
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
            {cards.length}
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
            {cards.length}
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
        items={cards.map((c) => c.dnd_id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
          {cards.map((c) => (
            <CardTile
              key={c.dnd_id}
              card={c}
              workspaceId={workspaceId}
              stackId={stackId}
              fields={fields}
              columnFieldId={columnField?.id ?? null}
              actors={actors}
              navigationMode={navigationMode}
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
  isArchived,
  fields,
  dragListeners,
  dragAttributes,
  stackIndex,
  totalStacks,
  actors,
  navigationMode,
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
  navigationMode: "board-detail" | "thread";
  columnFieldId: string | null;
  onColumnFieldChange: (fieldId: string | null) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [mirrorTargets, setMirrorTargets] = useState<{ id: string; title: string }[]>([]);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(stack.title);
  const [pending, startTransition] = useTransition();
  const columnFieldName = columnFieldId ? (fields.find((f) => f.id === columnFieldId)?.name ?? null) : null;
  const renameRef = useRef<HTMLInputElement>(null);
  const lifecycle = stack.stack_lifecycle_status ?? "prioritized";

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const closeMenu = () => {
    setMenuOpen(false);
    setMirrorOpen(false);
    setMirrorTargets([]);
  };

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      setMirrorOpen(false);
      setMirrorTargets([]);
      setMenuOpen(true);
    }
  };

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

  const openMirrorMenu = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mirrorOpen) { setMirrorOpen(false); return; }
    setMirrorOpen(true);
    setMirrorLoading(true);
    const targets = await getWorkspacesForStack(stack.id, workspaceId);
    setMirrorTargets(targets);
    setMirrorLoading(false);
  };

  const handleMirrorTo = (targetWorkspaceId: string) => {
    setMenuOpen(false);
    startTransition(async () => {
      await mirrorNode(stack.id, targetWorkspaceId, workspaceId, targetWorkspaceId);
      router.refresh();
    });
  };

  const updateLifecycle = (status: StackLifecycleStatus) => {
    setLifecycleOpen(false);
    closeMenu();
    startTransition(async () => {
      await updateStackLifecycle(stack.id, workspaceId, status);
      router.refresh();
    });
  };

  return (
    <>
    <div
      className={[
        "w-60 shrink-0 border-r border-border px-4 py-3 transition-colors",
        isActive
          ? "border-l-2 border-l-accent-warm bg-accent-subtle"
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
            href={navigationMode === "thread" ? `/n/${stack.id}` : `/n/${workspaceId}?view=board&d=${stack.id}`}
            scroll={false}
            className="min-w-0 flex-1 group"
          >
            <div className="section-label">Stack{columnFieldName ? ` · ${columnFieldName}` : ""}</div>
            <div className="flex items-start gap-1">
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLifecycleOpen((v) => !v);
                  }}
                  aria-label="Change stack lifecycle"
                  className="mt-1.5 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-bg-hover"
                >
                  <LifecycleDot status={lifecycle} />
                </button>
                {lifecycleOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      aria-hidden
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLifecycleOpen(false);
                      }}
                    />
                    <div
                      className="absolute left-0 top-full z-30 mt-1 w-40 rounded-md border border-border bg-bg-card py-1 shadow-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      {STACK_LIFECYCLE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={pending}
                          onClick={() => updateLifecycle(option.value)}
                          className={[
                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover disabled:opacity-40",
                            option.value === lifecycle
                              ? "font-medium text-text-primary"
                              : "text-text-secondary hover:text-text-primary",
                          ].join(" ")}
                        >
                          <LifecycleDot status={option.value} />
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <h3
                className={[
                  "mt-0.5 truncate text-base font-semibold transition-colors",
                  isActive
                    ? "text-accent"
                    : "text-text-primary group-hover:text-accent-warm",
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
            onClick={toggleMenu}
            aria-label="Stack actions"
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={closeMenu} />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-border bg-bg-card py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setRenameValue(stack.title); setRenaming(true); }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  Rename
                </button>
                {/* Mirror to workspace */}
                <button
                  type="button"
                  disabled={pending}
                  onClick={openMirrorMenu}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover disabled:opacity-40",
                    mirrorOpen ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
                  ].join(" ")}
                >
                  <GitFork size={12} />
                  Mirror to…
                </button>
                {mirrorOpen && (
                  <MirrorToSubmenu
                    targets={mirrorTargets}
                    loading={mirrorLoading}
                    placeholder="Search workspaces…"
                    emptyMessage="No other workspaces"
                    onSelect={(id) => handleMirrorTo(id)}
                  />
                )}
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
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">Lifecycle</div>
                {STACK_LIFECYCLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      updateLifecycle(option.value);
                    }}
                    className={[
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover disabled:opacity-40",
                      option.value === lifecycle ? "font-medium text-text-primary" : "text-text-secondary hover:text-text-primary",
                    ].join(" ")}
                  >
                    <LifecycleDot status={option.value} />
                    {option.label}
                  </button>
                ))}
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

const STACK_LIFECYCLE_OPTIONS: Array<{
  value: StackLifecycleStatus;
  label: string;
}> = [
  { value: "prioritized", label: "Prioritized" },
  { value: "deprioritized", label: "Deprioritized" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

function LifecycleDot({ status }: { status: StackLifecycleStatus }) {
  const className =
    status === "prioritized"
      ? "bg-accent"
      : status === "deprioritized"
        ? "bg-status-review"
      : status === "completed"
        ? "bg-status-done"
        : status === "archived"
          ? "bg-text-tertiary"
          : "bg-status-none";

  return (
    <span
      title={STACK_LIFECYCLE_OPTIONS.find((o) => o.value === status)?.label}
      className={["mt-2 h-2 w-2 shrink-0 rounded-full", className].join(" ")}
    />
  );
}
