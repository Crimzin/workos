"use client";

import { useState } from "react";

type TabId = "posts" | "fields" | "cards";

interface DetailPanelTabsProps {
  nodeType: string;
  fieldsContent: React.ReactNode;
  cardsContent: React.ReactNode;
  postsContent: React.ReactNode;
}

export function DetailPanelTabs({
  nodeType,
  fieldsContent,
  cardsContent,
  postsContent,
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
        {active === "posts" && postsContent}
        {active === "fields" && fieldsContent}
        {active === "cards" && cardsContent}
      </div>
    </div>
  );
}
