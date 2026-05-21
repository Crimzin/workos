"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, CreditCard } from "lucide-react";
import type { ActorForMention } from "@/lib/actor";
import type { FeedPost } from "@/lib/posts";
import { PostItem } from "./post-item";

interface WorkspaceFeedProps {
  workspaceId: string;
  workspaceFeed: FeedPost[];
  allFeed: FeedPost[];
  actorId: string;
  actors: ActorForMention[];
  isPersonal: boolean;
  global?: boolean;
}

type FeedTab = "my" | "workspace" | "all";

export function WorkspaceFeed({
  workspaceId,
  workspaceFeed,
  allFeed,
  actorId,
  actors,
  isPersonal,
  global = false,
}: WorkspaceFeedProps) {
  const [tab, setTab] = useState<FeedTab>(global ? "all" : "workspace");

  const tabs: { id: FeedTab; label: string }[] = global
    ? [{ id: "all", label: "All" }]
    : [
        { id: "my", label: "My Feed" },
        { id: "workspace", label: "Workspace" },
        ...(isPersonal ? [{ id: "all" as FeedTab, label: "All" }] : []),
      ];

  // In solo mode, My Feed = Workspace Feed
  const posts: FeedPost[] =
    global || tab === "all" ? allFeed : tab === "my" ? workspaceFeed : workspaceFeed;

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
              actors={actors}
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
  actors,
}: {
  post: FeedPost;
  workspaceId: string;
  actorId: string;
  actors: ActorForMention[];
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
          href={`/n/${nodeId}`}
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
        actors={actors}
      />
    </div>
  );
}
