"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export interface MirrorTarget {
  id: string;
  title: string;
  /** Shown as a muted secondary line — use for workspace name on cross-workspace stacks. */
  subtitle?: string;
}

interface MirrorToSubmenuProps {
  targets: MirrorTarget[];
  loading: boolean;
  placeholder?: string;
  emptyMessage?: string;
  onSelect: (id: string) => void;
}

/**
 * Inline search-and-select panel used inside QUAMs for "Mirror to…" actions.
 * Matches the UX of the detail panel's MirrorsSection: search input + scrollable list.
 * Searches across both title and subtitle (workspace name).
 */
export function MirrorToSubmenu({
  targets,
  loading,
  placeholder = "Search stacks…",
  emptyMessage = "No other stacks available",
  onSelect,
}: MirrorToSubmenuProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when the submenu mounts.
  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.toLowerCase();
  const filtered = q
    ? targets.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.subtitle?.toLowerCase().includes(q)
      )
    : targets;

  return (
    <div className="border-t border-border/60 px-2 py-2">
      {/* Search input */}
      <div className="relative mb-1.5">
        <Search
          size={11}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()} // Prevent QUAM close on Escape
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-bg-primary py-1 pl-6 pr-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Results */}
      <div className="max-h-44 overflow-y-auto">
        {loading ? (
          <div className="py-2 text-center text-xs text-text-tertiary">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-2 text-center text-xs text-text-tertiary">
            {query ? "No results" : emptyMessage}
          </div>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(t.id); }}
              className="block w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-bg-hover"
            >
              <div className="truncate text-sm text-text-secondary group-hover:text-text-primary">
                {t.title}
              </div>
              {t.subtitle && (
                <div className="truncate text-[10px] text-text-tertiary">{t.subtitle}</div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
