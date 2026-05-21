import Link from "next/link";
import { Clock3, GitBranch } from "lucide-react";
import { getThreadStatusLabel } from "@/lib/thread-status";
import type { WorkNode } from "@/lib/types";
import {
  AddSubThreadInline,
  ReopenSubThreadButton,
  ResolveSubThreadButton,
} from "./sub-thread-actions";

export interface SubThreadListProps {
  parentThreadId: string;
  workspaceId: string;
  subThreads: WorkNode[];
}

export function SubThreadList({
  parentThreadId,
  workspaceId,
  subThreads,
}: SubThreadListProps) {
  const visibleSubThreads = subThreads.filter((thread) => !thread.archived_at);

  return (
    <div className="flex min-h-full flex-col">
      <AddSubThreadInline
        parentThreadId={parentThreadId}
        workspaceId={workspaceId}
      />

      {visibleSubThreads.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-tertiary">
          No sub-threads yet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {visibleSubThreads.map((thread) => (
            <SubThreadRow
              key={thread.id}
              thread={thread}
              parentThreadId={parentThreadId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubThreadRow({
  thread,
  parentThreadId,
  workspaceId,
}: {
  thread: WorkNode;
  parentThreadId: string;
  workspaceId: string;
}) {
  const isResolved = thread.thread_resolution_status === "resolved";

  return (
    <div className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-bg-secondary/50">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-hover text-text-tertiary">
        <GitBranch size={14} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/n/${thread.id}`}
            className="min-w-0 truncate text-sm font-medium text-text-primary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {thread.title}
          </Link>
          <StatusPill
            label={getThreadStatusLabel(thread.thread_resolution_status)}
            resolved={isResolved}
          />
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-tertiary">
          <Clock3 size={11} className="shrink-0" />
          <time dateTime={thread.updated_at}>{formatTimestamp(thread.updated_at)}</time>
        </div>

        {thread.resolution_summary && (
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">
            {thread.resolution_summary}
          </p>
        )}
      </div>

      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {isResolved ? (
          <ReopenSubThreadButton
            subThreadId={thread.id}
            parentThreadId={parentThreadId}
            workspaceId={workspaceId}
          />
        ) : (
          <ResolveSubThreadButton
            subThreadId={thread.id}
            parentThreadId={parentThreadId}
            workspaceId={workspaceId}
            defaultSummary={`${thread.title} resolved:`}
          />
        )}
      </div>
    </div>
  );
}

function StatusPill({ label, resolved }: { label: string; resolved: boolean }) {
  return (
    <span
      className={[
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        resolved
          ? "bg-status-done/15 text-status-done"
          : "bg-accent-subtle text-accent",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
