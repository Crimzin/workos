"use client";

import { useRef, useState, useTransition } from "react";
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
  currentActorName,
}: PostsTabContentProps) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pinned = initialPosts.filter((p) => p.pinned);
  const feed = initialPosts.filter((p) => !p.pinned);

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createPost(nodeId, workspaceId, trimmed);
      setBody("");
      textareaRef.current?.focus();
    });
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

      {/* Empty state */}
      {initialPosts.length === 0 && (
        <p className="py-10 text-center text-sm text-text-tertiary">
          No posts yet. Be the first to post.
        </p>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-border">
            <Pin size={11} className="text-text-tertiary" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Pinned</span>
          </div>
          <div className="divide-y divide-border border-b border-border">
            {pinned.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                nodeId={nodeId}
                workspaceId={workspaceId}
                currentActorId={currentActorId}
              />
            ))}
          </div>
        </>
      )}

      {/* Feed */}
      {feed.length > 0 && (
        <div className="divide-y divide-border">
          {feed.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              nodeId={nodeId}
              workspaceId={workspaceId}
              currentActorId={currentActorId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
