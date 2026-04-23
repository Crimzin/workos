"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import type { BoardField, BoardStack } from "@/lib/board";
import { createCard } from "@/lib/actions/nodes";
import { InlineCreate } from "../inline-create";
import { CardTile } from "./card-tile";

interface StackRowProps {
  stack: BoardStack;
  workspaceId: string;
  columnField: BoardField | null;
  fields: BoardField[];
}

const UNASSIGNED_KEY = "__unassigned__";

export function StackRow({
  stack,
  workspaceId,
  columnField,
  fields,
}: StackRowProps) {
  const router = useRouter();
  // If no column field is chosen, everything collapses into a single column.
  const columns = columnField
    ? [
        { id: UNASSIGNED_KEY, name: "No " + columnField.name, color: null as string | null },
        ...columnField.options.map((o) => ({
          id: o.id,
          name: o.name,
          color: columnField.color,
        })),
      ]
    : [{ id: UNASSIGNED_KEY, name: "All", color: null as string | null }];

  const cardsByColumn = new Map<string, BoardStack["cards"]>();
  for (const col of columns) cardsByColumn.set(col.id, []);

  for (const card of stack.cards) {
    if (!columnField) {
      cardsByColumn.get(UNASSIGNED_KEY)!.push(card);
      continue;
    }
    const values = card.field_values[columnField.id] ?? [];
    if (values.length === 0) {
      cardsByColumn.get(UNASSIGNED_KEY)!.push(card);
      continue;
    }
    for (const optionId of values) {
      if (cardsByColumn.has(optionId)) {
        cardsByColumn.get(optionId)!.push(card);
      }
    }
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-stretch">
        {/* Row header */}
        <StackHeader stack={stack} />

        {/* Columns */}
        <div className="flex flex-1 min-w-0">
          {columns.map((col) => {
            const cards = cardsByColumn.get(col.id) ?? [];
            const isUnassigned = col.id === UNASSIGNED_KEY;
            return (
              <div
                key={col.id}
                className="flex w-72 shrink-0 flex-col border-l border-border bg-bg-primary"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {col.color && (
                      <span
                        className={`badge badge-${colorToBadgeIndex(col.color)} px-1.5 py-0.5 text-[10px]`}
                      >
                        {col.name}
                      </span>
                    )}
                    {!col.color && (
                      <span className="section-label truncate">
                        {col.name}
                      </span>
                    )}
                    <span
                      className={[
                        "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium",
                        isUnassigned
                          ? "text-text-tertiary"
                          : "bg-bg-hover text-text-secondary",
                      ].join(" ")}
                    >
                      {cards.length}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                  {cards.map((c) => (
                    <CardTile
                      key={c.id}
                      card={c}
                      workspaceId={workspaceId}
                      fields={fields}
                      columnFieldId={columnField?.id ?? null}
                    />
                  ))}
                  <InlineCreate
                    label="Add card"
                    placeholder="Card title"
                    icon={<Plus size={12} />}
                    onSubmit={async (title) => {
                      const res = await createCard(
                        stack.id,
                        workspaceId,
                        title,
                        isUnassigned ? null : columnField?.id ?? null,
                        isUnassigned ? null : col.id
                      );
                      router.refresh();
                      return res;
                    }}
                    buttonClassName="mt-1 inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-xs text-text-tertiary hover:border-border-strong hover:text-text-secondary hover:bg-bg-hover transition-colors"
                    inputClassName="mt-1 w-full rounded-md border border-border-strong bg-bg-card px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StackHeader({ stack }: { stack: BoardStack }) {
  return (
    <div className="w-60 shrink-0 border-r border-border bg-bg-secondary/60 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="section-label">Stack</div>
          <h3 className="mt-0.5 truncate text-base font-semibold text-text-primary">
            {stack.title}
          </h3>
          {stack.description && (
            <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
              {stack.description}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled
          title="Stack actions (coming soon)"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}

/** Design-spec badge colors are named 'badge-1'..'badge-6'. */
function colorToBadgeIndex(color: string): number {
  const match = /badge-([1-6])/.exec(color);
  return match ? Number(match[1]) : 1;
}
