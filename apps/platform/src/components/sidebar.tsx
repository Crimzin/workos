"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  FileText,
  LayoutGrid,
  Lightbulb,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Rss,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { SidebarData } from "@/lib/nodes";
import type { ImportedChatRow as ImportedChatRowData } from "@/lib/imported-chats";
import type { SidebarTreeNode } from "@/lib/sidebar-tree";
import { buildAppSearchResults, type AppSearchResult } from "@/lib/app-search";
import {
  createCard,
  createStack,
  createSubThread,
  createWorkspace,
  archiveNode,
  deleteNode,
  hideImportedChat,
  moveSidebarNode,
  pinNode,
  reorderPinnedNode,
  setImportedChatSuggestionStatus,
  unpinNode,
  updateNodeTitle,
} from "@/lib/actions/nodes";
import {
  flattenSidebarTree,
  getPinnedNodes,
  getSidebarPointerDropPlan,
  moveSidebarTreeNode,
  type FlatSidebarTreeNode,
  type SidebarDropPlan,
} from "@/lib/sidebar-tree-dnd";
import { isSettingsPathActive } from "@/lib/settings-nav";
import { ThemeToggle } from "./theme-toggle";
import { InlineCreate } from "./inline-create";
import { ConfirmModal } from "./confirm-modal";

interface SidebarProps {
  sidebarData: SidebarData;
  variant?: "desktop" | "mobile-drawer";
  onNavigate?: () => void;
  onMobileClose?: () => void;
}

const COLLAPSED_KEY = "workos-sidebar-collapsed";
const EXPANDED_KEY = "workos-sidebar-expanded-nodes";
const WIDTH_KEY = "workos-sidebar-width";
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const COLLAPSED_WIDTH = 56;
const SINGLE_CLICK_DELAY_MS = 180;
const DRAG_THRESHOLD_PX = 4;
const SIDEBAR_INDENT_WIDTH = 28;

type SidebarDragKind = "node" | "pin";

interface SidebarDragState {
  kind: SidebarDragKind;
  id: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  overId: string | null;
  active: boolean;
}

interface SidebarDragCandidate extends SidebarDragState {
  active: boolean;
}

export function Sidebar({
  sidebarData,
  variant = "desktop",
  onNavigate,
  onMobileClose,
}: SidebarProps) {
  const { projectTree, searchTree, pinnedNodes, importedChats } = sidebarData;
  const [projectTreeState, setProjectTreeState] = useState({
    source: projectTree,
    tree: projectTree,
  });
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [width, setWidth] = useState(288);
  const [resizing, setResizing] = useState(false);
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [creatingChildOf, setCreatingChildOf] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dragState, setDragState] = useState<SidebarDragState | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(projectTree.map((node) => node.id))
  );
  const dragCandidateRef = useRef<SidebarDragCandidate | null>(null);
  const suppressNavigationClickRef = useRef(false);
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  if (projectTreeState.source !== projectTree) {
    setProjectTreeState({ source: projectTree, tree: projectTree });
  }
  const localProjectTree =
    projectTreeState.source === projectTree ? projectTreeState.tree : projectTree;
  const visibleExpandedIds = expandedIds;
  const flatRows = useMemo(
    () => flattenSidebarTree(localProjectTree, visibleExpandedIds),
    [localProjectTree, visibleExpandedIds]
  );
  const visibleProjectRows = useMemo(
    () => collapsed ? flatRows.filter((row) => row.depth === 0) : flatRows,
    [collapsed, flatRows]
  );
  const effectiveCollapsed = variant === "mobile-drawer" ? false : collapsed;
  const effectiveProjectRows =
    variant === "mobile-drawer" ? flatRows : visibleProjectRows;
  const sortedPins = useMemo(() => getPinnedNodes(pinnedNodes), [pinnedNodes]);
  const pinnedIds = useMemo(
    () => new Set(sortedPins.map((pin) => pin.node.id)),
    [sortedPins]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLocaleLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      setSearchOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const storedCollapsed = localStorage.getItem(COLLAPSED_KEY);
      setCollapsed(storedCollapsed === "1");
      const storedWidth = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(storedWidth) && storedWidth >= MIN_WIDTH) {
        setWidth(clamp(storedWidth, MIN_WIDTH, MAX_WIDTH));
      }

      const storedExpanded = localStorage.getItem(EXPANDED_KEY);
      if (storedExpanded) {
        setExpandedIds(new Set(JSON.parse(storedExpanded) as string[]));
      }
      setHydrated(true);
    });

    return () => cancelAnimationFrame(frameId);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setResizing(true);
    const startX = event.clientX;
    const startWidth = width;

    const handleMove = (moveEvent: PointerEvent) => {
      const next = clamp(startWidth + moveEvent.clientX - startX, MIN_WIDTH, MAX_WIDTH);
      setWidth(next);
      localStorage.setItem(WIDTH_KEY, String(next));
    };
    const handleUp = () => {
      setResizing(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const setExpanded = (id: string, expanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(id);
      else next.delete(id);
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const consumeSuppressedNavigationClick = () => {
    if (!suppressNavigationClickRef.current) return false;
    suppressNavigationClickRef.current = false;
    return true;
  };

  const startSidebarDrag = (
    kind: SidebarDragKind,
    id: string,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if (event.button !== 0) return;

    const candidate: SidebarDragCandidate = {
      kind,
      id,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      overId: id,
      active: false,
    };
    dragCandidateRef.current = candidate;

    const previousUserSelect = document.body.style.userSelect;
    const selector = kind === "pin" ? "[data-sidebar-pin-id]" : "[data-sidebar-node-id]";
    const attribute = kind === "pin" ? "data-sidebar-pin-id" : "data-sidebar-node-id";

    const readOverId = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY);
      const directId = element?.closest(selector)?.getAttribute(attribute);
      if (directId && directId !== id) return directId;

      let closestId: string | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const row of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        const rowId = row.getAttribute(attribute);
        if (!rowId || rowId === id) continue;
        const rect = row.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const verticalDistance =
          clientY < rect.top
            ? rect.top - clientY
            : clientY > rect.bottom
              ? clientY - rect.bottom
              : 0;
        const horizontalDistance =
          clientX < rect.left
            ? rect.left - clientX
            : clientX > rect.right
              ? clientX - rect.right
              : 0;
        const distance = verticalDistance + horizontalDistance;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = rowId;
        }
      }
      return closestId;
    };

    const cleanup = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };

    const finishNodeDrop = (overId: string | null, horizontalDelta: number) => {
      const plan = getSidebarPointerDropPlan({
        activeId: id,
        overId,
        flattened: flatRows,
        horizontalDelta,
        indentWidth: SIDEBAR_INDENT_WIDTH,
      });
      if (!plan) return;
      applySidebarNodeDrop(id, plan);
    };

    const finishPinDrop = (overId: string | null) => {
      if (!overId || overId === id) return;
      const reorderedIds = moveId(
        sortedPins.map((pin) => pin.node.id),
        id,
        overId
      );
      const index = reorderedIds.indexOf(id);
      startTransition(async () => {
        await reorderPinnedNode(
          id,
          reorderedIds[index - 1] ?? null,
          reorderedIds[index + 1] ?? null
        );
        router.refresh();
      });
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const current = dragCandidateRef.current;
      if (!current || current.id !== id || current.kind !== kind) return;

      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;
      const distance = Math.hypot(dx, dy);
      if (!current.active && distance < DRAG_THRESHOLD_PX) return;

      document.body.style.userSelect = "none";
      suppressNavigationClickRef.current = true;
      const overId = readOverId(moveEvent.clientX, moveEvent.clientY);
      const next: SidebarDragCandidate = {
        ...current,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY,
        overId,
        active: true,
      };
      dragCandidateRef.current = next;
      setDragState(next);
      moveEvent.preventDefault();
    };

    const handleUp = (upEvent: PointerEvent) => {
      const current = dragCandidateRef.current;
      dragCandidateRef.current = null;
      cleanup();
      setDragState(null);
      if (!current?.active) return;

      const overId = readOverId(upEvent.clientX, upEvent.clientY) ?? current.overId;
      if (kind === "node") finishNodeDrop(overId, upEvent.clientX - current.startX);
      else finishPinDrop(overId);
      upEvent.preventDefault();
    };

    const handleCancel = () => {
      dragCandidateRef.current = null;
      cleanup();
      setDragState(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  };

  const applySidebarNodeDrop = (nodeId: string, plan: SidebarDropPlan) => {
    setProjectTreeState((state) => ({
      source: state.source,
      tree: moveSidebarTreeNode(state.tree, nodeId, plan),
    }));
    startTransition(async () => {
      await moveSidebarNode(nodeId, plan.parentId, plan.previousId, plan.nextId);
      if (plan.parentId) setExpanded(plan.parentId, true);
      router.refresh();
    });
  };

  return (
    <aside
      className={[
        "relative shrink-0 bg-bg-secondary/95 border-r border-border flex flex-col shadow-sm",
        variant === "mobile-drawer" ? "h-full w-full" : "",
        resizing ? "" : "transition-[width] duration-200 ease-out",
        hydrated ? "" : "invisible",
      ].join(" ")}
      style={
        variant === "mobile-drawer"
          ? undefined
          : { width: collapsed ? COLLAPSED_WIDTH : width }
      }
    >
      <div className="flex h-14 items-center justify-between border-b border-border/70 px-3">
        {!effectiveCollapsed && (
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-accent shadow-sm ring-1 ring-border" />
            <span className="font-serif text-base font-semibold text-text-primary">
              WorkOS
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={variant === "mobile-drawer" ? onMobileClose : toggleCollapsed}
          aria-label={
            variant === "mobile-drawer"
              ? "Close chat list"
              : collapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
          }
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {variant === "mobile-drawer" ? (
            <X size={14} strokeWidth={2.2} />
          ) : (
            <ChevronLeft
              size={14}
              className={collapsed ? "rotate-180" : ""}
              strokeWidth={2.2}
            />
          )}
        </button>
      </div>

      <SidebarSection collapsed={effectiveCollapsed}>
        <NavLink
          href="/feed"
          label="Feed"
          icon={<Rss size={15} />}
          active={pathname === "/feed"}
          collapsed={effectiveCollapsed}
          onNavigate={onNavigate}
        />
        <NavLink
          href="/board"
          label="Board"
          icon={<LayoutGrid size={15} />}
          active={pathname === "/board"}
          collapsed={effectiveCollapsed}
          onNavigate={onNavigate}
        />
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="Search"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          className={[
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
            "text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            effectiveCollapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <Search size={15} strokeWidth={2} />
          {!effectiveCollapsed && <span>Search</span>}
        </button>
        <NavLink
          href="/import"
          label="Import"
          icon={<Upload size={15} />}
          active={pathname === "/import"}
          collapsed={effectiveCollapsed}
          onNavigate={onNavigate}
        />
      </SidebarSection>

      {searchOpen && (
        <AppSearchDialog
          tree={searchTree}
          onClose={() => setSearchOpen(false)}
          onSelect={(result) => {
            setSearchOpen(false);
            onNavigate?.();
            router.push(result.href);
          }}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortedPins.length > 0 && (
          <SidebarSection label="Pinned" collapsed={effectiveCollapsed}>
            {sortedPins.map((pin) => (
              <PinnedNodeRow
                key={pin.node.id}
                node={pin.node}
                collapsed={effectiveCollapsed}
                isActive={pathname === `/n/${pin.node.id}`}
                router={router}
                onNavigate={onNavigate}
                dragState={dragState}
                onDragPointerDown={(event) =>
                  startSidebarDrag("pin", pin.node.id, event)
                }
                consumeSuppressedNavigationClick={consumeSuppressedNavigationClick}
              />
            ))}
          </SidebarSection>
        )}

        <SidebarSection
          label="Projects"
          collapsed={effectiveCollapsed}
          action={
            !effectiveCollapsed && !creatingRoot ? (
              <button
                type="button"
                onClick={() => setCreatingRoot(true)}
                title="New project"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Plus size={13} />
              </button>
            ) : null
          }
        >
          {projectTree.length === 0 && !effectiveCollapsed && !creatingRoot && (
            <div className="px-1 py-1 text-xs text-text-tertiary">
              No projects yet.
            </div>
          )}

          {effectiveProjectRows.map((node) => (
            <div key={node.id}>
              <ProjectTreeNodeRow
                node={node}
                collapsed={effectiveCollapsed}
                isActive={pathname === `/n/${node.id}`}
                isExpanded={visibleExpandedIds.has(node.id)}
                hasChildren={node.children.length > 0}
                isRenaming={renamingId === node.id}
                setRenamingId={setRenamingId}
                onToggle={() => setExpanded(node.id, !visibleExpandedIds.has(node.id))}
                onCreateChild={() => {
                  setExpanded(node.id, true);
                  setCreatingChildOf(node.id);
                }}
                router={router}
                onNavigate={onNavigate}
                isPinned={pinnedIds.has(node.id)}
                dragState={dragState}
                onDragPointerDown={(event) =>
                  startSidebarDrag("node", node.id, event)
                }
                consumeSuppressedNavigationClick={consumeSuppressedNavigationClick}
              />

              {!effectiveCollapsed && creatingChildOf === node.id && (
                <div className="py-1" style={{ paddingLeft: 18 + (node.depth + 1) * 12 }}>
                  <InlineCreate
                    label="New chat"
                    placeholder="New chat"
                    onSubmit={async (title) => createChildNode(node, title)}
                    onCreated={(id) => {
                      setCreatingChildOf(null);
                      setExpanded(node.id, true);
                      onNavigate?.();
                      router.push(`/n/${id}`);
                      router.refresh();
                    }}
                    onCancel={() => setCreatingChildOf(null)}
                    initialExpanded
                    inputClassName="w-full rounded-md border border-border-strong bg-bg-card px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-warm"
                  />
                </div>
              )}
            </div>
          ))}
          {!effectiveCollapsed && creatingRoot && (
            <div className="px-2 py-1">
              <InlineCreate
                label="New project"
                placeholder="Project name"
                onSubmit={async (title) => {
                  const res = await createWorkspace(title);
                  setCreatingRoot(false);
                  return res;
                }}
                onCreated={(id) => {
                  onNavigate?.();
                  router.push(`/n/${id}`);
                  router.refresh();
                }}
                onCancel={() => setCreatingRoot(false)}
                initialExpanded
                inputClassName="w-full rounded-md border border-border-strong bg-bg-card px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-warm"
              />
            </div>
          )}
        </SidebarSection>

        {importedChats.length > 0 && (
          <SidebarSection label="Imported Chats" collapsed={effectiveCollapsed}>
            {importedChats.map((node) => (
              <ImportedChatRow
                key={node.id}
                node={node}
                collapsed={effectiveCollapsed}
                isActive={pathname === `/n/${node.id}`}
                onNavigate={onNavigate}
              />
            ))}
          </SidebarSection>
        )}
      </div>

      <div className="border-t border-border px-2 py-2">
        <NavLink
          href="/settings"
          label="Settings"
          icon={<Settings size={15} />}
          active={isSettingsPathActive(pathname)}
          collapsed={effectiveCollapsed}
          onNavigate={onNavigate}
        />
      </div>

      <div
        className={[
          "border-t border-border px-2 py-2 flex items-center",
          effectiveCollapsed ? "justify-center" : "justify-end",
        ].join(" ")}
      >
        <ThemeToggle />
      </div>
      {variant === "desktop" && !collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          title="Resize sidebar"
          onPointerDown={startResize}
          className="absolute right-[-3px] top-0 z-50 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-accent/30"
        />
      )}
    </aside>
  );
}

function AppSearchDialog({
  tree,
  onClose,
  onSelect,
}: {
  tree: SidebarTreeNode[];
  onClose: () => void;
  onSelect: (result: AppSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => buildAppSearchResults(tree, query, 8), [tree, query]);
  const showEmpty = query.trim().length > 0 && results.length === 0;

  useEffect(() => {
    const frameId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      onSelect(results[activeIndex]);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search WorkOS"
      className="fixed inset-0 z-[120] bg-text-primary/20 px-4 pt-24 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className="mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-border bg-bg-primary shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={16} className="shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search workspaces, stacks, and cards"
            aria-label="Search workspaces, stacks, and cards"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {results.length === 0 && !showEmpty && (
            <div className="px-2 py-6 text-center text-sm text-text-tertiary">
              Start typing to search.
            </div>
          )}

          {showEmpty && (
            <div className="px-2 py-6 text-center text-sm text-text-tertiary">
              No results found.
            </div>
          )}

          {results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(result)}
              className={[
                "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                index === activeIndex
                  ? "bg-bg-selected text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
              ].join(" ")}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg-card text-[10px] font-semibold uppercase text-text-tertiary">
                {result.type.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{result.title}</span>
                <span className="block truncate text-xs text-text-tertiary">
                  {result.path}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PinnedNodeRow({
  node,
  collapsed,
  isActive,
  router,
  onNavigate,
  dragState,
  onDragPointerDown,
  consumeSuppressedNavigationClick,
}: {
  node: SidebarTreeNode;
  collapsed: boolean;
  isActive: boolean;
  router: ReturnType<typeof useRouter>;
  onNavigate?: () => void;
  dragState: SidebarDragState | null;
  onDragPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  consumeSuppressedNavigationClick: () => boolean;
}) {
  const [, startTransition] = useTransition();
  const initial = node.title.charAt(0).toUpperCase();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const dragStyle = getDragStyle(dragState, "pin", node.id);
  const tooltipId = `sidebar-pin-tooltip-${node.id}`;

  const handleUnpin = () => {
    startTransition(async () => {
      await unpinNode(node.id);
      router.refresh();
    });
  };

  const updateTooltip = () => {
    const element = titleRef.current;
    setShowTooltip(Boolean(element && element.scrollWidth > element.clientWidth));
  };

  const navigateToNode = () => {
    if (consumeSuppressedNavigationClick()) return;
    clickTimerRef.current = setTimeout(() => {
      onNavigate?.();
      router.push(`/n/${node.id}`);
      clickTimerRef.current = null;
    }, SINGLE_CLICK_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  if (collapsed) {
    return (
      <Link
        href={`/n/${node.id}`}
        title={node.title}
        style={dragStyle}
        data-sidebar-pin-id={node.id}
        onPointerDown={onDragPointerDown}
        onClick={onNavigate}
        className={[
          "flex items-center justify-center rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-accent-subtle text-accent"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        ].join(" ")}
      >
        <Pin size={14} />
      </Link>
    );
  }

  return (
    <div
      style={dragStyle}
      data-sidebar-pin-id={node.id}
      className={[
        "group relative flex cursor-grab items-center gap-1 rounded-md px-1 py-1.5 text-sm transition-colors active:cursor-grabbing",
        isActive
          ? "bg-accent-subtle text-accent"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
      ].join(" ")}
      onPointerDown={onDragPointerDown}
      aria-describedby={tooltipId}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold bg-bg-card border border-border text-text-secondary">
        {initial}
      </span>
      <button
        ref={titleRef}
        type="button"
        onClick={navigateToNode}
        onMouseEnter={updateTooltip}
        onFocus={updateTooltip}
        onMouseLeave={() => setShowTooltip(false)}
        onBlur={() => setShowTooltip(false)}
        className="min-w-0 flex-1 truncate text-left font-medium"
      >
        {node.title}
      </button>
      <button
        type="button"
        title={`Unpin ${node.title}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          handleUnpin();
        }}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-tertiary opacity-0 transition-opacity hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <PinOff size={11} />
      </button>
      {showTooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-6 top-full z-50 mt-1 max-w-[320px] rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary shadow-lg"
        >
          {node.title}
        </div>
      )}
    </div>
  );
}

function ImportedChatRow({
  node,
  collapsed,
  isActive,
  onNavigate,
}: {
  node: ImportedChatRowData;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const closeHref = "/feed";
  const nextSuggestionStatus =
    node.suggestion_status === "ignored" ? "allowed" : "ignored";
  const suggestionLabel =
    node.suggestion_status === "ignored"
      ? "Allow in suggestions"
      : "Ignore in suggestions";
  const menuItemClassName =
    "flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const frameId = requestAnimationFrame(() => {
      menuContentRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, [menuOpen]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    );
    const activeIndex = items.findIndex((item) => item === document.activeElement);
    const focusItem = (index: number) => {
      if (items.length === 0) return;
      items[(index + items.length) % items.length]?.focus();
    };

    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      menuTriggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    }
  };

  const navigateAwayIfActive = () => {
    if (!isActive) return;
    onNavigate?.();
    router.push(closeHref);
  };

  const handleOpen = () => {
    setMenuOpen(false);
    onNavigate?.();
    router.push(`/n/${node.id}`);
  };

  const handleHide = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await hideImportedChat(node.id);
      navigateAwayIfActive();
      router.refresh();
    });
  };

  const handleSuggestionToggle = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await setImportedChatSuggestionStatus(node.id, nextSuggestionStatus);
      router.refresh();
    });
  };

  const handleArchive = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await archiveNode(node.id, node.id, node.parent_id);
      navigateAwayIfActive();
      router.refresh();
    });
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    setMenuOpen(false);
    startTransition(async () => {
      await deleteNode(node.id, node.id, node.parent_id);
      navigateAwayIfActive();
      router.refresh();
    });
  };

  if (collapsed) {
    return (
      <Link
        href={`/n/${node.id}`}
        title={node.title}
        onClick={onNavigate}
        className={[
          "flex items-center justify-center rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-accent-subtle text-accent"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        ].join(" ")}
      >
        <SourceLogo sourceApp={node.source_app} />
      </Link>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={`/n/${node.id}`}
        title={node.title}
        onClick={onNavigate}
        className={[
          "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 pr-7 text-sm transition-colors",
          isActive
            ? "bg-accent-subtle text-accent"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        ].join(" ")}
      >
        <SourceLogo sourceApp={node.source_app} />
        <span className="min-w-0 flex-1 truncate font-medium">{node.title}</span>
      </Link>

      <div className="absolute right-1 top-1" ref={menuRef}>
        <button
          ref={menuTriggerRef}
          type="button"
          aria-label={`Actions for ${node.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary opacity-0 transition hover:bg-bg-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <MoreHorizontal size={11} />
        </button>

        {menuOpen && (
          <div
            ref={menuContentRef}
            role="menu"
            aria-label={`Actions for ${node.title}`}
            className="absolute right-0 top-full z-50 mt-1 min-w-[190px] rounded-md border border-border bg-bg-primary py-1 shadow-lg"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleOpen}
              className={menuItemClassName}
            >
              <FileText size={11} />
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleHide}
              className={menuItemClassName}
            >
              <EyeOff size={11} />
              Hide from Imported Chats
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleSuggestionToggle}
              className={menuItemClassName}
            >
              <Lightbulb size={11} />
              {suggestionLabel}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleArchive}
              className={menuItemClassName}
            >
              <Archive size={11} />
              Archive
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            >
              <Trash2 size={11} />
              Delete forever
            </button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete imported chat?"
          body="This permanently deletes the imported chat and its transcript from WorkOS. This cannot be undone."
          confirmLabel="Delete forever"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function ProjectTreeNodeRow({
  node,
  collapsed,
  isActive,
  isExpanded,
  hasChildren,
  isRenaming,
  setRenamingId,
  onToggle,
  onCreateChild,
  router,
  onNavigate,
  isPinned,
  dragState,
  onDragPointerDown,
  consumeSuppressedNavigationClick,
}: {
  node: FlatSidebarTreeNode;
  collapsed: boolean;
  isActive: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  isRenaming: boolean;
  setRenamingId: (id: string | null) => void;
  onToggle: () => void;
  onCreateChild: () => void;
  router: ReturnType<typeof useRouter>;
  onNavigate?: () => void;
  isPinned: boolean;
  dragState: SidebarDragState | null;
  onDragPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  consumeSuppressedNavigationClick: () => boolean;
}) {
  const [title, setTitle] = useState(node.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const initial = node.title.charAt(0).toUpperCase();
  const tooltipId = `sidebar-tooltip-${node.id}`;
  const dragStyle = getDragStyle(dragState, "node", node.id);

  useEffect(() => {
    if (isRenaming) {
      const frameId = requestAnimationFrame(() => inputRef.current?.select());
      return () => cancelAnimationFrame(frameId);
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const commitRename = () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === node.title) {
      setRenamingId(null);
      return;
    }
    startTransition(async () => {
      await updateNodeTitle(node.id, trimmed, node.rootId, node.parent_id);
      setRenamingId(null);
      router.refresh();
    });
  };

  const startRename = () => {
    setTitle(node.title);
    setRenamingId(node.id);
  };

  const label = node.type === "workspace" ? "project" : "chat";
  const closeHref = "/feed";

  const handleArchive = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await archiveNode(node.id, node.rootId, node.parent_id);
      if (isActive) {
        onNavigate?.();
        router.push(closeHref);
      }
      router.refresh();
    });
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    setMenuOpen(false);
    startTransition(async () => {
      await deleteNode(node.id, node.rootId, node.parent_id);
      if (isActive) {
        onNavigate?.();
        router.push(closeHref);
      }
      router.refresh();
    });
  };

  const handlePinToggle = () => {
    setMenuOpen(false);
    startTransition(async () => {
      if (isPinned) await unpinNode(node.id);
      else await pinNode(node.id);
      router.refresh();
    });
  };

  const updateTooltip = () => {
    const element = titleRef.current;
    setShowTooltip(Boolean(element && element.scrollWidth > element.clientWidth));
  };

  const navigateToNode = () => {
    if (consumeSuppressedNavigationClick()) return;
    clickTimerRef.current = setTimeout(() => {
      onNavigate?.();
      router.push(`/n/${node.id}`);
      clickTimerRef.current = null;
    }, SINGLE_CLICK_DELAY_MS);
  };

  const cancelPendingNavigation = () => {
    if (!clickTimerRef.current) return;
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  };

  useEffect(() => {
    return () => cancelPendingNavigation();
  }, []);

  if (collapsed) {
    return (
      <Link
        href={`/n/${node.id}`}
        title={node.title}
        style={dragStyle}
        data-sidebar-node-id={node.id}
        onPointerDown={onDragPointerDown}
        onClick={onNavigate}
        className={[
          "flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-accent-subtle text-accent"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        ].join(" ")}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold bg-bg-card border border-border text-text-secondary">
          {initial}
        </span>
      </Link>
    );
  }

  return (
    <div
      className={[
        "group relative flex cursor-grab items-center gap-0.5 rounded-md py-1.5 pr-0.5 text-sm transition-colors active:cursor-grabbing",
        isActive
          ? "bg-accent-subtle text-accent"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
      ].join(" ")}
      style={{ ...dragStyle, paddingLeft: 2 + node.depth * 12 }}
      data-sidebar-node-id={node.id}
      onPointerDown={onDragPointerDown}
      aria-describedby={tooltipId}
    >
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (hasChildren) onToggle();
        }}
        disabled={!hasChildren}
        aria-label={isExpanded ? `Collapse ${node.title}` : `Expand ${node.title}`}
        className="inline-flex h-5 w-4 shrink-0 items-center justify-center rounded text-text-tertiary transition-colors enabled:hover:bg-bg-hover enabled:hover:text-text-primary disabled:opacity-40"
      >
        {hasChildren ? (
          isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
        ) : (
          <FileText size={12} />
        )}
      </button>

      {isRenaming ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitRename();
            }
            if (event.key === "Escape") setRenamingId(null);
          }}
          className="min-w-0 flex-1 rounded border border-accent bg-bg-card px-1 py-0 text-sm text-text-primary outline-none"
        />
      ) : (
        <button
          ref={titleRef}
          type="button"
          onClick={navigateToNode}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            cancelPendingNavigation();
            startRename();
          }}
          onMouseEnter={updateTooltip}
          onFocus={updateTooltip}
          onMouseLeave={() => setShowTooltip(false)}
          onBlur={() => setShowTooltip(false)}
          className="min-w-0 flex-1 truncate text-left font-medium"
        >
          {node.title}
        </button>
      )}

      {!isRenaming && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            title={`Add inside ${node.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onCreateChild();
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <Plus size={11} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              title="More options"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((value) => !value);
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <MoreHorizontal size={11} />
            </button>

            {menuOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-md border border-border bg-bg-primary py-1 shadow-lg"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    startRename();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                >
                  <Pencil size={11} />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={handleArchive}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                >
                  <Archive size={11} />
                  Archive
                </button>
                <button
                  type="button"
                  onClick={handlePinToggle}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                >
                  {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                  {isPinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-bg-hover transition-colors"
                >
                  <Trash2 size={11} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!isRenaming && showTooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-6 top-full z-50 mt-1 max-w-[320px] rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary shadow-lg"
        >
          {node.title}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${label}?`}
          body={`This deletes the ${label}${node.children.length > 0 ? " and everything nested inside it" : ""}. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

async function createChildNode(node: SidebarTreeNode, title: string) {
  if (node.type === "workspace") return createStack(node.id, title);
  if (node.type === "stack") return createCard(node.id, node.rootId, title);
  return createSubThread(node.id, node.rootId, title);
}

const sourceLogoLabels: Record<ImportedChatRowData["source_app"], string> = {
  claude: "C",
  chatgpt: "G",
  unknown: "?",
};

function SourceLogo({
  sourceApp,
}: {
  sourceApp: ImportedChatRowData["source_app"];
}) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card text-[10px] font-semibold text-text-tertiary">
      {sourceLogoLabels[sourceApp] ?? "?"}
    </span>
  );
}

function SidebarSection({
  label,
  collapsed,
  action,
  children,
}: {
  label?: string;
  collapsed: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 px-1">
      {!collapsed && label && (
        <div className="mb-1 flex items-center justify-between px-1">
          <div className="section-label">{label}</div>
          {action}
        </div>
      )}
      {collapsed && <div className="mx-2 mb-1 h-px bg-border" />}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      title={label}
      onClick={onNavigate}
      className={[
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-bg-selected text-text-primary"
          : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
        collapsed ? "justify-center" : "",
      ].join(" ")}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function moveId(ids: string[], activeId: string, overId: string): string[] {
  const activeIndex = ids.indexOf(activeId);
  const overIndex = ids.indexOf(overId);
  if (activeIndex === -1 || overIndex === -1) return ids;
  const next = [...ids];
  const [item] = next.splice(activeIndex, 1);
  next.splice(overIndex, 0, item);
  return next;
}

function getDragStyle(
  dragState: SidebarDragState | null,
  kind: SidebarDragKind,
  id: string
): CSSProperties {
  if (!dragState || dragState.kind !== kind || !dragState.active) return {};

  if (dragState.id === id) {
    return {
      transform: `translate3d(0, ${dragState.currentY - dragState.startY}px, 0)`,
      opacity: 0.55,
      pointerEvents: "none",
      position: "relative",
      zIndex: 60,
    };
  }

  if (dragState.overId === id) {
    return {
      boxShadow: "inset 0 0 0 1px var(--accent)",
    };
  }

  return {};
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
