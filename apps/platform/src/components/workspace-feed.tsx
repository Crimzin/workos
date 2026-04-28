"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, CreditCard } from "lucide-react";
import type { FeedPost } from "@/lib/posts";
import { PostItem } from "./post-item";

interface WorkspaceFeedProps {
  workspaceId: string;
  workspaceFeed: FeedPost[];
  allFeed: FeedPost[];
  actorId: string;
  isPersonal: boolean;
}

type FeedTab = "my" | "workspace" | "all";

export function WorkspaceFeed({
  workspaceId,
  workspaceFeed,
  allFeed,
  actorId,
  isPersonal,
}: WorkspaceFeedProps) {
  const [tab, setTab] = useState<FeedTab>("workspace");

  const tabs: { id: FeedTab; label: string }[] = [
    { id: "my", label: "My Feed" },
    { id: "workspace", label: "Workspace" },
    ...(isPersonal ? [{ id: "all" as FeedTab, label: "All" }] : []),
  ];

  // In solo mode, My Feed = Workspace Feed
  const posts: FeedPost[] =
    tab === "all" ? allFeed : tab === "my" ? workspaceFeed : workspaceFeed;

  return (
    <div className="mx-auto max-w-2xl w-full">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border mb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed items */}
      {posts.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-tertiary">No activity yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {posts.map((post) => (
            <FeedPostItem
              key={post.id}
              post={post}
              workspaceId={workspaceId}
              actorId={actorId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedPostItem({
  post,
  workspaceId,
  actorId,
}: {
  post: FeedPost;
  workspaceId: string;
  actorId: string;
}) {
  const nodeType = post.node?.type;
  const nodeTitle = post.node?.title ?? "Unknown";
  const nodeId = post.node?.id ?? "";

  return (
    <div>
      {/* Node header */}
      <div className="flex items-center gap-1.5 px-5 pt-3 pb-0">
        <span className="text-text-tertiary">
          {nodeType === "stack" ? <Layers size={12} /> : <CreditCard size={12} />}
        </span>
        <Link
          href={`/n/${workspaceId}?d=${nodeId}`}
          scroll={false}
          className="text-xs text-text-tertiary hover:text-text-secondary transition-colors font-medium"
        >
          {nodeTitle}
        </Link>
      </div>
      <PostItem
        post={post}
        nodeId={nodeId}
        workspaceId={workspaceId}
        currentActorId={actorId}
      />
    </div>
  );
}
