"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import type { Block } from "@blocknote/core";
import type { ActorForMention } from "@/lib/actor";
import type { PostRecord } from "@/lib/posts";
import { createPost } from "@/lib/actions/posts";
import { PostEditor, serializePostBody } from "./post-editor";
import { PostItem } from "./post-item";

interface PostsTabContentProps {
  nodeId: string;
  workspaceId: string;
  initialPosts: PostRecord[];
  currentActorId: string;
  currentActorName: string;
  actors: ActorForMention[];
}

/** True when the document has only a single empty paragraph (nothing typed). */
function isEditorEmpty(blocks: Block[]): boolean {
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const b = blocks[0];
  return (
    b.type === "paragraph" &&
    (!b.content || (Array.isArray(b.content) && b.content.length === 0))
  );
}

export function PostsTabContent({
  nodeId,
  workspaceId,
  initialPosts,
  currentActorId,
  actors,
}: PostsTabContentProps) {
  const [posts, setPosts] = useState<PostRecord[]>(initialPosts);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [pending, startTransition] = useTransition();
  // Increment to force-remount (reset) the BlockNote composer after submit.
  const [composerKey, setComposerKey] = useState(0);
  const currentBlocksRef = useRef<Block[]>([]);
  const router = useRouter();

  // Keep local posts in sync when server passes fresh data (after router.refresh()).
  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  const pinnedCount = posts.filter((p) => p.pinned).length;
  const visiblePosts = showPinnedOnly ? posts.filter((p) => p.pinned) : posts;

  const handleSubmit = (blocks: Block[]) => {
    if (isEditorEmpty(blocks)) return;
    const body = serializePostBody(blocks);
    startTransition(async () => {
      await createPost(nodeId, workspaceId, body);
      setComposerKey((k) => k + 1); // remounts editor → clean slate
      setHasContent(false);
      router.refresh();
    });
  };

  const handlePinToggle = (postId: string, pinned: boolean) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, pinned, pinned_at: pinned ? new Date().toISOString() : null }
          : p
      )
    );
    if (!pinned && pinnedCount - 1 === 0) setShowPinnedOnly(false);
  };

  const handleDelete = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleUpdate = (postId: string, newBody: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, body: newBody } : p))
    );
  };

  return (
    <div className="flex flex-col">
      {/* Composer */}
      <div
        className={[
          "border-b border-border px-5 py-4",
          pending ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        <div className="rounded-md border border-border bg-bg-card overflow-hidden focus-within:ring-1 focus-within:ring-accent">
          <PostEditor
            key={composerKey}
            editable
            actors={actors}
            onChange={(blocks) => {
              currentBlocksRef.current = blocks;
              setHasContent(!isEditorEmpty(blocks));
            }}
            onSubmit={handleSubmit}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">
            / for blocks · ⌘↵ to post
          </span>
          <button
            type="button"
            disabled={pending || !hasContent}
            onClick={() => handleSubmit(currentBlocksRef.current)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      {/* Pinned filter toggle */}
      {pinnedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowPinnedOnly((v) => !v)}
          className={[
            "flex w-full items-center gap-1.5 border-b border-border px-5 py-2 text-left text-xs transition-colors",
            showPinnedOnly
              ? "bg-accent/5 text-accent"
              : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
          ].join(" ")}
        >
          <Pin size={11} className="shrink-0" />
          <span>
            {pinnedCount} pinned
            {showPinnedOnly && " · click to show all"}
          </span>
        </button>
      )}

      {/* Empty state */}
      {visiblePosts.length === 0 && (
        <p className="py-10 text-center text-sm text-text-tertiary">
          {showPinnedOnly
            ? "No pinned posts."
            : "No posts yet. Be the first to post."}
        </p>
      )}

      {/* Feed */}
      {visiblePosts.length > 0 && (
        <div className="divide-y divide-border">
          {visiblePosts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              nodeId={nodeId}
              workspaceId={workspaceId}
              currentActorId={currentActorId}
              actors={actors}
              onPinToggle={handlePinToggle}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
