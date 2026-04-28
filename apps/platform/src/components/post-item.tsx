"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Pin, Pencil, Trash2 } from "lucide-react";
import type { PostRecord } from "@/lib/posts";
import { updatePost, deletePost, pinPost } from "@/lib/actions/posts";

interface PostItemProps {
  post: PostRecord;
  nodeId: string;
  workspaceId: string;
  currentActorId: string;
  /** Called after a successful pin/unpin so the parent can update its list. */
  onPinToggle?: (postId: string, pinned: boolean) => void;
  /** Called after a successful delete so the parent can remove the item. */
  onDelete?: (postId: string) => void;
  /** Called after a successful edit so the parent can update the body. */
  onUpdate?: (postId: string, newBody: string) => void;
}

export function PostItem({
  post,
  nodeId,
  workspaceId,
  currentActorId,
  onPinToggle,
  onDelete,
  onUpdate,
}: PostItemProps) {
  // Local pinned state for instant visual feedback before the server round-trip.
  const [localPinned, setLocalPinned] = useState(post.pinned);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(post.body ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOwn = post.actor_id === currentActorId;
  const isActivity = post.post_type !== "post";

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === post.body) {
      setEditing(false);
      setEditValue(post.body ?? "");
      return;
    }
    startTransition(async () => {
      await updatePost(post.id, nodeId, workspaceId, trimmed);
      setEditing(false);
      onUpdate?.(post.id, trimmed);
    });
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    startTransition(async () => {
      await deletePost(post.id, nodeId, workspaceId);
      onDelete?.(post.id);
    });
  };

  const handlePin = () => {
    const newPinned = !localPinned;
    setLocalPinned(newPinned); // optimistic update
    startTransition(async () => {
      await pinPost(post.id, nodeId, workspaceId, newPinned);
      onPinToggle?.(post.id, newPinned);
    });
  };

  const actorName = post.actor?.name ?? "Unknown";
  const initials = actorName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const isAgent = post.actor?.kind === "agent";

  return (
    <div className="group relative px-5 py-3 hover:bg-bg-hover/40 transition-colors">
      {/* Pin decoration — shown in top-right when pinned */}
      {localPinned && (
        <div className="absolute right-4 top-3 text-accent/60">
          <Pin size={11} />
        </div>
      )}

      {/* Header: avatar + name + timestamp */}
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={[
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold bg-bg-hover text-text-secondary",
            isAgent ? "ring-2 ring-agent-accent" : "",
          ].join(" ")}
        >
          {initials}
        </div>
        <span className="text-xs font-medium text-text-primary">{actorName}</span>
        <span className="text-[11px] text-text-tertiary">{formatRelative(post.created_at)}</span>
      </div>

      {/* Body */}
      {isActivity ? (
        <ActivityBody post={post} workspaceId={workspaceId} />
      ) : editing ? (
        <textarea
          ref={textareaRef}
          autoFocus
          value={editValue}
          disabled={pending}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") {
              setEditing(false);
              setEditValue(post.body ?? "");
            }
          }}
          onBlur={handleSave}
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      ) : (
        <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{post.body}</p>
      )}

      {/* Hover actions */}
      {!editing && !confirmDelete && (
        <div className="absolute right-4 bottom-2.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isActivity && isOwn && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={handlePin}
                title={localPinned ? "Unpin" : "Pin"}
                className={[
                  "inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-bg-hover",
                  localPinned
                    ? "text-accent hover:text-accent/70"
                    : "text-text-tertiary hover:text-text-secondary",
                ].join(" ")}
              >
                <Pin size={11} />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditValue(post.body ?? "");
                  setEditing(true);
                }}
                title="Edit"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
              >
                <Pencil size={11} />
              </button>
            </>
          )}
          {isOwn && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
              title="Delete"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-red-500 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}

      {/* Inline delete confirm */}
      {confirmDelete && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-text-secondary">Delete this post?</span>
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityBody({ post, workspaceId }: { post: PostRecord; workspaceId: string }) {
  if (post.post_type === "card_created" && post.metadata) {
    const { card_id, card_title } = post.metadata;
    return (
      <p className="text-sm text-text-secondary">
        Created card ·{" "}
        <Link
          href={`/n/${workspaceId}?d=${card_id}`}
          scroll={false}
          className="text-text-primary font-medium hover:underline"
        >
          {card_title}
        </Link>
      </p>
    );
  }
  if (post.post_type === "link_created" && post.metadata) {
    const { target_title } = post.metadata;
    return (
      <p className="text-sm text-text-secondary">
        Linked · <span className="text-text-primary font-medium">{target_title}</span>
      </p>
    );
  }
  return <p className="text-sm text-text-tertiary italic">{post.post_type}</p>;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(iso).getFullYear() !== new Date().getFullYear()
        ? "numeric"
        : undefined,
  });
}
