"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, MoreHorizontal } from "lucide-react";
import type { DetailField, DetailFieldValue } from "@/lib/node-detail";
import { setFieldValue } from "@/lib/actions/fields";
import { FieldBadge } from "./field-badge";
import { FieldEditDialog } from "./field-edit-dialog";

interface FieldRowEditorProps {
  field: DetailField;
  values: DetailFieldValue[];
  nodeId: string;
  workspaceId: string;
}

export function FieldRowEditor({
  field,
  values,
  nodeId,
  workspaceId,
}: FieldRowEditorProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group flex items-start justify-between gap-2 px-3 py-2">
      <div className="flex items-start gap-1 pt-1">
        <dt className="text-xs text-text-tertiary">{field.name}</dt>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`Edit ${field.name}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:bg-bg-hover hover:text-text-secondary group-hover:opacity-100 data-[open=true]:opacity-100"
            data-open={menuOpen}
          >
            <MoreHorizontal size={12} />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-bg-card py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditOpen(true);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  Edit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <dd className="flex min-w-0 flex-1 justify-end">
        <EditorForType
          field={field}
          values={values}
          nodeId={nodeId}
          workspaceId={workspaceId}
        />
      </dd>
      <FieldEditDialog
        field={field}
        workspaceId={workspaceId}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

function EditorForType(props: FieldRowEditorProps) {
  const { field } = props;
  if (field.field_type === "single_select" || field.field_type === "multi_select") {
    return <SelectEditor {...props} />;
  }
  if (field.field_type === "text") {
    return <TextEditor {...props} />;
  }
  if (field.field_type === "date") {
    return <DateEditor {...props} />;
  }
  return null;
}

function SelectEditor({ field, values, nodeId, workspaceId }: FieldRowEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isMulti = field.field_type === "multi_select";

  const selectedIds = new Set(
    values.map((v) => v.option_id).filter((id): id is string => Boolean(id))
  );
  const selectedOptions = field.options.filter((o) => selectedIds.has(o.id));
  const fieldColor = field.color;

  const toggle = (optionId: string) => {
    let next: string[];
    if (isMulti) {
      next = selectedIds.has(optionId)
        ? [...selectedIds].filter((id) => id !== optionId)
        : [...selectedIds, optionId];
    } else {
      next = selectedIds.has(optionId) ? [] : [optionId];
      setOpen(false);
    }
    startTransition(async () => {
      await setFieldValue({
        nodeId,
        workspaceId,
        fieldId: field.id,
        fieldType: field.field_type,
        optionIds: next,
      });
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={[
          "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-sm text-text-primary transition-colors",
          "hover:bg-bg-hover disabled:opacity-60",
        ].join(" ")}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-text-tertiary">—</span>
        ) : (
          <span className="flex flex-wrap justify-end gap-1">
            {selectedOptions.map((o) => (
              <FieldBadge key={o.id} name={o.name} color={fieldColor} />
            ))}
          </span>
        )}
        <ChevronDown size={12} className="shrink-0 text-text-tertiary" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-bg-card py-1 shadow-sm">
            {field.options.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">
                No options defined.
              </div>
            )}
            {field.options.map((o) => {
              const active = selectedIds.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <FieldBadge name={o.name} color={fieldColor} />
                  {active && <Check size={12} className="text-accent" />}
                </button>
              );
            })}
            {isMulti && selectedIds.size > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      await setFieldValue({
                        nodeId,
                        workspaceId,
                        fieldId: field.id,
                        fieldType: field.field_type,
                        optionIds: [],
                      });
                      router.refresh();
                    });
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
                >
                  Clear all
                </button>
              </>
            )}
            {!isMulti && selectedIds.size > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      await setFieldValue({
                        nodeId,
                        workspaceId,
                        fieldId: field.id,
                        fieldType: field.field_type,
                        optionIds: [],
                      });
                      router.refresh();
                    });
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TextEditor({ field, values, nodeId, workspaceId }: FieldRowEditorProps) {
  const router = useRouter();
  const initial = values[0]?.value_text ?? "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => setValue(initial), [initial]);

  const commit = () => {
    if (value === initial) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await setFieldValue({
        nodeId,
        workspaceId,
        fieldId: field.id,
        fieldType: "text",
        valueText: value,
      });
      router.refresh();
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="max-w-full truncate rounded-md px-1.5 py-1 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover"
      >
        {initial || <span className="text-text-tertiary">—</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setValue(initial);
          setEditing(false);
        }
      }}
      onBlur={commit}
      className="w-48 rounded-md border border-border-strong bg-bg-card px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
    />
  );
}

function DateEditor({ field, values, nodeId, workspaceId }: FieldRowEditorProps) {
  const router = useRouter();
  const initial = values[0]?.value_date ?? "";
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    startTransition(async () => {
      await setFieldValue({
        nodeId,
        workspaceId,
        fieldId: field.id,
        fieldType: "date",
        valueDate: next || null,
      });
      router.refresh();
    });
  };

  return (
    <input
      type="date"
      value={initial}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className="rounded-md border border-border bg-bg-card px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
    />
  );
}
