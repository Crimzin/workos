import Link from "next/link";
import { Search } from "lucide-react";
import { getThreadStatusLabel } from "@/lib/thread-status";
import type { WorkNode } from "@/lib/types";
import { ThreadSearch } from "./thread-search";

export interface ThreadTreeProps {
  children: WorkNode[];
}

export function ThreadTree({ children }: ThreadTreeProps) {
  const visibleChildren = children.filter((child) => !child.archived_at);

  return (
    <div className="space-y-6 px-5 py-5">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Search size={15} className="text-text-tertiary" />
          Find work in this thread
        </h2>

        <ThreadSearch items={visibleChildren} />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Sub-threads
        </h3>

        {visibleChildren.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-tertiary">
            Nothing nested here yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {visibleChildren.map((child) => {
              const isResolved =
                child.thread_resolution_status === "resolved";
              const statusLabel = getThreadStatusLabel(
                child.thread_resolution_status
              );

              return (
                <li key={child.id}>
                  <Link
                    href={`/n/${child.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                      {child.title}
                    </span>
                    <span
                      className={
                        isResolved
                          ? "shrink-0 text-xs font-medium text-status-done"
                          : "shrink-0 text-xs font-medium text-text-tertiary"
                      }
                    >
                      {statusLabel}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
