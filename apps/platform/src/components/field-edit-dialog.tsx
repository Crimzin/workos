"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
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

export function FieldEditDialog({
  field,
  workspaceId,
  open,
  onClose,
}: FieldEditDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(field.name);
  const [description, setDescription] = useState(field.description ?? "");
  const [color, setColor] = useState(field.color);
  const [locked, setLocked] = useState(field.locked ?? false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newOption, setNewOption] = useState("");

  useEffect(() => {
    if (open) {
      setName(field.name);
      setDescription(field.description ?? "");
      setColor(field.color);
      setLocked(field.locked ?? false);
      setError(null);
      setNewOption("");
    }
  }, [open, field.name, field.description, field.color, field.locked]);

  if (!open) return null;

  const isSelect =
    field.field_type === "single_select" || field.field_type === "multi_select";

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
    runAction(() =>
      updateField(field.id, workspaceId, {
        description: description.trim() || null,
      })
    );
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
    if (
      !confirm(
        `Delete field "${field.name}"? This also removes every value assigned to it.`
      )
    )
      return;
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

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...field.options];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    runAction(() =>
      reorderFieldOptions(
        field.id,
        workspaceId,
        next.map((o) => o.id)
      )
    );
  };

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
            <label className="section-label" htmlFor="edit-field-name">
              Name
            </label>
            <input
              id="edit-field-name"
              type="text"
              value={name}
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="mt-1 w-full rounded-md border border-border bg-bg-card px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="section-label" htmlFor="edit-field-description">
              Description
            </label>
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
              <span className="ml-1 text-xs text-text-tertiary">
                (type isn&apos;t editable yet)
              </span>
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
                {field.options.map((opt, idx) => (
                  <OptionEditRow
                    key={opt.id}
                    index={idx}
                    total={field.options.length}
                    optionId={opt.id}
                    name={opt.name}
                    workspaceId={workspaceId}
                    onMoveUp={() => move(idx, -1)}
                    onMoveDown={() => move(idx, 1)}
                    onDelete={() =>
                      runAction(() => deleteFieldOption(opt.id, workspaceId))
                    }
                    pending={pending}
                    onActionError={setError}
                  />
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newOption}
                    disabled={pending}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddOption();
                    }}
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

function OptionEditRow({
  index,
  total,
  optionId,
  name,
  workspaceId,
  onMoveUp,
  onMoveDown,
  onDelete,
  pending,
  onActionError,
}: {
  index: number;
  total: number;
  optionId: string;
  name: string;
  workspaceId: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  pending: boolean;
  onActionError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [, startTransition] = useTransition();

  useEffect(() => setDraft(name), [name]);

  const commitName = () => {
    if (draft.trim() === "" || draft === name) {
      setDraft(name);
      return;
    }
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
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(name);
            e.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        disabled={pending || index === 0}
        onClick={onMoveUp}
        aria-label="Move up"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-secondary disabled:opacity-30 transition-colors"
      >
        <ArrowUp size={12} />
      </button>
      <button
        type="button"
        disabled={pending || index === total - 1}
        onClick={onMoveDown}
        aria-label="Move down"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-secondary disabled:opacity-30 transition-colors"
      >
        <ArrowDown size={12} />
      </button>
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
    case "single_select":
      return "Single-select";
    case "multi_select":
      return "Multi-select";
    case "text":
      return "Text";
    case "date":
      return "Date";
  }
}
