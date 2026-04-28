"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import type { PostRecord } from "@/lib/posts";
import { createPost } from "@/lib/actions/posts";
import { PostItem } from "./post-item";

interface PostsTabContentProps {
  nodeId: string;
  workspaceId: string;
  initialPosts: PostRecord[];
  currentActorId: string;
  currentActorName: string;
}

export function PostsTabContent({
  nodeId,
  workspaceId,
  initialPosts,
  currentActorId,
}: PostsTabContentProps) {
  // Local mutable copy of the post list. Mutations (pin/delete/edit) update
  // this immediately for instant feedback; createPost calls router.refresh()
  // which causes the server to re-pass new initialPosts → synced via useEffect.
  const [posts, setPosts] = useState<PostRecord[]>(initialPosts);
  const [body, setBody] = useState("");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep local state in sync when server passes fresh data (e.g. after createPost + router.refresh()).
  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  const pinnedCount = posts.filter((p) => p.pinned).length;
  const visiblePosts = showPinnedOnly ? posts.filter((p) => p.pinned) : posts;

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createPost(nodeId, workspaceId, trimmed);
      setBody("");
      router.refresh(); // re-renders server component → new initialPosts → synced above
      textareaRef.current?.focus();
    });
  };

  // Callbacks for child PostItem — update local state without a round-trip refresh.
  const handlePinToggle = (postId: string, pinned: boolean) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, pinned, pinned_at: pinned ? new Date().toISOString() : null }
          : p
      )
    );
    // If we toggled the last pinned post off and the filter is active, collapse it.
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
      <div className="px-5 py-4 border-b border-border">
        <textarea
          ref={textareaRef}
          value={body}
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Write a post… (⌘↵ to send)"
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={pending || !body.trim()}
            onClick={handleSubmit}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      {/* Pinned-posts filter toggle — only when at least one post is pinned */}
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
          {showPinnedOnly ? "No pinned posts." : "No posts yet. Be the first to post."}
        </p>
      )}

      {/* Feed — all posts in chronological order; pinned ones are decorated in-place */}
      {visiblePosts.length > 0 && (
        <div className="divide-y divide-border">
          {visiblePosts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              nodeId={nodeId}
              workspaceId={workspaceId}
              currentActorId={currentActorId}
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
