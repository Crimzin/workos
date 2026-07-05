import Link from "next/link";
import { CircleDot, GitBranch, Plus } from "lucide-react";
import type { FocusItemWithThreads } from "@/lib/focus";

interface FocusItemCardProps {
  item: FocusItemWithThreads;
}

export function FocusItemCard({ item }: FocusItemCardProps) {
  const needsThread =
    item.anchor_status === "needs_thread" || item.threads.length === 0;

  return (
    <div className="rounded-lg border border-border bg-bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <CircleDot size={16} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {item.title}
            </h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-tertiary">
              {item.status}
            </span>
          </div>
          {item.body ? (
            <p className="mt-1 text-sm text-text-secondary">{item.body}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {needsThread ? (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus size={13} />
                Create or attach thread
              </button>
            ) : (
              item.threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/n/${thread.id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <GitBranch size={13} />
                  {thread.title}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
