"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import type { BoardField } from "@/lib/board-types";
import { setFieldValue } from "@/lib/actions/fields";
import { FieldBadge } from "../field-badge";

export function InlineFieldEditor({
  field,
  selectedOptionIds,
  nodeId,
  parentId,
  workspaceId,
}: {
  field: BoardField;
  selectedOptionIds: string[];
  nodeId: string;
  parentId: string | null;
  workspaceId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isMulti = field.field_type === "multi_select";
  const selectedSet = new Set(selectedOptionIds);
  const hasValue = selectedOptionIds.length > 0;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const toggle = (optionId: string, e: React.MouseEvent) => {
    stop(e);
    let next: string[];
    if (isMulti) {
      next = selectedSet.has(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId];
    } else {
      next = selectedSet.has(optionId) ? [] : [optionId];
      setOpen(false);
    }
    startTransition(async () => {
      await setFieldValue({ nodeId, parentId, workspaceId, fieldId: field.id, fieldType: field.field_type, optionIds: next });
      router.refresh();
    });
  };

  const clear = (e: React.MouseEvent) => {
    stop(e);
    setOpen(false);
    startTransition(async () => {
      await setFieldValue({ nodeId, parentId, workspaceId, fieldId: field.id, fieldType: field.field_type, optionIds: [] });
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        disabled={pending}
        className="inline-flex items-center gap-0.5 rounded transition-opacity disabled:opacity-60"
      >
        {hasValue ? (
          selectedOptionIds.map((optId) => {
            const opt = field.options.find((o) => o.id === optId);
            return opt ? <FieldBadge key={optId} name={opt.name} color={field.color} /> : null;
          })
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded border border-dashed border-transparent px-1.5 py-0.5 text-[10px] text-text-tertiary opacity-0 transition-opacity group-hover:border-border group-hover:opacity-100">
            <Plus size={8} />
            {field.name}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={(e) => { stop(e); setOpen(false); }} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-bg-card py-1 shadow-sm">
            <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-text-tertiary">
              {field.name}
            </div>
            {field.options.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">No options defined.</div>
            )}
            {field.options.map((o) => {
              const active = selectedSet.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={(e) => toggle(o.id, e)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <FieldBadge name={o.name} color={field.color} />
                  {active && <Check size={12} className="shrink-0 text-accent" />}
                </button>
              );
            })}
            {hasValue && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={clear}
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
