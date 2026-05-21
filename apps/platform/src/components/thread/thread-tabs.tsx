"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type TabId = "posts" | "subthreads" | "fields" | "memory" | "tree";

export interface ThreadTabsProps {
  postsContent: ReactNode;
  subThreadsContent: ReactNode;
  fieldsContent: ReactNode;
  memoryContent: ReactNode;
  treeContent: ReactNode;
}

export function ThreadTabs({
  postsContent,
  subThreadsContent,
  fieldsContent,
  memoryContent,
  treeContent,
}: ThreadTabsProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "posts", label: "Thread" },
    { id: "subthreads", label: "Sub-threads" },
    { id: "fields", label: "Fields" },
    { id: "memory", label: "Memory" },
    { id: "tree", label: "Tree" },
  ];

  const [active, setActive] = useState<TabId>("posts");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex gap-0 border-b border-border px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={[
              "border-b-2 -mb-px px-3 py-2 text-sm font-medium transition-colors",
              active === tab.id
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={
          active === "posts"
            ? "min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-auto"
        }
      >
        {active === "posts" && postsContent}
        {active === "subthreads" && subThreadsContent}
        {active === "fields" && fieldsContent}
        {active === "memory" && memoryContent}
        {active === "tree" && treeContent}
      </div>
    </div>
  );
}
