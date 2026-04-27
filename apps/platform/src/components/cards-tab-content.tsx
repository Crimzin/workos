"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkNode } from "@/lib/types";
import type { DetailField, DetailFieldValue } from "@/lib/node-detail";
import { FieldBadge } from "./field-badge";
import { NodeActions } from "./node-actions";
import { AddCardFromPanel } from "./add-card-from-panel";

interface CardsTabContentProps {
  stackId: string;
  cards: WorkNode[];
  fields: DetailField[];
  childFieldValues: Record<string, DetailFieldValue[]>;
  workspaceId: string;
}

export function CardsTabContent({
  stackId,
  cards,
  fields,
  childFieldValues,
  workspaceId,
}: CardsTabContentProps) {
  const [showArchived, setShowArchived] = useState(false);

  const hasArchived = cards.some((c) => !!c.archived_at);
  const visible = showArchived ? cards : cards.filter((c) => !c.archived_at);

  return (
    <div className="px-5 py-4">
      {/* Include archived toggle — only shown when there are archived cards */}
      {hasArchived && (
        <div className="mb-3 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            <span className="text-xs text-text-secondary">Include archived</span>
            <button
              type="button"
              role="switch"
              aria-checked={showArchived}
              onClick={() => setShowArchived((v) => !v)}
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
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">No cards yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-border rounded-md border border-border bg-bg-card">
          {visible.map((card) => {
            const cardValues = childFieldValues[card.id] ?? [];
            const badges = getCardBadges(cardValues, fields);
            return (
              <li key={card.id} className="group flex items-stretch">
                <Link
                  href={`/n/${workspaceId}?d=${card.id}`}
                  scroll={false}
                  className={[
                    "flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-bg-hover",
                    card.archived_at ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-1">
                    {card.archived_at && (
                      <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-bg-hover text-text-tertiary">
                        Archived
                      </span>
                    )}
                    <span className="text-sm font-medium text-text-primary line-clamp-1">
                      {card.title}
                    </span>
                  </div>
                  {card.description && (
                    <span className="text-xs text-text-secondary line-clamp-1">
                      {card.description}
                    </span>
                  )}
                  {badges.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {badges.map((b) => (
                        <FieldBadge key={b.id} name={b.name} color={b.color} />
                      ))}
                    </div>
                  )}
                </Link>
                <div className="flex shrink-0 items-center px-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <NodeActions
                    nodeId={card.id}
                    workspaceId={workspaceId}
                    parentId={stackId}
                    nodeType="card"
                    isArchived={!!card.archived_at}
                    closeHref={`/n/${workspaceId}?d=${stackId}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AddCardFromPanel stackId={stackId} workspaceId={workspaceId} />
    </div>
  );
}

function getCardBadges(values: DetailFieldValue[], fields: DetailField[]) {
  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    const fieldVals = values.filter((v) => v.field_id === field.id && v.option_id);
    for (const v of fieldVals) {
      const opt = field.options.find((o) => o.id === v.option_id);
      if (opt) badges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }
  return badges;
}
