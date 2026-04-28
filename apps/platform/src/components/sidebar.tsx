"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  LayoutGrid,
  Plus,
  Rss,
  Search,
} from "lucide-react";
import type { WorkNode } from "@/lib/types";
import { createWorkspace } from "@/lib/actions/nodes";
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
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    setCollapsed(stored === "1");
    setHydrated(true);
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
          <SidebarWorkspaceItem
            node={personal}
            collapsed={collapsed}
            active={pathname === `/n/${personal.id}`}
          />
          {!collapsed && (
            <div className="ml-5 mt-0.5 flex flex-col">
              <SubItem
                icon={<Rss size={13} />}
                label="Feed"
                href={`/n/${personal.id}/feed`}
                active={pathname === `/n/${personal.id}/feed`}
              />
              <SubItem
                icon={<LayoutGrid size={13} />}
                label="Board"
                href={`/n/${personal.id}`}
                active={pathname === `/n/${personal.id}`}
              />
              <SubItem icon={<Calendar size={13} />} label="Reminders" />
            </div>
          )}
        </SidebarSection>
      )}

      {/* Workspaces */}
      <SidebarSection
        label="Workspaces"
        collapsed={collapsed}
        action={
          !collapsed && !creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              title="New workspace"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
            >
              <Plus size={13} />
            </button>
          ) : null
        }
      >
        {workspaces.length === 0 && !collapsed && !creating && (
          <div className="px-2 py-1 text-xs text-text-tertiary">
            No workspaces yet.
          </div>
        )}
        {workspaces.map((w) => (
          <div key={w.id}>
            <SidebarWorkspaceItem
              node={w}
              collapsed={collapsed}
              active={pathname === `/n/${w.id}`}
            />
            {!collapsed && (
              <div className="ml-5 mt-0.5 mb-0.5 flex flex-col">
                <SubItem
                  icon={<Rss size={13} />}
                  label="Feed"
                  href={`/n/${w.id}/feed`}
                  active={pathname === `/n/${w.id}/feed`}
                />
              </div>
            )}
          </div>
        ))}
        {!collapsed && creating && (
          <div className="px-2 py-1">
            <InlineCreate
              label="New workspace"
              placeholder="Workspace name"
              onSubmit={async (title) => {
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

function SidebarWorkspaceItem({
  node,
  collapsed,
  active,
}: {
  node: WorkNode;
  collapsed: boolean;
  active: boolean;
}) {
  const initial = node.title.charAt(0).toUpperCase();
  return (
    <Link
      href={`/n/${node.id}`}
      title={collapsed ? node.title : undefined}
      className={[
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-bg-selected text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        collapsed ? "justify-center" : "",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold",
          "bg-bg-card border border-border text-text-secondary",
        ].join(" ")}
      >
        {initial}
      </span>
      {!collapsed && <span className="truncate">{node.title}</span>}
    </Link>
  );
}

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
