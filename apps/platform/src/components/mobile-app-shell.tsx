"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SidebarTreeNode } from "@/lib/sidebar-tree";
import type { PinnedSidebarNode } from "@/lib/sidebar-tree-dnd";
import { getMobileDrawerSwipeIntent } from "@/lib/mobile-shell";
import { Sidebar } from "./sidebar";

interface MobileShellContextValue {
  openMobileNav: () => void;
  closeMobileNav: () => void;
}

const MobileShellContext = createContext<MobileShellContextValue | null>(null);

interface MobileGestureStart {
  x: number;
  y: number;
  target: EventTarget | null;
}

export function useMobileShell() {
  return useContext(MobileShellContext);
}

export function MobileAppShell({
  projectTree,
  pinnedNodes,
  children,
}: {
  projectTree: SidebarTreeNode[];
  pinnedNodes: PinnedSidebarNode[];
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const gestureStartRef = useRef<MobileGestureStart | null>(null);

  const openMobileNav = () => setMobileNavOpen(true);
  const closeMobileNav = () => setMobileNavOpen(false);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    gestureStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      target: event.target,
    };
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start || event.pointerType === "mouse") return;
    if (isInteractiveTextTarget(start.target)) return;

    const intent = getMobileDrawerSwipeIntent({
      drawerOpen: mobileNavOpen,
      startX: start.x,
      deltaX: event.clientX - start.x,
      deltaY: event.clientY - start.y,
    });

    if (intent === "open") openMobileNav();
    if (intent === "close") closeMobileNav();
  }

  return (
    <MobileShellContext.Provider value={{ openMobileNav, closeMobileNav }}>
      <div
        className="relative flex h-dvh w-full overflow-hidden bg-bg-primary text-text-primary"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gestureStartRef.current = null;
        }}
      >
        <div className="hidden md:flex md:shrink-0">
          <Sidebar projectTree={projectTree} pinnedNodes={pinnedNodes} />
        </div>

        <div
          className={[
            "fixed inset-y-0 left-0 z-50 w-[min(86vw,360px)] transform transition-transform duration-200 ease-out md:hidden",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <Sidebar
            projectTree={projectTree}
            pinnedNodes={pinnedNodes}
            variant="mobile-drawer"
            onNavigate={closeMobileNav}
            onMobileClose={closeMobileNav}
          />
        </div>

        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Dismiss chat list"
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={closeMobileNav}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </MobileShellContext.Provider>
  );
}

function isInteractiveTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, [contenteditable="true"], .bn-editor, [data-mobile-swipe-lock="true"]'
    )
  );
}
