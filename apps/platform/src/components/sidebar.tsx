"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Rss,
  Search,
  Settings,
} from "lucide-react";
import type { SidebarTreeNode } from "@/lib/sidebar-tree";
import {
  createCard,
  createStack,
  createSubThread,
  createWorkspace,
  updateNodeTitle,
} from "@/lib/actions/nodes";
import { ThemeToggle } from "./theme-toggle";
import { InlineCreate } from "./inline-create";

interface SidebarProps {
  projectTree: SidebarTreeNode[];
}

const COLLAPSED_KEY = "workos-sidebar-collapsed";
const EXPANDED_KEY = "workos-sidebar-expanded-nodes";

export function Sidebar({ projectTree }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [creatingChildOf, setCreatingChildOf] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(projectTree.map((node) => node.id))
  );
  const pathname = usePathname();
  const router = useRouter();
  const activeNodeId = pathname.startsWith("/n/") ? pathname.split("/")[2] : null;
  const activeAncestorIds = activeNodeId
    ? findAncestorIds(projectTree, activeNodeId)
    : [];
  const visibleExpandedIds = new Set([...expandedIds, ...activeAncestorIds]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const storedCollapsed = localStorage.getItem(COLLAPSED_KEY);
      setCollapsed(storedCollapsed === "1");

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

  const setExpanded = (id: string, expanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(id);
      else next.delete(id);
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <aside
      className={[
        "shrink-0 bg-bg-secondary border-r border-border flex flex-col",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-72",
        hydrated ? "" : "invisible",
      ].join(" ")}
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
        {projectTree.length === 0 && !collapsed && !creatingRoot && (
          <div className="px-2 py-1 text-xs text-text-tertiary">
            No projects yet.
          </div>
        )}

        {projectTree.map((node) => (
          <ProjectTreeRow
            key={node.id}
            node={node}
            collapsed={collapsed}
            pathname={pathname}
            expandedIds={visibleExpandedIds}
            setExpanded={setExpanded}
            creatingChildOf={creatingChildOf}
            setCreatingChildOf={setCreatingChildOf}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            router={router}
          />
        ))}

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
              inputClassName="w-full rounded-md border border-border-strong bg-bg-card px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        )}
      </SidebarSection>

      <div className="flex-1" />

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
    </aside>
  );
}

function ProjectTreeRow({
  node,
  collapsed,
  pathname,
  expandedIds,
  setExpanded,
  creatingChildOf,
  setCreatingChildOf,
  renamingId,
  setRenamingId,
  router,
}: {
  node: SidebarTreeNode;
  collapsed: boolean;
  pathname: string;
  expandedIds: Set<string>;
  setExpanded: (id: string, expanded: boolean) => void;
  creatingChildOf: string | null;
  setCreatingChildOf: (id: string | null) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isActive = pathname === `/n/${node.id}`;
  const hasChildren = node.children.length > 0;
  const isCreatingChild = creatingChildOf === node.id;

  if (collapsed && node.depth > 0) return null;

  return (
    <div>
      <ProjectTreeNodeRow
        node={node}
        collapsed={collapsed}
        isActive={isActive}
        isExpanded={isExpanded}
        hasChildren={hasChildren}
        isRenaming={renamingId === node.id}
        setRenamingId={setRenamingId}
        onToggle={() => setExpanded(node.id, !isExpanded)}
        onCreateChild={() => {
          setExpanded(node.id, true);
          setCreatingChildOf(node.id);
        }}
        router={router}
      />

      {!collapsed && isCreatingChild && (
        <div className="py-1" style={{ paddingLeft: 18 + (node.depth + 1) * 14 }}>
          <InlineCreate
            label="New child"
            placeholder="Name"
            onSubmit={async (title) => createChildNode(node, title)}
            onCreated={(id) => {
              setCreatingChildOf(null);
              setExpanded(node.id, true);
              router.push(`/n/${id}`);
              router.refresh();
            }}
            inputClassName="w-full rounded-md border border-border-strong bg-bg-card px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}

      {!collapsed && isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <ProjectTreeRow
              key={child.id}
              node={child}
              collapsed={collapsed}
              pathname={pathname}
              expandedIds={expandedIds}
              setExpanded={setExpanded}
              creatingChildOf={creatingChildOf}
              setCreatingChildOf={setCreatingChildOf}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              router={router}
            />
          ))}
        </div>
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
}: {
  node: SidebarTreeNode;
  collapsed: boolean;
  isActive: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  isRenaming: boolean;
  setRenamingId: (id: string | null) => void;
  onToggle: () => void;
  onCreateChild: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [title, setTitle] = useState(node.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = node.title.charAt(0).toUpperCase();

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

  if (collapsed) {
    return (
      <Link
        href={`/n/${node.id}`}
        title={node.title}
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
      className={[
        "group relative flex items-center gap-1 rounded-md py-1.5 pr-1 text-sm transition-colors",
        isActive
          ? "bg-bg-selected text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
      ].join(" ")}
      style={{ paddingLeft: 6 + node.depth * 14 }}
    >
      <button
        type="button"
        onClick={hasChildren ? onToggle : undefined}
        disabled={!hasChildren}
        aria-label={isExpanded ? `Collapse ${node.title}` : `Expand ${node.title}`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-tertiary transition-colors enabled:hover:bg-bg-hover enabled:hover:text-text-primary disabled:opacity-40"
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
        <Link href={`/n/${node.id}`} className="min-w-0 flex-1 truncate font-medium">
          {node.title}
        </Link>
      )}

      {!isRenaming && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            title={`Add inside ${node.title}`}
            onClick={onCreateChild}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <Plus size={11} />
          </button>
          <button
            type="button"
            title="Rename"
            onClick={startRename}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <Pencil size={11} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              title="More options"
              onClick={() => setMenuOpen((value) => !value)}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <MoreHorizontal size={11} />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-md border border-border bg-bg-primary py-1 shadow-lg">
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
              </div>
            )}
          </div>
        </div>
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
    <div className="mt-4 px-2">
      {!collapsed && label && (
        <div className="mb-1 flex items-center justify-between px-2">
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

function findAncestorIds(
  nodes: SidebarTreeNode[],
  targetId: string
): string[] {
  for (const node of nodes) {
    if (node.id === targetId) return [];
    const childPath = findAncestorIds(node.children, targetId);
    if (childPath.length > 0 || node.children.some((child) => child.id === targetId)) {
      return [node.id, ...childPath];
    }
  }
  return [];
}
