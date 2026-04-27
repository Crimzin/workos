"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addFieldOption,
  deleteField,
  deleteFieldOption,
  renameField,
  reorderFieldOptions,
  updateField,
  updateFieldOption,
} from "@/lib/actions/fields";
import type { DetailField } from "@/lib/node-detail";
import { ColorPicker } from "./color-picker";

interface FieldEditDialogProps {
  field: DetailField;
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}

export function FieldEditDialog({ field, workspaceId, open, onClose }: FieldEditDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(field.name);
  const [description, setDescription] = useState(field.description ?? "");
  const [color, setColor] = useState(field.color);
  const [locked, setLocked] = useState(field.locked ?? false);
  const [localOptions, setLocalOptions] = useState(field.options);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newOption, setNewOption] = useState("");

  useEffect(() => {
    if (open) {
      setName(field.name);
      setDescription(field.description ?? "");
      setColor(field.color);
      setLocked(field.locked ?? false);
      setLocalOptions(field.options);
      setError(null);
      setNewOption("");
    }
  }, [open, field.name, field.description, field.color, field.locked, field.options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!open) return null;

  const isSelect = field.field_type === "single_select" || field.field_type === "multi_select";

  const runAction = (fn: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed === field.name) return;
    runAction(() => renameField(field.id, workspaceId, trimmed));
  };

  const saveDescription = () => {
    if (description === (field.description ?? "")) return;
    runAction(() => updateField(field.id, workspaceId, { description: description.trim() || null }));
  };

  const changeColor = (next: string) => {
    setColor(next);
    runAction(() => updateField(field.id, workspaceId, { color: next }));
  };

  const toggleLocked = (next: boolean) => {
    setLocked(next);
    runAction(() => updateField(field.id, workspaceId, { locked: next }));
  };

  const handleDeleteField = () => {
    if (!confirm(`Delete field "${field.name}"? This also removes every value assigned to it.`)) return;
    runAction(async () => {
      await deleteField(field.id, workspaceId);
      onClose();
    });
  };

  const handleAddOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    runAction(async () => {
      await addFieldOption(field.id, workspaceId, trimmed);
      setNewOption("");
    });
  };

  function handleOptionDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIdx = localOptions.findIndex((o) => o.id === active.id);
    const newIdx = localOptions.findIndex((o) => o.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(localOptions, oldIdx, newIdx);
    setLocalOptions(reordered);
    runAction(() => reorderFieldOptions(field.id, workspaceId, reordered.map((o) => o.id)));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-bg-primary shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Edit field</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-5 px-4 py-4">
          <div>
            <label className="section-label" htmlFor="edit-field-name">Name</label>
            <input
              id="edit-field-name"
              type="text"
              value={name}
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="mt-1 w-full rounded-md border border-border bg-bg-card px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="section-label" htmlFor="edit-field-description">Description</label>
            <textarea
              id="edit-field-description"
              rows={2}
              value={description}
              disabled={pending}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="Optional"
              className="mt-1 w-full resize-none rounded-md border border-border bg-bg-card px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <div className="section-label">Type</div>
            <div className="mt-1 text-sm text-text-secondary">
              {prettyType(field.field_type)}
              <span className="ml-1 text-xs text-text-tertiary">(type isn&apos;t editable yet)</span>
            </div>
          </div>

          <div>
            <div className="section-label">Color</div>
            <div className="mt-1">
              <ColorPicker value={color} onChange={changeColor} />
            </div>
          </div>

          {isSelect && (
            <div>
              <div className="section-label">Options</div>
              <div className="mt-1 space-y-1.5">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleOptionDragEnd}
                >
                  <SortableContext
                    items={localOptions.map((o) => o.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {localOptions.map((opt) => (
                      <SortableOptionRow
                        key={opt.id}
                        optionId={opt.id}
                        name={opt.name}
                        workspaceId={workspaceId}
                        onDelete={() => {
                          setLocalOptions((prev) => prev.filter((o) => o.id !== opt.id));
                          runAction(() => deleteFieldOption(opt.id, workspaceId));
                        }}
                        pending={pending}
                        onActionError={setError}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newOption}
                    disabled={pending}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddOption(); }}
                    placeholder="Add new option"
                    className="min-w-0 flex-1 rounded-md border border-dashed border-border bg-bg-card px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={handleAddOption}
                    disabled={pending || newOption.trim() === ""}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50 transition-colors"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={locked}
              disabled={pending}
              onChange={(e) => toggleLocked(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Lock this field (prevent edits from views)
          </label>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-500">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={handleDeleteField}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-60 transition-colors"
          >
            <Trash2 size={12} />
            Delete field
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-60 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableOptionRow({
  optionId,
  name,
  workspaceId,
  onDelete,
  pending,
  onActionError,
}: {
  optionId: string;
  name: string;
  workspaceId: string;
  onDelete: () => void;
  pending: boolean;
  onActionError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [, startTransition] = useTransition();

  useEffect(() => setDraft(name), [name]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: optionId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const commitName = () => {
    if (draft.trim() === "" || draft === name) { setDraft(name); return; }
    onActionError(null);
    startTransition(async () => {
      try {
        await updateFieldOption(optionId, workspaceId, { name: draft });
        router.refresh();
      } catch (e) {
        onActionError(e instanceof Error ? e.message : "Could not update option.");
        setDraft(name);
      }
    });
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-text-tertiary hover:text-text-secondary active:cursor-grabbing"
      >
        <GripVertical size={12} />
      </button>
      <input
        type="text"
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(name); e.currentTarget.blur(); }
        }}
        className="min-w-0 flex-1 rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        disabled={pending}
        onClick={onDelete}
        aria-label="Delete option"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-red-500 transition-colors"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function prettyType(t: DetailField["field_type"]): string {
  switch (t) {
    case "single_select": return "Single-select";
    case "multi_select": return "Multi-select";
    case "text": return "Text";
    case "date": return "Date";
  }
}
