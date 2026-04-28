"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pin, Pencil, Trash2 } from "lucide-react";
import type { Block } from "@blocknote/core";
import type { PostRecord } from "@/lib/posts";
import { updatePost, deletePost, pinPost } from "@/lib/actions/posts";
import { PostEditor, parsePostBody, serializePostBody } from "./post-editor";

interface PostItemProps {
  post: PostRecord;
  nodeId: string;
  workspaceId: string;
  currentActorId: string;
  onPinToggle?: (postId: string, pinned: boolean) => void;
  onDelete?: (postId: string) => void;
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
  const [localPinned, setLocalPinned] = useState(post.pinned);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const isOwn = post.actor_id === currentActorId;
  const isActivity = post.post_type !== "post";

  const handleSaveEdit = (blocks: Block[]) => {
    const newBody = serializePostBody(blocks);
    startTransition(async () => {
      await updatePost(post.id, nodeId, workspaceId, newBody);
      setEditing(false);
      onUpdate?.(post.id, newBody);
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
    setLocalPinned(newPinned);
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
  const initialContent = parsePostBody(post.body);

  return (
    <div className="group relative px-5 py-3 hover:bg-bg-hover/40 transition-colors">
      {/* Pin decoration */}
      {localPinned && (
        <div className="absolute right-4 top-3 text-accent/60">
          <Pin size={11} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
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
        <div className="rounded-md border border-accent bg-bg-card overflow-hidden">
          <PostEditor
            initialContent={initialContent}
            editable
            onSubmit={handleSaveEdit}
            onCancel={() => setEditing(false)}
          />
          <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <span className="text-[10px] text-text-tertiary">⌘↵ to save</span>
          </div>
        </div>
      ) : (
        <div className="prose-post">
          <PostEditor initialContent={initialContent} editable={false} />
        </div>
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
                  localPinned ? "text-accent hover:text-accent/70" : "text-text-tertiary hover:text-text-secondary",
                ].join(" ")}
              >
                <Pin size={11} />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(true)}
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
    year: new Date(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
