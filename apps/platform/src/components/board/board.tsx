"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Plus } from "lucide-react";
import type { BoardData } from "@/lib/board";
import { createStack } from "@/lib/actions/nodes";
import { InlineCreate } from "../inline-create";
import { FieldCreateDialog } from "../field-create-dialog";
import { StackRow } from "./stack-row";

interface BoardProps {
  data: BoardData;
}

/**
 * Workspace-level Board. For Phase 1 we use a single "column field" for the
 * whole board (applies to every stack). The per-stack field override from the
 * design spec lands alongside saved views in 1.8; the spec still wants the
 * user to feel that columns are changeable — that's why the field selector
 * is large and prominent in the toolbar.
 */
export function Board({ data }: BoardProps) {
  const [columnFieldId, setColumnFieldId] = useState<string | null>(
    data.defaultColumnFieldId
  );
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const router = useRouter();
  const workspaceId = data.workspace.id;

  const columnField = useMemo(
    () => data.fields.find((f) => f.id === columnFieldId) ?? null,
    [data.fields, columnFieldId]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border bg-bg-secondary/60 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 py-3">
          <div className="flex items-baseline gap-2">
            <span className="section-label">Columns</span>
            <ColumnFieldMenu
              fields={data.fields}
              currentId={columnFieldId}
              onSelect={setColumnFieldId}
              onAddField={() => setFieldDialogOpen(true)}
            />
          </div>
          <div className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            disabled
            title="Filter (coming soon)"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
          >
            <Filter size={13} />
            <span>Filter</span>
          </button>
          <div className="flex-1" />
          <InlineCreate
            label="New Stack"
            placeholder="Stack name"
            icon={<Plus size={13} />}
            onSubmit={async (title) => {
              const res = await createStack(workspaceId, title);
              router.refresh();
              return res;
            }}
            buttonClassName="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
            inputClassName="w-48 rounded-md border border-border-strong bg-bg-card px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {data.stacks.length === 0 ? (
            <EmptyWorkspace />
          ) : (
            data.stacks.map((stack) => (
              <StackRow
                key={stack.id}
                stack={stack}
                workspaceId={workspaceId}
                columnField={columnField}
                fields={data.fields}
              />
            ))
          )}
        </div>
      </div>
      <FieldCreateDialog
        workspaceId={workspaceId}
        open={fieldDialogOpen}
        onClose={() => setFieldDialogOpen(false)}
      />
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="flex min-h-[240px] items-center justify-center px-6 py-16">
      <div className="max-w-sm text-center">
        <h3 className="text-base font-medium text-text-primary">
          This workspace is empty.
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Create your first stack to start organizing work.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <Plus size={14} />
          Create Stack
        </button>
      </div>
    </div>
  );
}

function ColumnFieldMenu({
  fields,
  currentId,
  onSelect,
  onAddField,
}: {
  fields: BoardData["fields"];
  currentId: string | null;
  onSelect: (id: string | null) => void;
  onAddField: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = fields.find((f) => f.id === currentId);
  const label = current ? current.name : "None";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
      >
        <span>{label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-text-tertiary"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-bg-card py-1 shadow-sm">
            {fields.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">
                No list-type fields yet.
              </div>
            )}
            {fields.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onSelect(f.id);
                  setOpen(false);
                }}
                className={[
                  "block w-full px-3 py-1.5 text-left text-sm transition-colors",
                  f.id === currentId
                    ? "bg-bg-selected text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{f.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    {f.field_type === "single_select" ? "single" : "multi"}
                  </span>
                </div>
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddField();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <Plus size={12} />
              <span>Add field</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
