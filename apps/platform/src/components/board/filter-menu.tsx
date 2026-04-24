"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import type { BoardField } from "@/lib/board-types";
import type { ViewFilter } from "@/lib/views";

interface FilterMenuProps {
  fields: BoardField[];
  filters: ViewFilter[];
  onChange: (filters: ViewFilter[]) => void;
}

export function FilterMenu({ fields, filters, onChange }: FilterMenuProps) {
  const [open, setOpen] = useState(false);

  const activeCount = filters.reduce((n, f) => n + (f.optionIds.length > 0 ? 1 : 0), 0);

  const toggleOption = (fieldId: string, optionId: string) => {
    const existing = filters.find((f) => f.fieldId === fieldId);
    if (!existing) {
      onChange([...filters, { fieldId, optionIds: [optionId] }]);
      return;
    }
    const hasOpt = existing.optionIds.includes(optionId);
    const newOptionIds = hasOpt
      ? existing.optionIds.filter((id) => id !== optionId)
      : [...existing.optionIds, optionId];
    const updated = filters
      .map((f) => (f.fieldId === fieldId ? { ...f, optionIds: newOptionIds } : f))
      .filter((f) => f.optionIds.length > 0);
    onChange(updated);
  };

  const isChecked = (fieldId: string, optionId: string) =>
    filters.find((f) => f.fieldId === fieldId)?.optionIds.includes(optionId) ?? false;

  const clearAll = () => onChange([]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          activeCount > 0
            ? "bg-accent/10 text-accent hover:bg-accent/20"
            : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
        ].join(" ")}
      >
        <Filter size={13} />
        <span>Filter</span>
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-text-primary">Filter cards</span>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  <X size={10} />
                  Clear all
                </button>
              )}
            </div>

            {fields.length === 0 ? (
              <div className="px-3 py-4 text-xs text-text-tertiary">No fields to filter on.</div>
            ) : (
              <div className="max-h-72 overflow-y-auto py-1">
                {fields.map((field) => (
                  <div key={field.id} className="px-3 py-2">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      {field.name}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {field.options.map((opt) => {
                        const checked = isChecked(field.id, opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleOption(field.id, opt.id)}
                            className={[
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                              checked
                                ? `badge badge-${colorToBadgeIndex(field.color)} ring-1 ring-current`
                                : "bg-bg-hover text-text-secondary hover:text-text-primary",
                            ].join(" ")}
                          >
                            {opt.name}
                          </button>
                        );
                      })}
                      {field.options.length === 0 && (
                        <span className="text-xs text-text-tertiary">No options</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function colorToBadgeIndex(color: string): number {
  const match = /badge-([1-6])/.exec(color);
  return match ? Number(match[1]) : 1;
}
