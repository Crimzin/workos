"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, History, Layers3 } from "lucide-react";
import { sourceThreadHref } from "@/lib/post-source-links";
import {
  REASON_TRACE_SELECTION_EVENT,
  reasonTracePostIdFromEvent,
  selectReasonTrace,
} from "@/lib/reason-trace-selection";
import type { ThreadContextAttachmentWithSource } from "@/lib/thread-surface";
import type {
  AnswerTraceSummary,
  ThreadWorkingModelView,
} from "@/lib/working-model";
import { SourceChip } from "../source-chip";
import { ReasonTraceView } from "./reason-trace-view";
import { WorkingModelClaimCard } from "./working-model-claim-card";

type WorkingModelTab = "model" | "answers" | "sources";

const WORKING_MODEL_TABS: Array<{ id: WorkingModelTab; label: string }> = [
  { id: "model", label: "Model" },
  { id: "answers", label: "Answers" },
  { id: "sources", label: "Sources" },
];

interface WorkingModelPanelProps {
  threadId: string;
  workspaceId: string;
  model: ThreadWorkingModelView;
  answerTraces: AnswerTraceSummary[];
  attachments: ThreadContextAttachmentWithSource[];
  fieldsContent: ReactNode;
  memoryContent: ReactNode;
  treeContent?: ReactNode;
}

export function WorkingModelPanel({
  threadId,
  workspaceId,
  model,
  answerTraces,
  attachments,
  fieldsContent,
  memoryContent,
  treeContent,
}: WorkingModelPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkingModelTab>("model");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const selectedTrace = answerTraces.find(
    (trace) => trace.postId === selectedPostId
  );
  const activeAttachments = useMemo(
    () =>
      attachments.filter(
        (attachment) =>
          attachment.status === "active" &&
          attachment.source_node &&
          !attachment.source_node.archived_at
      ),
    [attachments]
  );
  const overrideIdsByClaim = useMemo(
    () =>
      Object.fromEntries(
        model.groups.flatMap((group) =>
          group.claims.flatMap((claim) =>
            claim.excludedHere ? [[claim.id, claim.excludedHere.id]] : []
          )
        )
      ),
    [model.groups]
  );

  useEffect(() => {
    const handleSelection = (event: Event) => {
      const postId = reasonTracePostIdFromEvent(event);
      setSelectedPostId(postId);
      setActiveTab(postId ? "answers" : "model");
    };
    window.addEventListener(REASON_TRACE_SELECTION_EVENT, handleSelection);
    return () =>
      window.removeEventListener(REASON_TRACE_SELECTION_EVENT, handleSelection);
  }, []);

  if (selectedTrace) {
    return (
      <ReasonTraceView
        trace={selectedTrace}
        threadId={threadId}
        workspaceId={workspaceId}
        overrideIdsByClaim={overrideIdsByClaim}
        onBack={() => selectReasonTrace(null)}
      />
    );
  }

  return (
    <div className="min-h-0">
      <div
        role="tablist"
        aria-label="Working model views"
        className="sticky top-0 z-10 grid grid-cols-3 border-b border-border bg-bg-primary px-3"
      >
        {WORKING_MODEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "border-b-2 px-2 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
              activeTab === tab.id
                ? "border-accent text-text-primary"
                : "border-transparent text-text-tertiary hover:text-text-secondary",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "model" && (
        <div className="space-y-5 px-4 py-4">
          {model.groups.map((group) => {
            const expanded = expandedGroups.has(group.key);
            const visibleClaims = expanded
              ? group.claims
              : group.claims.slice(0, 5);
            return (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-text-primary">{group.label}</h3>
                <span className="text-[10px] text-text-tertiary">{group.claims.length}</span>
              </div>
              <div className="space-y-2">
                {visibleClaims.map((claim) => (
                  <WorkingModelClaimCard
                    key={claim.id}
                    claim={claim}
                    threadId={threadId}
                    workspaceId={workspaceId}
                  />
                ))}
              </div>
              {group.claims.length > 5 && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  className="rounded-md px-2 py-1 text-xs font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {expanded
                    ? "Show fewer"
                    : `Show ${group.claims.length - 5} more`}
                </button>
              )}
            </section>
            );
          })}
          {model.claimCount === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <Layers3 size={18} className="mx-auto text-text-tertiary" />
              <p className="mt-2 text-sm font-medium text-text-secondary">No working beliefs yet</p>
              <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
                Goals, decisions, ideas, and open questions will appear as this thread develops.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "answers" && (
        <div className="space-y-2 px-4 py-4">
          {answerTraces.length > 0 ? (
            answerTraces.map((trace) => (
              <button
                key={trace.id}
                type="button"
                onClick={() => selectReasonTrace(trace.postId)}
                className="block w-full rounded-lg border border-border bg-bg-card px-3 py-3 text-left transition-colors hover:border-border-strong hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                    <History size={11} /> Answer snapshot
                  </span>
                  {trace.hasWarnings && <AlertCircle size={12} className="text-status-review" />}
                </span>
                <span className="mt-1.5 line-clamp-3 text-sm font-medium leading-snug text-text-primary">
                  {trace.summary}
                </span>
                <span className="mt-2 block text-[11px] text-text-tertiary">
                  {formatTraceDate(trace.createdAt)}
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-tertiary">
              Answer snapshots will appear after WorkOS responds in this thread.
            </div>
          )}
        </div>
      )}

      {activeTab === "sources" && (
        <div className="space-y-5 px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-text-primary">Attached sources</h3>
            {activeAttachments.length > 0 ? (
              <div className="space-y-2">
                {activeAttachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={sourceThreadHref(
                      attachment.context_source_node_id,
                      attachment.source_post_id
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md border border-border bg-bg-card px-3 py-2 transition-colors hover:border-border-strong hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="truncate text-sm font-medium text-text-primary">
                      {attachment.source_node?.title ?? "Untitled context"}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-text-tertiary">
                      <SourceChip sourceApp={attachment.source_node?.source_app} />
                      <span aria-hidden="true">/</span>
                      <span className="truncate">{formatAttachedBy(attachment.attached_by)}</span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-text-tertiary">
                No attached context yet.
              </div>
            )}
          </section>

          <details className="rounded-lg border border-border bg-bg-card">
            <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Memory
            </summary>
            <div className="border-t border-border">{memoryContent}</div>
          </details>
          <details className="rounded-lg border border-border bg-bg-card">
            <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Fields
            </summary>
            <div className="border-t border-border">{fieldsContent}</div>
          </details>
          {treeContent && (
            <details className="rounded-lg border border-border bg-bg-card">
              <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                Child threads
              </summary>
              <div className="border-t border-border">{treeContent}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function formatAttachedBy(value: string): string {
  return value.replace(/_/g, " ");
}

function formatTraceDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
