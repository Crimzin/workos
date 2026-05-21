"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";

type TabId = "posts" | "fields" | "memory" | "tree";

export interface ThreadTabsProps {
  postsContent: ReactNode;
  fieldsContent: ReactNode;
  memoryContent: ReactNode;
  treeContent: ReactNode;
}

export function ThreadTabs({
  postsContent,
  fieldsContent,
  memoryContent,
  treeContent,
}: ThreadTabsProps) {
  const tabs: { id: TabId; label: string; content: ReactNode }[] = [
    { id: "posts", label: "Chat", content: postsContent },
    { id: "fields", label: "Fields", content: fieldsContent },
    { id: "memory", label: "Memory", content: memoryContent },
    { id: "tree", label: "Tree", content: treeContent },
  ];

  const tabBaseId = useId();
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    posts: null,
    fields: null,
    memory: null,
    tree: null,
  });
  const [active, setActive] = useState<TabId>("posts");

  function activateTab(tabId: TabId) {
    setActive(tabId);
    requestAnimationFrame(() => {
      tabRefs.current[tabId]?.focus();
    });
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: TabId
  ) {
    const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    activateTab(tabs[nextIndex].id);
  }

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
                tabIndex={isActive ? 0 : -1}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                onClick={() => setActive(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
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
