"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardCard, BoardField } from "@/lib/board-types";
import { FieldBadge } from "../field-badge";

interface CardTileProps {
  card: BoardCard;
  workspaceId: string;
  fields: BoardField[];
  columnFieldId: string | null;
}

export function CardTile({ card, workspaceId, fields, columnFieldId }: CardTileProps) {
  const search = useSearchParams();
  const isActive = search.get("d") === card.id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: "card" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const badges = getBadges(card, fields, columnFieldId);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      <Link
        href={`/n/${workspaceId}?d=${card.id}`}
        scroll={false}
        aria-current={isActive ? "true" : undefined}
        className={[
          "group block rounded-md border p-2.5 transition-colors",
          isActive
            ? "border-accent bg-bg-selected"
            : "border-border bg-bg-card hover:border-border-strong hover:bg-bg-hover",
        ].join(" ")}
      >
        <div className="text-sm font-medium text-text-primary line-clamp-2">{card.title}</div>
        {card.description && (
          <div className="mt-1 text-xs text-text-secondary line-clamp-2">{card.description}</div>
        )}
        {badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {badges.map((b) => (
              <FieldBadge key={b.id} name={b.name} color={b.color} />
            ))}
          </div>
        )}
      </Link>
    </div>
  );
}

/** Pure visual used inside DragOverlay — no sortable wiring. */
export function CardTileOverlay({
  card,
  fields,
  columnFieldId,
}: {
  card: BoardCard;
  fields: BoardField[];
  columnFieldId: string | null;
}) {
  const badges = getBadges(card, fields, columnFieldId);
  return (
    <div className="rounded-md border border-accent bg-bg-card p-2.5 shadow-lg ring-1 ring-accent/30">
      <div className="text-sm font-medium text-text-primary line-clamp-2">{card.title}</div>
      {card.description && (
        <div className="mt-1 text-xs text-text-secondary line-clamp-2">{card.description}</div>
      )}
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <FieldBadge key={b.id} name={b.name} color={b.color} />
          ))}
        </div>
      )}
    </div>
  );
}

function getBadges(card: BoardCard, fields: BoardField[], columnFieldId: string | null) {
  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    if (field.id === columnFieldId) continue;
    const selected = card.field_values[field.id] ?? [];
    for (const optionId of selected) {
      const opt = field.options.find((o) => o.id === optionId);
      if (opt) badges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }
  return badges;
}
