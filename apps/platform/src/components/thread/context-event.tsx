"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  allowThreadContext,
  ignoreThreadContext,
  removeThreadContext,
} from "@/lib/actions/thread-context";
import {
  contextEventSummary,
  isGroupedContextEventMetadata,
  type ContextEventMetadata,
  type ContextEventSourceMetadata,
} from "@/lib/thread-context";
import { sourceThreadHref } from "@/lib/post-source-links";
import { SourceChip } from "../source-chip";

export interface ContextEventProps {
  threadId: string;
  postId: string;
  metadata: ContextEventMetadata;
}

export function ContextEvent({ threadId, postId, metadata }: ContextEventProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const isGrouped = isGroupedContextEventMetadata(metadata);
  const sourceNodeId = isGrouped ? null : metadata.source_node_id;
  const sourcePostId = isGrouped ? null : metadata.source_post_id;
  const showAddBack = metadata.action === "removed";
  const showAllow = metadata.action === "ignored";

  const runAction = async (action: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    try {
      await action();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary">
        {contextEventSummary(metadata)}
      </p>
      {isGrouped ? (
        <div className="space-y-2">
          {metadata.sources.map((source) => (
            <div
              key={source.source_node_id}
              className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"
            >
              <span className="min-w-0 max-w-[360px] truncate text-text-secondary">
                {source.source_title}
              </span>
              <SourceChip sourceApp={source.source_app} />
              <ContextSourceActions
                threadId={threadId}
                postId={postId}
                source={source}
                action={metadata.action}
                pending={pending}
                runAction={runAction}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
        {sourceNodeId ? (
          <Link
            href={sourceThreadHref(sourceNodeId, sourcePostId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 items-center rounded border border-border-subtle px-2 text-[11px] font-medium text-text-secondary transition-colors hover:border-border hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Open
          </Link>
        ) : null}
        {sourceNodeId && metadata.action !== "removed" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void runAction(() =>
                removeThreadContext(threadId, sourceNodeId, postId)
              )
            }
            className={contextEventButtonClassName}
          >
            Remove from this thread
          </button>
        ) : null}
        {sourceNodeId && metadata.action !== "ignored" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void runAction(() =>
                ignoreThreadContext(threadId, sourceNodeId, postId)
              )
            }
            className={contextEventButtonClassName}
          >
            Ignore going forward
          </button>
        ) : null}
        {sourceNodeId && showAddBack ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void runAction(() =>
                allowThreadContext(threadId, sourceNodeId, postId)
              )
            }
            className={contextEventButtonClassName}
          >
            Add back to this thread
          </button>
        ) : null}
        {sourceNodeId && showAllow ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void runAction(() =>
                allowThreadContext(threadId, sourceNodeId, postId)
              )
            }
            className={contextEventButtonClassName}
          >
            Allow in suggestions
          </button>
        ) : null}
        </div>
      )}
    </div>
  );
}

const contextEventButtonClassName =
  "inline-flex h-6 items-center rounded border border-border-subtle px-2 text-[11px] font-medium text-text-secondary transition-colors hover:border-border hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50";

function ContextSourceActions({
  threadId,
  postId,
  source,
  action,
  pending,
  runAction,
}: {
  threadId: string;
  postId: string;
  source: ContextEventSourceMetadata;
  action: ContextEventMetadata["action"];
  pending: boolean;
  runAction: (action: () => Promise<void>) => Promise<void>;
}) {
  const showAddBack = action === "removed";
  const showAllow = action === "ignored";

  return (
    <>
      <Link
        href={sourceThreadHref(source.source_node_id, source.source_post_id)}
        target="_blank"
        rel="noreferrer"
        className={contextEventButtonClassName}
      >
        Open
      </Link>
      {action !== "removed" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void runAction(() =>
              removeThreadContext(threadId, source.source_node_id, postId)
            )
          }
          className={contextEventButtonClassName}
        >
          Remove from this thread
        </button>
      ) : null}
      {action !== "ignored" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void runAction(() =>
              ignoreThreadContext(threadId, source.source_node_id, postId)
            )
          }
          className={contextEventButtonClassName}
        >
          Ignore going forward
        </button>
      ) : null}
      {showAddBack ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void runAction(() =>
              allowThreadContext(threadId, source.source_node_id, postId)
            )
          }
          className={contextEventButtonClassName}
        >
          Add back to this thread
        </button>
      ) : null}
      {showAllow ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void runAction(() =>
              allowThreadContext(threadId, source.source_node_id, postId)
            )
          }
          className={contextEventButtonClassName}
        >
          Allow in suggestions
        </button>
      ) : null}
    </>
  );
}
