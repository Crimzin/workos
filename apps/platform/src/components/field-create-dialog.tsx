"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { createField } from "@/lib/actions/fields";
import { ColorPicker } from "./color-picker";

interface FieldCreateDialogProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}

type FieldType = "single_select" | "multi_select" | "text" | "date";

interface DraftOption {
  key: string;
  name: string;
}

export function FieldCreateDialog({
  workspaceId,
  open,
  onClose,
}: FieldCreateDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("single_select");
  const [color, setColor] = useState("badge-1");
  const [locked, setLocked] = useState(false);
  const [options, setOptions] = useState<DraftOption[]>([
    { key: crypto.randomUUID(), name: "" },
  ]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isSelect = fieldType === "single_select" || fieldType === "multi_select";

  const reset = () => {
    setName("");
    setDescription("");
    setFieldType("single_select");
    setColor("badge-1");
    setLocked(false);
    setOptions([{ key: crypto.randomUUID(), name: "" }]);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Field name is required.");
      return;
    }
    const cleaned = isSelect
      ? options.map((o) => ({ name: o.name.trim() })).filter((o) => o.name.length > 0)
      : [];
    if (isSelect && cleaned.length === 0) {
      setError("Add at least one option.");
      return;
    }
    startTransition(async () => {
      try {
        await createField({
          workspaceId,
          name: trimmed,
          fieldType,
          color,
          description: description.trim() || null,
          locked,
          options: isSelect ? cleaned : undefined,
        });
        router.refresh();
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create field.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-bg-primary shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">New field</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div>
            <label className="section-label" htmlFor="field-name">
              Name
            </label>
            <input
              id="field-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priority"
              className="mt-1 w-full rounded-md border border-border bg-bg-card px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="section-label" htmlFor="field-description">
              Description
            </label>
            <textarea
              id="field-description"
              value={description}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full resize-none rounded-md border border-border bg-bg-card px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <div className="section-label">Type</div>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <TypePill current={fieldType} value="single_select" label="Single-select" onSelect={setFieldType} />
              <TypePill current={fieldType} value="multi_select" label="Multi-select" onSelect={setFieldType} />
              <TypePill current={fieldType} value="text" label="Text" onSelect={setFieldType} />
              <TypePill current={fieldType} value="date" label="Date" onSelect={setFieldType} />
            </div>
          </div>
          <div>
            <div className="section-label">Color</div>
            <div className="mt-1">
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>
          {isSelect && (
            <div>
              <div className="section-label">Options</div>
              <div className="mt-1 space-y-1.5">
                {options.map((o, idx) => (
                  <OptionRow
                    key={o.key}
                    option={o}
                    onChange={(next) =>
                      setOptions((prev) =>
                        prev.map((p, i) => (i === idx ? next : p))
                      )
                    }
                    onRemove={
                      options.length > 1
                        ? () => setOptions((prev) => prev.filter((_, i) => i !== idx))
                        : undefined
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setOptions((prev) => [
                      ...prev,
                      { key: crypto.randomUUID(), name: "" },
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-text-tertiary hover:border-border-strong hover:text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  <Plus size={12} />
                  Add option
                </button>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={locked}
              onChange={(e) => setLocked(e.target.checked)}
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
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-60 transition"
          >
            {pending ? "Creating…" : "Create field"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TypePill({
  current,
  value,
  label,
  onSelect,
}: {
  current: FieldType;
  value: FieldType;
  label: string;
  onSelect: (v: FieldType) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={[
        "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        active
          ? "border-accent bg-bg-selected text-text-primary"
          : "border-border bg-bg-card text-text-secondary hover:border-border-strong hover:text-text-primary",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function OptionRow({
  option,
  onChange,
  onRemove,
}: {
  option: DraftOption;
  onChange: (next: DraftOption) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={option.name}
        onChange={(e) => onChange({ ...option, name: e.target.value })}
        placeholder="Option name"
        className="min-w-0 flex-1 rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove option"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-red-500 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
