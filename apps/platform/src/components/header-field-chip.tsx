"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { HeaderFieldBadge } from "@/lib/detail-header";
import { addFieldOption, setFieldValue } from "@/lib/actions/fields";
import { FieldBadge } from "./field-badge";

interface HeaderFieldChipProps {
  chip: HeaderFieldBadge;
  nodeId: string;
  parentId: string | null;
  workspaceId: string;
}

export function HeaderFieldChip({
  chip,
  nodeId,
  parentId,
  workspaceId,
}: HeaderFieldChipProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(chip.options);
  const [selectedOptionIds, setSelectedOptionIds] = useState(chip.selectedOptionIds);
  const [newOptionName, setNewOptionName] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedSet = new Set(selectedOptionIds);
  const isMulti = chip.fieldType === "multi_select";

  function commit(nextOptionIds: string[]) {
    setSelectedOptionIds(nextOptionIds);
    startTransition(async () => {
      await setFieldValue({
        nodeId,
        parentId,
        workspaceId,
        fieldId: chip.fieldId,
        fieldType: chip.fieldType,
        optionIds: nextOptionIds,
      });
      router.refresh();
    });
  }

  function toggleOption(optionId: string) {
    const nextOptionIds = isMulti
      ? selectedSet.has(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId]
      : selectedSet.has(optionId)
        ? []
        : [optionId];

    if (!isMulti) setOpen(false);
    commit(nextOptionIds);
  }

  function clearValue() {
    setOpen(false);
    commit([]);
  }

  function addOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newOptionName.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const created = await addFieldOption(chip.fieldId, workspaceId, trimmed);
      const createdOption = { id: created.id, name: trimmed };
      setOptions((current) => [...current, createdOption]);
      setNewOptionName("");

      const nextOptionIds = isMulti
        ? [...selectedOptionIds, created.id]
        : [created.id];
      setSelectedOptionIds(nextOptionIds);
      if (!isMulti) setOpen(false);

      await setFieldValue({
        nodeId,
        parentId,
        workspaceId,
        fieldId: chip.fieldId,
        fieldType: chip.fieldType,
        optionIds: nextOptionIds,
      });
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        title={`Edit ${chip.fieldName}`}
        className="inline-flex items-center gap-0.5 rounded transition-opacity hover:opacity-80 disabled:opacity-60"
      >
        <FieldBadge name={chip.name} color={chip.color} />
        <ChevronDown size={10} className="text-text-tertiary" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-border bg-bg-card py-1 shadow-sm">
            <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-text-tertiary">
              {chip.fieldName}
            </div>

            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">
                No values yet.
              </div>
            )}

            {options.map((option) => {
              const active = selectedSet.has(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleOption(option.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <FieldBadge name={option.name} color={chip.color} />
                  {active && <Check size={12} className="shrink-0 text-accent" />}
                </button>
              );
            })}

            {selectedOptionIds.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={clearValue}
                  className="block w-full px-3 py-1.5 text-left text-xs text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
                >
                  {isMulti ? "Clear all" : "Clear"}
                </button>
              </>
            )}

            <form onSubmit={addOption} className="mt-1 border-t border-border px-2 py-2">
              <label className="flex items-center gap-1.5 rounded-md border border-border bg-bg-primary px-2 py-1 focus-within:border-border-strong focus-within:ring-1 focus-within:ring-accent">
                <Plus size={12} className="shrink-0 text-text-tertiary" />
                <input
                  value={newOptionName}
                  disabled={pending}
                  onChange={(event) => setNewOptionName(event.target.value)}
                  placeholder="Add value"
                  className="min-w-0 flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
                />
              </label>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
