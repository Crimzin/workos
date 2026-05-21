"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

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
  const tabs: { id: TabId; label: string; content: ReactNode }[] = [
    { id: "posts", label: "Thread", content: postsContent },
    { id: "subthreads", label: "Sub-threads", content: subThreadsContent },
    { id: "fields", label: "Fields", content: fieldsContent },
    { id: "memory", label: "Memory", content: memoryContent },
    { id: "tree", label: "Tree", content: treeContent },
  ];

  const tabBaseId = useId();
  const [active, setActive] = useState<TabId>("posts");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 overflow-x-auto border-b border-border px-6">
        <div role="tablist" className="flex gap-0">
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            const tabId = `${tabBaseId}-${tab.id}-tab`;
            const panelId = `${tabBaseId}-${tab.id}-panel`;

            return (
              <button
                key={tab.id}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                onClick={() => setActive(tab.id)}
                className={[
                  "border-b-2 -mb-px whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
                  isActive
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((tab) => {
        const isActive = active === tab.id;

        return (
          <div
            key={tab.id}
            id={`${tabBaseId}-${tab.id}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabBaseId}-${tab.id}-tab`}
            hidden={!isActive}
            className={
              tab.id === "posts"
                ? "min-h-0 flex-1 overflow-hidden"
                : "min-h-0 flex-1 overflow-auto"
            }
          >
            {isActive && tab.content}
          </div>
        );
      })}
    </div>
  );
}
