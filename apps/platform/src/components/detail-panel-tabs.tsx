"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";

type TabId = "posts" | "fields" | "cards";

interface DetailPanelTabsProps {
  nodeType: string;
  fieldsContent: React.ReactNode;
  cardsContent: React.ReactNode;
}

export function DetailPanelTabs({
  nodeType,
  fieldsContent,
  cardsContent,
}: DetailPanelTabsProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "posts", label: "Posts" },
    { id: "fields", label: "Fields" },
    ...(nodeType === "stack" ? ([{ id: "cards" as TabId, label: "Cards" }]) : []),
  ];

  const [active, setActive] = useState<TabId>("fields");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 flex gap-0 border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={[
              "px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              active === tab.id
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {active === "posts" && <PostsPlaceholder />}
        {active === "fields" && fieldsContent}
        {active === "cards" && cardsContent}
      </div>
    </div>
  );
}

function PostsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-hover">
        <MessageSquare size={18} className="text-text-tertiary" />
      </div>
      <div>
        <div className="text-sm font-medium text-text-secondary">Posts coming soon</div>
        <div className="mt-1 text-xs text-text-tertiary">
          Rich text posts, mentions, and activity feed land in the next update.
        </div>
      </div>
    </div>
  );
}
