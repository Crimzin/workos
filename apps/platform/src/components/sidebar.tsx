"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Rss,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import type { SidebarTreeNode } from "@/lib/sidebar-tree";
import {
  createCard,
  createStack,
  createSubThread,
  createWorkspace,
  archiveNode,
  deleteNode,
  moveSidebarNode,
  pinNode,
  reorderPinnedNode,
  unpinNode,
  updateNodeTitle,
} from "@/lib/actions/nodes";
import {
  flattenSidebarTree,
  getPinnedNodes,
  getSidebarDropPlan,
  type FlatSidebarTreeNode,
  type PinnedSidebarNode,
} from "@/lib/sidebar-tree-dnd";
import { ThemeToggle } from "./theme-toggle";
import { InlineCreate } from "./inline-create";
import { ConfirmModal } from "./confirm-modal";

interface SidebarProps {
  projectTree: SidebarTreeNode[];
  pinnedNodes: PinnedSidebarNode[];
}

const COLLAPSED_KEY = "workos-sidebar-collapsed";
const EXPANDED_KEY = "workos-sidebar-expanded-nodes";
const WIDTH_KEY = "workos-sidebar-width";
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const COLLAPSED_WIDTH = 56;

export function Sidebar({ projectTree, pinnedNodes }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [width, setWidth] = useState(288);
  const [resizing, setResizing] = useState(false);
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [creatingChildOf, setCreatingChildOf] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(projectTree.map((node) => node.id))
  );
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const visibleExpandedIds = expandedIds;
  const flatRows = useMemo(
    () => flattenSidebarTree(projectTree, visibleExpandedIds),
    [projectTree, visibleExpandedIds]
  );
  const visibleProjectRows = useMemo(
    () => collapsed ? flatRows.filter((row) => row.depth === 0) : flatRows,
    [collapsed, flatRows]
  );
  const sortedPins = useMemo(() => getPinnedNodes(pinnedNodes), [pinnedNodes]);
  const pinnedIds = useMemo(
    () => new Set(sortedPins.map((pin) => pin.node.id)),
    [sortedPins]
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    setDragStartX(event.activatorEvent instanceof MouseEvent ? event.activatorEvent.clientX : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setDragStartX(null);
    if (!overId || activeId === overId) return;

    if (activeId.startsWith("pin:") && overId.startsWith("pin:")) {
      const pinId = activeId.slice(4);
      const overPinId = overId.slice(4);
      const reorderedIds = moveId(
        sortedPins.map((pin) => pin.node.id),
        pinId,
        overPinId
      );
      const index = reorderedIds.indexOf(pinId);
      startTransition(async () => {
        await reorderPinnedNode(
          pinId,
          reorderedIds[index - 1] ?? null,
          reorderedIds[index + 1] ?? null
        );
        router.refresh();
      });
      return;
    }

    if (activeId.startsWith("node:") && overId.startsWith("node:")) {
      const nodeId = activeId.slice(5);
      const overNodeId = overId.slice(5);
      const indentationDelta = dragStartX === null
        ? 0
        : Math.round(event.delta.x / 28);
      const plan = getSidebarDropPlan({
        activeId: nodeId,
        overId: overNodeId,
        flattened: flatRows,
        indentationDelta,
      });
      if (!plan) return;

      startTransition(async () => {
        await moveSidebarNode(nodeId, plan.parentId, plan.previousId, plan.nextId);
        if (plan.parentId) setExpanded(plan.parentId, true);
        router.refresh();
      });
    }
  };

  return (
    <aside
      className={[
        "relative shrink-0 bg-bg-secondary border-r border-border flex flex-col",
        resizing ? "" : "transition-[width] duration-200 ease-out",
        hydrated ? "" : "invisible",
      ].join(" ")}
      style={{ width: collapsed ? COLLAPSED_WIDTH : width }}
    >
      <div className="flex h-12 items-center justify-between px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-sm bg-accent" />
            <span className="text-sm font-semibold tracking-tight text-text-primary">
              WorkOS
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <ChevronLeft
            size={14}
            className={collapsed ? "rotate-180" : ""}
            strokeWidth={2.2}
          />
        </button>
      </div>

      <SidebarSection collapsed={collapsed}>
        <NavLink
          href="/feed"
          label="Feed"
          icon={<Rss size={15} />}
          active={pathname === "/feed"}
          collapsed={collapsed}
        />
        <button
          type="button"
          disabled
          title="Search (coming soon)"
          className={[
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
            "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <Search size={15} strokeWidth={2} />
          {!collapsed && <span>Search</span>}
        </button>
      </SidebarSection>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sortedPins.length > 0 && (
            <SidebarSection label="Pinned" collapsed={collapsed}>
              <SortableContext
                items={sortedPins.map((pin) => `pin:${pin.node.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {sortedPins.map((pin) => (
                  <PinnedNodeRow
                    key={pin.node.id}
                    node={pin.node}
                    collapsed={collapsed}
                    isActive={pathname === `/n/${pin.node.id}`}
                    router={router}
                  />
                ))}
              </SortableContext>
            </SidebarSection>
          )}

          <SidebarSection
            label="Projects"
            collapsed={collapsed}
            action={
              !collapsed && !creatingRoot ? (
                <button
                  type="button"
                  onClick={() => setCreatingRoot(true)}
                  title="New project"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
                >
                  <Plus size={13} />
                </button>
              ) : null
            }
          >
            <SortableContext
              items={visibleProjectRows.map((row) => `node:${row.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {projectTree.length === 0 && !collapsed && !creatingRoot && (
                <div className="px-1 py-1 text-xs text-text-tertiary">
                  No projects yet.
                </div>
              )}

              {visibleProjectRows.map((node) => (
                <div key={node.id}>
                  <ProjectTreeNodeRow
                    node={node}
                    collapsed={collapsed}
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
                    isPinned={pinnedIds.has(node.id)}
                  />

                  {!collapsed && creatingChildOf === node.id && (
                    <div className="py-1" style={{ paddingLeft: 18 + (node.depth + 1) * 12 }}>
                      <InlineCreate
                        label="New chat"
                        placeholder="New chat"
                        onSubmit={async (title) => createChildNode(node, title)}
                        onCreated={(id) => {
                          setCreatingChildOf(null);
                          setExpanded(node.id, true);
                          router.push(`/n/${id}`);
                          router.refresh();
                        }}
                        onCancel={() => setCreatingChildOf(null)}
                        initialExpanded
                        inputClassName="w-full rounded-md border border-border-strong bg-bg-card px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  )}
                </div>
              ))}
            </SortableContext>

          {!collapsed && creatingRoot && (
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
                  router.push(`/n/${id}`);
                  router.refresh();
                }}
                onCancel={() => setCreatingRoot(false)}
                initialExpanded
                inputClassName="w-full rounded-md border border-border-strong bg-bg-card px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
          </SidebarSection>
        </div>
      </DndContext>

      <div className="border-t border-border px-2 py-2">
        <NavLink
          href="/settings/ai-standards"
          label="AI Standards"
          icon={<Settings size={15} />}
          active={pathname === "/settings/ai-standards"}
          collapsed={collapsed}
        />
      </div>

      <div
        className={[
          "border-t border-border px-2 py-2 flex items-center",
          collapsed ? "justify-center" : "justify-end",
        ].join(" ")}
      >
        <ThemeToggle />
      </div>
      {!collapsed && (
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

function PinnedNodeRow({
  node,
  collapsed,
  isActive,
  router,
}: {
  node: SidebarTreeNode;
  collapsed: boolean;
  isActive: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [, startTransition] = useTransition();
  const initial = node.title.charAt(0).toUpperCase();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `pin:${node.id}` });
  const sortableStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };
  const tooltipId = `sidebar-pin-tooltip-${node.id}`;

  const handleUnpin = () => {
    startTransition(async () => {
      await unpinNode(node.id);
      router.refresh();
    });
  };

  if (collapsed) {
    return (
      <Link
        ref={setNodeRef}
        href={`/n/${node.id}`}
        title={node.title}
        style={sortableStyle}
        className={[
          "flex items-center justify-center rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-bg-selected text-text-primary"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        ].join(" ")}
      >
        <Pin size={14} />
      </Link>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      className={[
        "group relative flex cursor-grab items-center gap-1 rounded-md px-1 py-1.5 text-sm transition-colors active:cursor-grabbing",
        isActive
          ? "bg-bg-selected text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
      ].join(" ")}
      {...attributes}
      aria-describedby={tooltipId}
      {...listeners}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold bg-bg-card border border-border text-text-secondary">
        {initial}
      </span>
      <Link href={`/n/${node.id}`} className="min-w-0 flex-1 truncate font-medium">
        {node.title}
      </Link>
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
      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-6 top-full z-50 mt-1 max-w-[320px] rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary opacity-0 shadow-lg transition-opacity delay-500 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {node.title}
      </div>
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
  isPinned,
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
  isPinned: boolean;
}) {
  const [title, setTitle] = useState(node.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = node.title.charAt(0).toUpperCase();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `node:${node.id}` });
  const tooltipId = `sidebar-tooltip-${node.id}`;
  const sortableStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };

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
      if (isActive) router.push(closeHref);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    setMenuOpen(false);
    startTransition(async () => {
      await deleteNode(node.id, node.rootId, node.parent_id);
      if (isActive) router.push(closeHref);
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

  if (collapsed) {
    return (
      <Link
        ref={setNodeRef}
        href={`/n/${node.id}`}
        title={node.title}
        style={sortableStyle}
        className={[
          "flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-bg-selected text-text-primary"
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
      ref={setNodeRef}
      className={[
        "group relative flex cursor-grab items-center gap-0.5 rounded-md py-1.5 pr-0.5 text-sm transition-colors active:cursor-grabbing",
        isActive
          ? "bg-bg-selected text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
      ].join(" ")}
      style={{ ...sortableStyle, paddingLeft: 2 + node.depth * 12 }}
      {...attributes}
      aria-describedby={tooltipId}
      {...listeners}
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
        <Link
          href={`/n/${node.id}`}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            startRename();
          }}
          className="min-w-0 flex-1 truncate font-medium"
        >
          {node.title}
        </Link>
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

      {!isRenaming && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-6 top-full z-50 mt-1 max-w-[320px] rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary opacity-0 shadow-lg transition-opacity delay-500 group-hover:opacity-100 group-focus-within:opacity-100"
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
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
