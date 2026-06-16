"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { Menu, PanelTopClose, PanelTopOpen, X } from "lucide-react";
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
import { useMobileShell } from "./mobile-app-shell";
import { NodeIdentityRail } from "./node-identity-rail";

type TabId = "posts" | "board" | "fields" | "memory" | "tree";
type MobileDetailsTabId = "fields" | "memory" | "tree";

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
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [mobileDetailsActive, setMobileDetailsActive] =
    useState<MobileDetailsTabId>("fields");
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const [chromeHydrated, setChromeHydrated] = useState(false);
  const mobileShell = useMobileShell();

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setChromeCollapsed(
        parseTopChromeCollapsed(localStorage.getItem(TOP_CHROME_COLLAPSED_KEY))
      );
      setChromeHydrated(true);
    });

    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncMobileDefault = () => {
      if (media.matches) setActive("posts");
    };

    syncMobileDefault();
    media.addEventListener("change", syncMobileDefault);
    return () => media.removeEventListener("change", syncMobileDefault);
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
              tab.id === "board" ? "hidden md:inline-flex" : "",
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
  const mobileDetailsTabs: {
    id: MobileDetailsTabId;
    label: string;
    content: ReactNode;
  }[] = [
    { id: "fields", label: "Fields", content: fieldsContent },
    { id: "memory", label: "Memory", content: memoryContent },
    ...(treeContent
      ? [{ id: "tree" as const, label: "Children", content: treeContent }]
      : []),
  ];
  const mobileDetailsContent =
    mobileDetailsTabs.find((tab) => tab.id === mobileDetailsActive)?.content ??
    fieldsContent;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {identity && (
        <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:hidden">
          <button
            type="button"
            aria-label="Open chat list"
            onClick={() => mobileShell?.openMobileNav()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-card/95 text-text-secondary shadow-sm transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Menu size={17} />
          </button>
          <button
            type="button"
            onClick={() => setMobileDetailsOpen(true)}
            className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-bg-card/95 px-3 text-sm font-medium text-text-secondary shadow-sm transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Details
          </button>
        </div>
      )}

      {identity && (
        <div className="hidden md:block">
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
        </div>
      )}

      {!showCollapsedChrome && (
        <div className={`hidden shrink-0 overflow-x-auto border-b border-border md:block ${paddingClassName}`}>
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

      {identity && mobileDetailsOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Dismiss details"
            className="absolute inset-0 bg-black/25"
            onClick={() => setMobileDetailsOpen(false)}
          />
          <section className="absolute inset-x-0 top-0 flex max-h-[86dvh] min-h-[45dvh] flex-col overflow-hidden rounded-b-lg border-b border-border bg-bg-primary pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
              <div className="text-sm font-semibold text-text-primary">Details</div>
              <button
                type="button"
                aria-label="Close details"
                onClick={() => setMobileDetailsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={16} />
              </button>
            </div>
            <NodeIdentityRail
              node={identity.node}
              workspaceId={identity.workspaceId}
              trail={identity.trail}
              badges={identity.badges}
              owner={identity.owner}
              members={identity.members}
              actions={identity.actions}
              viewSwitcher={identity.viewSwitcher}
              paddingClassName="px-4"
            />
            <div className="shrink-0 overflow-x-auto border-b border-border px-4">
              <div role="tablist" className="flex gap-0">
                {mobileDetailsTabs.map((tab) => {
                  const selected = mobileDetailsActive === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setMobileDetailsActive(tab.id)}
                      className={[
                        "border-b-2 -mb-px whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
                        selected
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
            <div className="min-h-0 flex-1 overflow-auto">
              {mobileDetailsContent}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
