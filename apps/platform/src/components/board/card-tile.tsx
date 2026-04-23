"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BoardCard, BoardField } from "@/lib/board";
import { FieldBadge } from "../field-badge";

interface CardTileProps {
  card: BoardCard;
  workspaceId: string;
  fields: BoardField[];
  /** Field currently driving columns; skip badge for it since column == value. */
  columnFieldId: string | null;
}

export function CardTile({
  card,
  workspaceId,
  fields,
  columnFieldId,
}: CardTileProps) {
  const search = useSearchParams();
  const isActive = search.get("d") === card.id;

  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    if (field.id === columnFieldId) continue;
    const selected = card.field_values[field.id] ?? [];
    for (const optionId of selected) {
      const opt = field.options.find((o) => o.id === optionId);
      if (opt) badges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }

  return (
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
      <div className="text-sm font-medium text-text-primary line-clamp-2">
        {card.title}
      </div>
      {card.description && (
        <div className="mt-1 text-xs text-text-secondary line-clamp-2">
          {card.description}
        </div>
      )}
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <FieldBadge key={b.id} name={b.name} color={b.color} />
          ))}
        </div>
      )}
    </Link>
  );
}
