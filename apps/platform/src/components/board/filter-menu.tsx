"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import type { BoardField, BoardStack } from "@/lib/board-types";
import type { ViewFilter } from "@/lib/views";

interface FilterMenuProps {
  fields: BoardField[];
  stacks: BoardStack[];
  // Card filters
  filters: ViewFilter[];
  onFiltersChange: (filters: ViewFilter[]) => void;
  // Stack filters
  stackFilters: ViewFilter[];
  hiddenStackIds: string[];
  onStackFiltersChange: (stackFilters: ViewFilter[], hiddenStackIds: string[]) => void;
  // Archived toggle
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
}

export function FilterMenu({
  fields,
  stacks,
  filters,
  onFiltersChange,
  stackFilters,
  hiddenStackIds,
  onStackFiltersChange,
  showArchived,
  onShowArchivedChange,
}: FilterMenuProps) {
  const [open, setOpen] = useState(false);

  const activeCardCount = filters.reduce((n, f) => n + (f.optionIds.length > 0 ? 1 : 0), 0);
  const activeStackFieldCount = stackFilters.reduce((n, f) => n + (f.optionIds.length > 0 ? 1 : 0), 0);
  const activeStackHideCount = hiddenStackIds.length;
  const archivedCount = showArchived ? 1 : 0;
  const totalActive = activeCardCount + activeStackFieldCount + activeStackHideCount + archivedCount;

  // ── Card field toggles ───────────────────────────────────────────────────
  const toggleCardOption = (fieldId: string, optionId: string) => {
    const existing = filters.find((f) => f.fieldId === fieldId);
    if (!existing) {
      onFiltersChange([...filters, { fieldId, optionIds: [optionId] }]);
      return;
    }
    const newOptionIds = existing.optionIds.includes(optionId)
      ? existing.optionIds.filter((id) => id !== optionId)
      : [...existing.optionIds, optionId];
    onFiltersChange(
      filters
        .map((f) => (f.fieldId === fieldId ? { ...f, optionIds: newOptionIds } : f))
        .filter((f) => f.optionIds.length > 0)
    );
  };

  const isCardOptionChecked = (fieldId: string, optionId: string) =>
    filters.find((f) => f.fieldId === fieldId)?.optionIds.includes(optionId) ?? false;

  // ── Stack field toggles ──────────────────────────────────────────────────
  const toggleStackOption = (fieldId: string, optionId: string) => {
    const existing = stackFilters.find((f) => f.fieldId === fieldId);
    if (!existing) {
      onStackFiltersChange([...stackFilters, { fieldId, optionIds: [optionId] }], hiddenStackIds);
      return;
    }
    const newOptionIds = existing.optionIds.includes(optionId)
      ? existing.optionIds.filter((id) => id !== optionId)
      : [...existing.optionIds, optionId];
    onStackFiltersChange(
      stackFilters
        .map((f) => (f.fieldId === fieldId ? { ...f, optionIds: newOptionIds } : f))
        .filter((f) => f.optionIds.length > 0),
      hiddenStackIds
    );
  };

  const isStackOptionChecked = (fieldId: string, optionId: string) =>
    stackFilters.find((f) => f.fieldId === fieldId)?.optionIds.includes(optionId) ?? false;

  // ── Stack on/off toggles ─────────────────────────────────────────────────
  const toggleStackVisible = (stackId: string) => {
    const newHidden = hiddenStackIds.includes(stackId)
      ? hiddenStackIds.filter((id) => id !== stackId)
      : [...hiddenStackIds, stackId];
    onStackFiltersChange(stackFilters, newHidden);
  };

  const clearAll = () => {
    onFiltersChange([]);
    onStackFiltersChange([], []);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          totalActive > 0
            ? "bg-accent/10 text-accent hover:bg-accent/20"
            : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
        ].join(" ")}
      >
        <Filter size={13} />
        <span>Filter</span>
        {totalActive > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {totalActive}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-border bg-bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-text-primary">Filter</span>
              {totalActive > 0 && (
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

            <div className="max-h-[420px] overflow-y-auto">
              {/* ── Include archived ──────────────────────────────────── */}
              <div className="border-b border-border px-3 py-2">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-xs text-text-secondary">Include archived</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showArchived}
                    onClick={() => onShowArchivedChange(!showArchived)}
                    className={[
                      "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
                      showArchived ? "bg-accent" : "bg-bg-hover",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
                        showArchived ? "translate-x-3.5" : "translate-x-0.5",
                      ].join(" ")}
                    />
                  </button>
                </label>
              </div>

              {/* ── Stacks on/off ─────────────────────────────────────── */}
              <Section label="Stacks">
                {stacks.length === 0 ? (
                  <EmptyHint>No stacks yet.</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {stacks.map((stack) => {
                      const visible = !hiddenStackIds.includes(stack.id);
                      return (
                        <label
                          key={stack.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-bg-hover"
                        >
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={() => toggleStackVisible(stack.id)}
                            className="h-3 w-3 rounded border-border accent-accent"
                          />
                          <span className="truncate text-xs text-text-secondary">{stack.title}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* ── Stack field filters ───────────────────────────────── */}
              {fields.length > 0 && (
                <Section label="Stack fields">
                  {fields.map((field) => (
                    <FieldOptions
                      key={field.id}
                      field={field}
                      isChecked={(optId) => isStackOptionChecked(field.id, optId)}
                      onToggle={(optId) => toggleStackOption(field.id, optId)}
                    />
                  ))}
                </Section>
              )}

              {/* ── Card field filters ────────────────────────────────── */}
              {fields.length > 0 && (
                <Section label="Card fields">
                  {fields.map((field) => (
                    <FieldOptions
                      key={field.id}
                      field={field}
                      isChecked={(optId) => isCardOptionChecked(field.id, optId)}
                      onToggle={(optId) => toggleCardOption(field.id, optId)}
                    />
                  ))}
                </Section>
              )}

              {fields.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-tertiary">
                  Add fields to filter by value.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-text-tertiary">{children}</span>;
}

function FieldOptions({
  field,
  isChecked,
  onToggle,
}: {
  field: BoardField;
  isChecked: (optionId: string) => boolean;
  onToggle: (optionId: string) => void;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10px] text-text-tertiary">{field.name}</div>
      <div className="flex flex-wrap gap-1">
        {field.options.map((opt) => {
          const checked = isChecked(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
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
  );
}

function colorToBadgeIndex(color: string): number {
  const match = /badge-([1-6])/.exec(color);
  return match ? Number(match[1]) : 1;
}
