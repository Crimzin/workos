"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import {
  Check,
  Clipboard,
  FileDown,
  FileText,
  Pin,
  Pencil,
  SmilePlus,
  Trash2,
} from "lucide-react";
import type { Block } from "@blocknote/core";
import type { ActorForMention } from "@/lib/actor";
import type { PostRecord } from "@/lib/posts";
import type { PostReactionSummary } from "@/lib/post-reactions";
import {
  updatePost,
  deletePost,
  pinPost,
  togglePostReaction,
} from "@/lib/actions/posts";
import { postBodyToMarkdown } from "@/lib/blocknote-markdown";
import {
  canExportPostToPdf,
  postDocxDownloadPath,
  postPdfDownloadPath,
} from "@/lib/post-export";
import { formatAbsoluteDateTime, formatRelativeAge } from "@/lib/time";
import { PostEditor, parsePostBody, serializePostBody } from "./post-editor";

interface PostItemProps {
  post: PostRecord;
  nodeId: string;
  workspaceId: string;
  currentActorId: string;
  actors?: ActorForMention[];
  onPinToggle?: (postId: string, pinned: boolean) => void;
  onDelete?: (postId: string) => void;
  onUpdate?: (postId: string, newBody: string) => void;
  onReactionUpdate?: (postId: string, reactions: PostReactionSummary[]) => void;
}

export function PostItem({
  post,
  nodeId,
  workspaceId,
  actors,
  onPinToggle,
  onDelete,
  onUpdate,
  onReactionUpdate,
}: PostItemProps) {
  const [localPinned, setLocalPinned] = useState(post.pinned);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reactionPending, startReactionTransition] = useTransition();
  const reactionPickerRef = useRef<HTMLDivElement>(null);

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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyTextForPost(post));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const handleToggleReaction = (emoji: string) => {
    startReactionTransition(async () => {
      const reactions = await togglePostReaction(
        post.id,
        nodeId,
        workspaceId,
        emoji
      );
      onReactionUpdate?.(post.id, reactions);
    });
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    handleToggleReaction(emojiData.emoji);
    setReactionPickerOpen(false);
  };

  useEffect(() => {
    if (!reactionPickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        reactionPickerRef.current &&
        !reactionPickerRef.current.contains(event.target as Node)
      ) {
        setReactionPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReactionPickerOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [reactionPickerOpen]);

  const actorName = post.actor?.name ?? "Unknown";
  const initials = actorName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const isAgent = post.actor?.kind === "agent";
  const initialContent = parsePostBody(post.body);
  const canExportPdf = canExportPostToPdf(post);
  const absoluteCreatedAt = formatAbsoluteDateTime(post.created_at);

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
        <time
          dateTime={post.created_at}
          title={absoluteCreatedAt}
          aria-label={absoluteCreatedAt}
          className="text-[11px] text-text-tertiary"
        >
          {formatRelativeAge(post.created_at)}
        </time>
      </div>

      {/* Body */}
      {isActivity ? (
        <ActivityBody post={post} />
      ) : editing ? (
        <div className="rounded-md border border-accent bg-bg-card overflow-hidden">
          <PostEditor
            initialContent={initialContent}
            editable
            actors={actors}
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
        <div className="prose-post [&_.bn-post-editor_img]:max-h-[360px] [&_.bn-post-editor_img]:max-w-full [&_.bn-post-editor_img]:rounded-lg [&_.bn-post-editor_img]:border [&_.bn-post-editor_img]:border-border [&_.bn-post-editor_img]:bg-bg-card [&_.bn-post-editor_img]:object-contain [&_.bn-post-editor_[data-content-type='image']]:max-w-[min(720px,100%)] [&_.bn-post-editor_[data-node-type='image']]:max-w-[min(720px,100%)]">
          <PostEditor initialContent={initialContent} editable={false} />
        </div>
      )}

      {/* Hover actions */}
      {!editing && !confirmDelete && (
        <div
          className={[
            "absolute right-4 bottom-2.5 flex items-center gap-0.5 transition-opacity",
            !isActivity && post.reactions.length > 0
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100",
          ].join(" ")}
        >
          {!isActivity &&
            post.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                disabled={reactionPending}
                onClick={() => handleToggleReaction(reaction.emoji)}
                title={reaction.actorNames.join(", ")}
                className={[
                  "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] transition-colors hover:bg-bg-hover",
                  reaction.reactedByCurrentActor
                    ? "border border-accent/50 bg-accent-subtle text-accent"
                    : "border border-border bg-bg-card text-text-secondary hover:text-text-primary",
                ].join(" ")}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          {!isActivity && (
            <div ref={reactionPickerRef} className="relative">
              <button
                type="button"
                disabled={reactionPending}
                onClick={() => setReactionPickerOpen((v) => !v)}
                title="Add reaction"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
              >
                <SmilePlus size={12} />
              </button>
              {reactionPickerOpen && (
                <div className="absolute bottom-7 right-0 z-50 rounded-md border border-border bg-bg-card shadow-lg">
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    width={320}
                    height={380}
                    theme={Theme.AUTO}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? "Copied" : "Copy Markdown"}
            className={[
              "inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors",
              !isActivity && post.reactions.length > 0
                ? "opacity-0 group-hover:opacity-100"
                : "",
            ].join(" ")}
          >
            {copied ? <Check size={11} /> : <Clipboard size={11} />}
          </button>
          {canExportPdf && (
            <>
              <Link
                href={postDocxDownloadPath(post.id)}
                target="_blank"
                rel="noreferrer"
                title="Export DOCX"
                className={[
                  "inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors",
                  !isActivity && post.reactions.length > 0
                    ? "opacity-0 group-hover:opacity-100"
                    : "",
                ].join(" ")}
              >
                <FileText size={11} />
              </Link>
              <Link
                href={postPdfDownloadPath(post.id)}
                target="_blank"
                rel="noreferrer"
                title="Export PDF"
                className={[
                  "inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors",
                  !isActivity && post.reactions.length > 0
                    ? "opacity-0 group-hover:opacity-100"
                    : "",
                ].join(" ")}
              >
                <FileDown size={11} />
              </Link>
            </>
          )}
          {!isActivity && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={handlePin}
                title={localPinned ? "Unpin" : "Pin"}
                className={[
                  "inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-bg-hover",
                  localPinned ? "text-accent hover:text-accent/70" : "text-text-tertiary hover:text-text-secondary",
                  post.reactions.length > 0 ? "opacity-0 group-hover:opacity-100" : "",
                ].join(" ")}
              >
                <Pin size={11} />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(true)}
                title="Edit"
                className={[
                  "inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors",
                  post.reactions.length > 0 ? "opacity-0 group-hover:opacity-100" : "",
                ].join(" ")}
              >
                <Pencil size={11} />
              </button>
            </>
          )}
          {!isActivity && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
              title="Delete"
              className={[
                "inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-red-500 transition-colors",
                post.reactions.length > 0 ? "opacity-0 group-hover:opacity-100" : "",
              ].join(" ")}
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

function copyTextForPost(post: PostRecord): string {
  if (post.post_type === "post") return postBodyToMarkdown(post.body);
  if (post.post_type === "card_created" && post.metadata) {
    return `Created card: ${metadataString(post.metadata.card_title) ?? "Untitled"}`;
  }
  if (post.post_type === "link_created" && post.metadata) {
    return `Linked: ${metadataString(post.metadata.target_title) ?? "Untitled"}`;
  }
  if (post.post_type === "sub_thread_created" && post.metadata) {
    return `Opened sub-thread: ${metadataString(post.metadata.sub_thread_title) ?? "Untitled"}`;
  }
  if (post.post_type === "sub_thread_resolved" && post.metadata) {
    const title = metadataString(post.metadata.sub_thread_title) ?? "Untitled";
    const summary = metadataString(post.metadata.summary);
    return summary ? `Resolved sub-thread: ${title} - ${summary}` : `Resolved sub-thread: ${title}`;
  }
  return post.post_type;
}

function ActivityBody({ post }: { post: PostRecord }) {
  if (post.post_type === "card_created" && post.metadata) {
    const cardId = metadataString(post.metadata.card_id);
    const cardTitle = metadataString(post.metadata.card_title) ?? "Untitled";
    return (
      <p className="text-sm text-text-secondary">
        Created card ·{" "}
        {cardId ? (
          <Link
            href={`/n/${cardId}`}
            scroll={false}
            className="text-text-primary font-medium hover:underline"
          >
            {cardTitle}
          </Link>
        ) : (
          <span className="text-text-primary font-medium">{cardTitle}</span>
        )}
      </p>
    );
  }
  if (post.post_type === "link_created" && post.metadata) {
    const targetTitle = metadataString(post.metadata.target_title) ?? "Untitled";
    return (
      <p className="text-sm text-text-secondary">
        Linked · <span className="text-text-primary font-medium">{targetTitle}</span>
      </p>
    );
  }
  if (post.post_type === "sub_thread_created" && post.metadata) {
    const subThreadId = metadataString(post.metadata.sub_thread_id);
    const subThreadTitle =
      metadataString(post.metadata.sub_thread_title) ?? "Untitled";
    return (
      <p className="text-sm text-text-secondary">
        Opened sub-thread ·{" "}
        {subThreadId ? (
          <Link
            href={`/n/${subThreadId}`}
            className="text-text-primary font-medium hover:underline"
          >
            {subThreadTitle}
          </Link>
        ) : (
          <span className="text-text-primary font-medium">{subThreadTitle}</span>
        )}
      </p>
    );
  }
  if (post.post_type === "sub_thread_resolved" && post.metadata) {
    const subThreadId = metadataString(post.metadata.sub_thread_id);
    const subThreadTitle =
      metadataString(post.metadata.sub_thread_title) ?? "Untitled";
    const summary = metadataString(post.metadata.summary);
    return (
      <div className="space-y-1 text-sm text-text-secondary">
        <p>
          Resolved sub-thread ·{" "}
          {subThreadId ? (
            <Link
              href={`/n/${subThreadId}`}
              className="text-text-primary font-medium hover:underline"
            >
              {subThreadTitle}
            </Link>
          ) : (
            <span className="text-text-primary font-medium">
              {subThreadTitle}
            </span>
          )}
        </p>
        {summary ? (
          <p className="border-l-2 border-border-subtle pl-3 text-text-primary">
            {summary}
          </p>
        ) : null}
      </div>
    );
  }
  return <p className="text-sm text-text-tertiary italic">{post.post_type}</p>;
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
