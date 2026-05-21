"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, GitBranchPlus, RotateCcw } from "lucide-react";
import {
  createSubThread,
  reopenSubThread,
  resolveSubThread,
} from "@/lib/actions/nodes";

export interface AddSubThreadInlineProps {
  parentThreadId: string;
  workspaceId: string;
}

export function AddSubThreadInline({
  parentThreadId,
  workspaceId,
}: AddSubThreadInlineProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isPending) return;

    startTransition(async () => {
      const result = await createSubThread(parentThreadId, workspaceId, trimmed);
      setTitle("");
      router.push(`/n/${result.id}`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-b border-border px-5 py-3"
    >
      <GitBranchPlus size={14} className="shrink-0 text-text-tertiary" />
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add sub-thread"
        disabled={isPending}
        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isPending || title.trim().length === 0}
        className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}

export interface ResolveSubThreadButtonProps {
  subThreadId: string;
  parentThreadId: string;
  workspaceId: string;
  defaultSummary: string;
}

export function ResolveSubThreadButton({
  subThreadId,
  parentThreadId,
  workspaceId,
  defaultSummary,
}: ResolveSubThreadButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending || typeof window === "undefined") return;

    const summary = window.prompt("Resolution summary", defaultSummary);
    if (summary === null || summary.trim().length === 0) return;

    startTransition(async () => {
      await resolveSubThread(subThreadId, parentThreadId, workspaceId, summary);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
    >
      <CheckCircle2 size={13} />
      Resolve
    </button>
  );
}

export interface ReopenSubThreadButtonProps {
  subThreadId: string;
  parentThreadId: string;
  workspaceId: string;
}

export function ReopenSubThreadButton({
  subThreadId,
  parentThreadId,
  workspaceId,
}: ReopenSubThreadButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending) return;

    startTransition(async () => {
      await reopenSubThread(subThreadId, parentThreadId, workspaceId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
    >
      <RotateCcw size={13} />
      Reopen
    </button>
  );
}
