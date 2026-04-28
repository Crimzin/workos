"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitFork, MoreHorizontal, Pencil } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardActor, BoardCard, BoardField } from "@/lib/board-types";
import { updateNodeTitle, archiveNode, unarchiveNode, deleteNode, unmirrorNode } from "@/lib/actions/nodes";
import { FieldBadge } from "../field-badge";
import { InlineFieldEditor } from "./inline-field-editor";
import { BoardAvatar } from "./board-avatar";
import { ConfirmModal } from "../confirm-modal";

interface CardTileProps {
  card: BoardCard;
  workspaceId: string;
  stackId: string;
  fields: BoardField[];
  columnFieldId: string | null;
  actors: Record<string, BoardActor>;
}

export function CardTile({ card, workspaceId, stackId, fields, columnFieldId, actors }: CardTileProps) {
  const search = useSearchParams();
  const isActive = search.get("d") === card.id;
  const router = useRouter();
  const isArchived = !!card.archived_at;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(card.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.select();
  }, [editing]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === card.title) {
      setEditing(false);
      setEditValue(card.title);
      return;
    }
    startTransition(async () => {
      await updateNodeTitle(card.id, trimmed, workspaceId, stackId);
      router.refresh();
      setEditing(false);
    });
  };

  const handleArchive = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await archiveNode(card.id, workspaceId, stackId);
      router.refresh();
    });
  };

  const handleUnarchive = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await unarchiveNode(card.id, workspaceId, stackId);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    startTransition(async () => {
      await deleteNode(card.id, workspaceId, stackId);
      router.refresh();
    });
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: "card" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  // All fields except the column field get inline editors
  const editorFields = fields.filter((f) => f.id !== columnFieldId);

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="touch-none">
        <div className="rounded-md border border-accent bg-bg-card p-2.5">
          <input
            ref={editRef}
            type="text"
            value={editValue}
            disabled={pending}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { setEditing(false); setEditValue(card.title); }
            }}
            onBlur={commitEdit}
            className="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
        <Link
          href={`/n/${workspaceId}?d=${card.id}`}
          scroll={false}
          aria-current={isActive ? "true" : undefined}
          className={[
            "group block rounded-md border p-2.5 transition-colors",
            isArchived ? "opacity-50 grayscale" : "",
            isActive
              ? "border-accent bg-bg-selected"
              : "border-border bg-bg-card hover:border-border-strong hover:bg-bg-hover",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              {isArchived && (
                <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-bg-hover text-text-tertiary">
                  Archived
                </span>
              )}
              <div className="text-sm font-medium text-text-primary line-clamp-2">{card.title}</div>
              {card.is_mirrored && (
                <GitFork size={9} className="shrink-0 text-text-tertiary" aria-label="Mirrored" />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {/* Rename pencil */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditValue(card.title);
                  setEditing(true);
                }}
                aria-label="Rename card"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
              >
                <Pencil size={10} />
              </button>
              {/* QUAM */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen((v) => !v);
                  }}
                  aria-label="Card actions"
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
                >
                  <MoreHorizontal size={12} />
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      aria-hidden
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); }}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-md border border-border bg-bg-card py-1 shadow-sm">
                      {isArchived ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnarchive(); }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
                        >
                          Unarchive
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleArchive(); }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
                        >
                          Archive
                        </button>
                      )}
                      <div className="my-1 h-px bg-border" />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); setConfirmDelete(true); }}
                        className="block w-full px-3 py-1.5 text-left text-sm text-red-500 transition-colors hover:bg-bg-hover disabled:opacity-40"
                      >
                        {card.is_mirrored ? "Delete from everywhere" : "Delete"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {card.description && (
            <div className="mt-1 text-xs text-text-secondary line-clamp-2">{card.description}</div>
          )}
          {(editorFields.length > 0 || (card.owner_id && actors[card.owner_id])) && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
              <div className="flex flex-wrap gap-1">
                {editorFields.map((field) => (
                  <InlineFieldEditor
                    key={field.id}
                    field={field}
                    selectedOptionIds={card.field_values[field.id] ?? []}
                    nodeId={card.id}
                    parentId={stackId}
                    workspaceId={workspaceId}
                  />
                ))}
              </div>
              {card.owner_id && actors[card.owner_id] && (
                <BoardAvatar actor={actors[card.owner_id]} size={20} />
              )}
            </div>
          )}
        </Link>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete card?"
          body={
            card.is_mirrored
              ? "This card appears in other stacks. Deleting it removes it everywhere. This cannot be undone."
              : "Are you sure? Deleted cards can't be recovered."
          }
          confirmLabel={card.is_mirrored ? "Delete from everywhere" : "Delete"}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

/** Pure visual used inside DragOverlay — no sortable wiring. */
export function CardTileOverlay({
  card,
  fields,
  columnFieldId,
}: {
  card: BoardCard;
  fields: BoardField[];
  columnFieldId: string | null;
}) {
  const badges = getStaticBadges(card, fields, columnFieldId);
  return (
    <div className="rounded-md border border-accent bg-bg-card p-2.5 shadow-lg ring-1 ring-accent/30">
      <div className="text-sm font-medium text-text-primary line-clamp-2">{card.title}</div>
      {card.description && (
        <div className="mt-1 text-xs text-text-secondary line-clamp-2">{card.description}</div>
      )}
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <FieldBadge key={b.id} name={b.name} color={b.color} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MirrorCardTile — non-draggable read-only tile for mirror copies of cards.
// Shown below the home cards in a stack. QUAM limited to "Remove from stack".
// ---------------------------------------------------------------------------

interface MirrorCardTileProps {
  card: BoardCard;
  workspaceId: string;
  stackId: string;
  fields: BoardField[];
  columnFieldId: string | null;
  actors: Record<string, BoardActor>;
}

export function MirrorCardTile({ card, workspaceId, stackId, fields, columnFieldId, actors }: MirrorCardTileProps) {
  const search = useSearchParams();
  const isActive = search.get("d") === card.id;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  const badges = getStaticBadges(card, fields, columnFieldId);

  const handleRemove = () => {
    setConfirmRemove(false);
    startTransition(async () => {
      await unmirrorNode(card.id, stackId, workspaceId);
      router.refresh();
    });
  };

  return (
    <>
      <div>
        <Link
          href={`/n/${workspaceId}?d=${card.id}`}
          scroll={false}
          aria-current={isActive ? "true" : undefined}
          className={[
            "group block rounded-md border p-2.5 transition-colors",
            isActive
              ? "border-accent bg-bg-selected"
              : "border-border border-dashed bg-bg-card/60 hover:border-border-strong hover:bg-bg-hover",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <div className="text-sm font-medium text-text-primary line-clamp-2">{card.title}</div>
              {/* GitFork always visible on mirror copies */}
              <GitFork size={9} className="shrink-0 text-accent/70 flex-none" aria-label="Mirrored here" />
            </div>
            {/* QUAM */}
            <div className="relative flex-none">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v); }}
                aria-label="Card actions"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
              >
                <MoreHorizontal size={12} />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); }}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-border bg-bg-card py-1 shadow-sm">
                    <Link
                      href={`/n/${workspaceId}?d=${card.id}`}
                      scroll={false}
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      Open
                    </Link>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); setConfirmRemove(true); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
                    >
                      Remove from this stack
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {card.description && (
            <div className="mt-1 text-xs text-text-secondary line-clamp-2">{card.description}</div>
          )}
          {(badges.length > 0 || (card.owner_id && actors[card.owner_id])) && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
              <div className="flex flex-wrap gap-1">
                {badges.map((b) => (
                  <FieldBadge key={b.id} name={b.name} color={b.color} />
                ))}
              </div>
              {card.owner_id && actors[card.owner_id] && (
                <BoardAvatar actor={actors[card.owner_id]} size={20} />
              )}
            </div>
          )}
        </Link>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove from this stack?"
          body="This removes the card from this stack. It stays in all other stacks where it appears."
          confirmLabel="Remove"
          onConfirm={handleRemove}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </>
  );
}

function getStaticBadges(card: BoardCard, fields: BoardField[], columnFieldId: string | null) {
  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    if (field.id === columnFieldId) continue;
    const selected = card.field_values[field.id] ?? [];
    for (const optionId of selected) {
      const opt = field.options.find((o) => o.id === optionId);
      if (opt) badges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }
  return badges;
}
