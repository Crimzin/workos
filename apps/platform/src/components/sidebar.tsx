"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronLeft,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Rss,
  Search,
  Settings,
} from "lucide-react";
import type { WorkNode } from "@/lib/types";
import { createWorkspace, updateNodeTitle } from "@/lib/actions/nodes";
import { ThemeToggle } from "./theme-toggle";
import { InlineCreate } from "./inline-create";

interface SidebarProps {
  personal: WorkNode | null;
  workspaces: WorkNode[];
}

const COLLAPSED_KEY = "workos-sidebar-collapsed";

export function Sidebar({ personal, workspaces }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeView = searchParams.get("view");

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      setCollapsed(stored === "1");
      setHydrated(true);
    });

    return () => cancelAnimationFrame(frameId);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  };

  return (
    <aside
      className={[
        "shrink-0 bg-bg-secondary border-r border-border flex flex-col",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-64",
        hydrated ? "" : "invisible",
      ].join(" ")}
    >
      {/* Logo + collapse toggle */}
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
          onClick={toggle}
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

      {/* Search (placeholder) */}
      <div className="px-2">
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
      </div>

      {/* Personal workspace */}
      {personal && (
        <SidebarSection label="Personal" collapsed={collapsed}>
          <WorkspaceRow
            node={personal}
            collapsed={collapsed}
            pathname={pathname}
            activeView={activeView}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            router={router}
          />
        </SidebarSection>
      )}

      {/* Workspaces */}
      <SidebarSection
        label="Threads"
        collapsed={collapsed}
        action={
          !collapsed && !creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              title="New thread"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
            >
              <Plus size={13} />
            </button>
          ) : null
        }
      >
        {workspaces.length === 0 && !collapsed && !creating && (
          <div className="px-2 py-1 text-xs text-text-tertiary">
            No threads yet.
          </div>
        )}
        {workspaces.map((w) => (
          <WorkspaceRow
            key={w.id}
            node={w}
            collapsed={collapsed}
            pathname={pathname}
            activeView={activeView}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            router={router}
          />
        ))}
        {!collapsed && creating && (
          <div className="px-2 py-1">
            <InlineCreate
              label="New thread"
              placeholder="Thread name"
              onSubmit={async (title) => {
                // Root threads are still stored as workspace-type nodes for compatibility.
                const res = await createWorkspace(title);
                setCreating(false);
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
        <Link
          href="/settings/ai-standards"
          title="AI Standards"
          className={[
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            pathname === "/settings/ai-standards"
              ? "bg-bg-selected text-text-primary"
              : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <Settings size={15} strokeWidth={2} />
          {!collapsed && <span>AI Standards</span>}
        </Link>
      </div>

      {/* Footer: theme toggle */}
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

// ---------------------------------------------------------------------------
// WorkspaceRow — workspace item + Board/Feed sub-items + rename + QUAM
// ---------------------------------------------------------------------------

function WorkspaceRow({
  node,
  collapsed,
  pathname,
  activeView,
  renamingId,
  setRenamingId,
  router,
}: {
  node: WorkNode;
  collapsed: boolean;
  pathname: string;
  activeView: string | null;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const isRenaming = renamingId === node.id;
  const isOnBoard = pathname === `/n/${node.id}` && activeView === "board";
  const isOnThread = pathname === `/n/${node.id}` && activeView !== "board";
  const isOnFeed = pathname === `/n/${node.id}/feed`;
  const isAnyActive = isOnThread || isOnBoard || isOnFeed;

  const initial = node.title.charAt(0).toUpperCase();

  // When collapsed: single clickable row; active when on any sub-page.
  if (collapsed) {
    return (
      <Link
        href={`/n/${node.id}`}
        title={node.title}
        className={[
          "flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isAnyActive
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
    <div>
      {/* Workspace name row */}
      <WorkspaceNameRow
        node={node}
        initial={initial}
        isRenaming={isRenaming}
        setRenamingId={setRenamingId}
        router={router}
      />

      {/* Sub-items */}
      <div className="ml-5 mt-0.5 mb-0.5 flex flex-col">
        <SubItem
          icon={<LayoutGrid size={13} />}
          label="Board"
          href={`/n/${node.id}?view=board`}
          active={isOnBoard}
        />
        <SubItem
          icon={<Rss size={13} />}
          label="Feed"
          href={`/n/${node.id}/feed`}
          active={isOnFeed}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceNameRow — the header row with rename + QUAM
// ---------------------------------------------------------------------------

function WorkspaceNameRow({
  node,
  initial,
  isRenaming,
  setRenamingId,
  router,
}: {
  node: WorkNode;
  initial: string;
  isRenaming: boolean;
  setRenamingId: (id: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [title, setTitle] = useState(node.title);
  const [quamOpen, setQuamOpen] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const quamRef = useRef<HTMLDivElement>(null);

  // Focus input when rename starts.
  useEffect(() => {
    if (isRenaming) {
      const frameId = requestAnimationFrame(() => inputRef.current?.select());
      return () => cancelAnimationFrame(frameId);
    }
  }, [isRenaming, node.title]);

  // Close QUAM on outside click.
  useEffect(() => {
    if (!quamOpen) return;
    const handler = (e: MouseEvent) => {
      if (quamRef.current && !quamRef.current.contains(e.target as Node)) {
        setQuamOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [quamOpen]);

  const commitRename = () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === node.title) {
      setRenamingId(null);
      return;
    }
    startTransition(async () => {
      await updateNodeTitle(node.id, trimmed, node.id, null);
      setRenamingId(null);
      router.refresh();
    });
  };

  const startRename = () => {
    setTitle(node.title);
    setRenamingId(node.id);
  };

  return (
    <div className="group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors">
      {/* Initial icon — always links to board */}
      <Link
        href={`/n/${node.id}`}
        tabIndex={-1}
        className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold bg-bg-card border border-border text-text-secondary"
        onClick={(e) => isRenaming && e.preventDefault()}
      >
        {initial}
      </Link>

      {/* Title or rename input */}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitRename(); }
            if (e.key === "Escape") { setRenamingId(null); }
          }}
          className="flex-1 min-w-0 rounded bg-bg-card border border-accent px-1 py-0 text-sm text-text-primary outline-none"
        />
      ) : (
        <Link
          href={`/n/${node.id}`}
          className="flex-1 min-w-0 truncate font-medium"
        >
          {node.title}
        </Link>
      )}

      {/* Hover actions (hidden when renaming) */}
      {!isRenaming && (
        <div className="opacity-0 group-hover:opacity-100 flex shrink-0 items-center gap-0.5 transition-opacity">
          {/* Rename shortcut */}
          <button
            type="button"
            title="Rename"
            onClick={startRename}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <Pencil size={11} />
          </button>

          {/* QUAM trigger */}
          <div className="relative" ref={quamRef}>
            <button
              type="button"
              title="More options"
              onClick={() => setQuamOpen((v) => !v)}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <MoreHorizontal size={11} />
            </button>

            {quamOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-md border border-border bg-bg-primary shadow-lg py-1">
                <button
                  type="button"
                  onClick={() => {
                    setQuamOpen(false);
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

// ---------------------------------------------------------------------------
// SidebarSection
// ---------------------------------------------------------------------------

function SidebarSection({
  label,
  collapsed,
  action,
  children,
}: {
  label: string;
  collapsed: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 px-2">
      {!collapsed && (
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

// ---------------------------------------------------------------------------
// SubItem
// ---------------------------------------------------------------------------

function SubItem({
  icon,
  label,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  active?: boolean;
}) {
  const className = [
    "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
    active
      ? "bg-bg-selected text-text-primary"
      : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
  ].join(" ");

  if (href) {
    return (
      <Link href={href} className={className}>
        <span>{icon}</span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      title={`${label} (coming soon)`}
      className={className}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
