"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SidebarTreeNode } from "@/lib/sidebar-tree";
import type { PinnedSidebarNode } from "@/lib/sidebar-tree-dnd";
import {
  DEFAULT_MOBILE_NAV_OPEN,
  getMobileDrawerSwipeIntent,
} from "@/lib/mobile-shell";
import { Sidebar } from "./sidebar";

interface MobileShellContextValue {
  openMobileNav: () => void;
  closeMobileNav: () => void;
}

const MobileShellContext = createContext<MobileShellContextValue | null>(null);

interface MobileGestureStart {
  source: "pointer" | "touch";
  x: number;
  y: number;
  currentX: number;
  currentY: number;
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
  const [mobileNavOpen, setMobileNavOpen] = useState(DEFAULT_MOBILE_NAV_OPEN);
  const gestureStartRef = useRef<MobileGestureStart | null>(null);
  const mobileNavOpenRef = useRef(mobileNavOpen);

  const openMobileNav = useCallback(() => {
    mobileNavOpenRef.current = true;
    setMobileNavOpen(true);
  }, []);
  const closeMobileNav = useCallback(() => {
    mobileNavOpenRef.current = false;
    setMobileNavOpen(false);
  }, []);

  useEffect(() => {
    mobileNavOpenRef.current = mobileNavOpen;
  }, [mobileNavOpen]);

  useEffect(() => {
    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;

      gestureStartRef.current = {
        source: "touch",
        x: touch.clientX,
        y: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        target: event.target,
      };
    }

    function onTouchMove(event: TouchEvent) {
      const start = gestureStartRef.current;
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!start || !touch) return;

      start.currentX = touch.clientX;
      start.currentY = touch.clientY;
    }

    function onTouchEnd(event: TouchEvent) {
      const start = gestureStartRef.current;
      const touch = event.changedTouches[0];
      gestureStartRef.current = null;

      if (!start) return;
      if (isInteractiveTextTarget(start.target)) return;

      applyGestureIntent(
        start,
        touch?.clientX ?? start.currentX,
        touch?.clientY ?? start.currentY,
        mobileNavOpenRef.current,
        openMobileNav,
        closeMobileNav
      );
    }

    function onTouchCancel() {
      if (gestureStartRef.current?.source === "touch") {
        gestureStartRef.current = null;
      }
    }

    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchcancel", onTouchCancel, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchcancel", onTouchCancel, true);
    };
  }, [closeMobileNav, openMobileNav]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    gestureStartRef.current = {
      source: "pointer",
      x: event.clientX,
      y: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      target: event.target,
    };
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start || event.pointerType === "mouse") return;
    if (start.source !== "pointer") return;
    if (isInteractiveTextTarget(start.target)) return;

    applyGestureIntent(
      start,
      event.clientX,
      event.clientY,
      mobileNavOpen,
      openMobileNav,
      closeMobileNav
    );
  }

  return (
    <MobileShellContext.Provider value={{ openMobileNav, closeMobileNav }}>
      <div
        className="relative flex h-dvh w-full overflow-hidden bg-bg-primary text-text-primary"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          if (gestureStartRef.current?.source === "pointer") {
            gestureStartRef.current = null;
          }
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

function applyGestureIntent(
  start: MobileGestureStart,
  clientX: number,
  clientY: number,
  drawerOpen: boolean,
  openMobileNav: () => void,
  closeMobileNav: () => void
) {
  const intent = getMobileDrawerSwipeIntent({
    drawerOpen,
    startX: start.x,
    deltaX: clientX - start.x,
    deltaY: clientY - start.y,
  });

  if (intent === "open") openMobileNav();
  if (intent === "close") closeMobileNav();
}

function isInteractiveTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, [contenteditable="true"], .bn-editor, [data-mobile-swipe-lock="true"]'
    )
  );
}
