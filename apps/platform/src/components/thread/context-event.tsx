"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useTransition } from "react";
import {
  allowThreadContext,
  ignoreThreadContext,
  removeThreadContext,
} from "@/lib/actions/thread-context";
import {
  contextEventSummary,
  type ContextEventMetadata,
} from "@/lib/thread-context";
import { sourceThreadHref } from "@/lib/post-source-links";

export interface ContextEventProps {
  threadId: string;
  metadata: ContextEventMetadata;
}

export function ContextEvent({ threadId, metadata }: ContextEventProps) {
  const router = useRouter();
  const [pending, startActionTransition] = useTransition();
  const sourceNodeId = metadata.source_node_id;
  const sourcePostId = metadata.source_post_id;
  const showAllow = metadata.action === "removed" || metadata.action === "ignored";

  const runAction = (action: () => Promise<void>) => {
    startActionTransition(() => {
      startTransition(async () => {
        await action();
        router.refresh();
      });
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary">
        {contextEventSummary(metadata)}
      </p>
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
              runAction(() => removeThreadContext(threadId, sourceNodeId))
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
              runAction(() => ignoreThreadContext(threadId, sourceNodeId))
            }
            className={contextEventButtonClassName}
          >
            Ignore going forward
          </button>
        ) : null}
        {sourceNodeId && showAllow ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              runAction(() => allowThreadContext(threadId, sourceNodeId))
            }
            className={contextEventButtonClassName}
          >
            Allow in suggestions
          </button>
        ) : null}
      </div>
    </div>
  );
}

const contextEventButtonClassName =
  "inline-flex h-6 items-center rounded border border-border-subtle px-2 text-[11px] font-medium text-text-secondary transition-colors hover:border-border hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50";
