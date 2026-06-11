"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { PanelTopClose, PanelTopOpen } from "lucide-react";
import type {
  HeaderFieldBadge,
  NodeIdentityTrailItem,
} from "@/lib/detail-header";
import {
  formatTopChromeCollapsed,
  getTopChromeToggleLabel,
  parseTopChromeCollapsed,
  TOP_CHROME_COLLAPSED_KEY,
} from "@/lib/top-chrome";
import type { WorkNode } from "@/lib/types";
import { NodeIdentityRail } from "./node-identity-rail";

type TabId = "posts" | "board" | "fields" | "memory" | "tree";

interface NodeDetailIdentityActor {
  id: string;
  name: string;
  kind: string;
}

interface NodeDetailIdentity {
  node: WorkNode;
  workspaceId: string;
  trail: NodeIdentityTrailItem[];
  badges: HeaderFieldBadge[];
  owner: NodeDetailIdentityActor | null;
  members: NodeDetailIdentityActor[];
  actions?: ReactNode;
  viewSwitcher?: ReactNode;
}

interface NodeDetailTabsProps {
  identity?: NodeDetailIdentity;
  postsContent: ReactNode;
  boardContent?: ReactNode;
  fieldsContent: ReactNode;
  memoryContent: ReactNode;
  treeContent?: ReactNode;
  paddingClassName?: string;
}

export function NodeDetailTabs({
  identity,
  postsContent,
  boardContent,
  fieldsContent,
  memoryContent,
  treeContent,
  paddingClassName = "px-6",
}: NodeDetailTabsProps) {
  const tabs: { id: TabId; label: string; content: ReactNode }[] = [
    { id: "posts", label: "Chat", content: postsContent },
    ...(boardContent ? [{ id: "board" as const, label: "Board", content: boardContent }] : []),
    { id: "fields", label: "Fields", content: fieldsContent },
    { id: "memory", label: "Memory", content: memoryContent },
    ...(treeContent ? [{ id: "tree" as const, label: "Tree", content: treeContent }] : []),
  ];

  const tabBaseId = useId();
  const [active, setActive] = useState<TabId>("posts");
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const [chromeHydrated, setChromeHydrated] = useState(false);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setChromeCollapsed(
        parseTopChromeCollapsed(localStorage.getItem(TOP_CHROME_COLLAPSED_KEY))
      );
      setChromeHydrated(true);
    });

    return () => cancelAnimationFrame(frameId);
  }, []);

  function toggleChromeCollapsed() {
    const next = !chromeCollapsed;
    setChromeCollapsed(next);
    localStorage.setItem(TOP_CHROME_COLLAPSED_KEY, formatTopChromeCollapsed(next));
  }

  function activateTab(tabId: TabId) {
    setActive(tabId);
    requestAnimationFrame(() => {
      document.getElementById(`${tabBaseId}-${tabId}-tab`)?.focus();
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

  const chromeButton = identity ? (
    <button
      type="button"
      aria-label={getTopChromeToggleLabel(chromeCollapsed)}
      title={getTopChromeToggleLabel(chromeCollapsed)}
      onClick={toggleChromeCollapsed}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {chromeCollapsed ? <PanelTopOpen size={15} /> : <PanelTopClose size={15} />}
    </button>
  ) : null;

  const tabList = (compact: boolean) => (
    <div
      role="tablist"
      className={compact ? "flex min-w-0 shrink-0 items-center gap-0" : "flex gap-0"}
    >
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
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            className={[
              "border-b-2 -mb-px whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
              compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
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
  );

  const showCollapsedChrome = identity && chromeHydrated && chromeCollapsed;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {identity && (
        <NodeIdentityRail
          node={identity.node}
          workspaceId={identity.workspaceId}
          trail={identity.trail}
          badges={identity.badges}
          owner={identity.owner}
          members={identity.members}
          compact={!!showCollapsedChrome}
          leadingControl={chromeButton}
          inlineControls={showCollapsedChrome ? tabList(true) : undefined}
          actions={identity.actions}
          viewSwitcher={identity.viewSwitcher}
          paddingClassName={paddingClassName}
        />
      )}

      {!showCollapsedChrome && (
        <div className={`shrink-0 overflow-x-auto border-b border-border ${paddingClassName}`}>
          {tabList(false)}
        </div>
      )}

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
              tab.id === "posts" || tab.id === "board"
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
