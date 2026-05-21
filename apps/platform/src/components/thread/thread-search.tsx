"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { WorkNode } from "@/lib/types";

export interface ThreadSearchProps {
  items: WorkNode[];
}

export function ThreadSearch({ items }: ThreadSearchProps) {
  const [query, setQuery] = useState("");
  const helperId = useId();
  const trimmedQuery = query.trim();

  const matches = useMemo(() => {
    const normalizedQuery = trimmedQuery.toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return items.filter((item) => {
      const title = item.title.toLowerCase();
      const description = item.description?.toLowerCase() ?? "";

      return (
        title.includes(normalizedQuery) ||
        description.includes(normalizedQuery)
      );
    });
  }, [items, trimmedQuery]);

  const helperText = trimmedQuery
    ? matches.length > 0
      ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} in this thread.`
      : "No matches in this thread."
    : "Showing work nested directly under this thread.";

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search this thread"
        aria-label="Search this thread"
        aria-describedby={helperId}
        className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-colors hover:border-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />

      <p id={helperId} className="text-sm text-text-tertiary">
        {helperText}
      </p>

      {trimmedQuery && matches.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {matches.map((item) => (
            <li key={item.id}>
              <Link
                href={`/n/${item.id}`}
                className="block px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
