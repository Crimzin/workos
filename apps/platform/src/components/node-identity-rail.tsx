import type { ReactNode } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import type {
  HeaderFieldBadge,
  NodeIdentityTrailItem,
} from "@/lib/detail-header";
import type { WorkNode } from "@/lib/types";
import { EditableTitle } from "./editable-title";
import { HeaderFieldChip } from "./header-field-chip";

interface NodeIdentityActor {
  id: string;
  name: string;
  kind: string;
}

interface NodeIdentityRailProps {
  node: WorkNode;
  workspaceId: string;
  trail: NodeIdentityTrailItem[];
  badges: HeaderFieldBadge[];
  owner: NodeIdentityActor | null;
  members: NodeIdentityActor[];
  compact?: boolean;
  leadingControl?: ReactNode;
  inlineControls?: ReactNode;
  actions?: ReactNode;
  viewSwitcher?: ReactNode;
  paddingClassName?: string;
}

export function NodeIdentityRail({
  node,
  workspaceId,
  trail,
  badges,
  owner,
  members,
  compact = false,
  leadingControl,
  inlineControls,
  actions,
  viewSwitcher,
  paddingClassName = "px-6",
}: NodeIdentityRailProps) {
  return (
    <header className={`shrink-0 border-b border-border ${paddingClassName} py-1.5`}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leadingControl}
          <NodeIdentityPath
            node={node}
            workspaceId={workspaceId}
            trail={trail}
            compact={compact}
          />
          {inlineControls}

          {!compact && node.archived_at && (
            <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-bg-hover text-text-tertiary">
              Archived
            </span>
          )}

          {!compact && badges.length > 0 && (
            <div className="flex min-w-0 shrink-0 items-center gap-1">
              {badges.slice(0, 3).map((badge) => (
                <HeaderFieldChip
                  key={[
                    badge.id,
                    badge.selectedOptionIds.join(","),
                    badge.options.map((option) => `${option.id}:${option.name}`).join(","),
                  ].join("|")}
                  chip={badge}
                  nodeId={node.id}
                  parentId={node.parent_id}
                  workspaceId={workspaceId}
                />
              ))}
              {badges.length > 3 && (
                <span className="text-[11px] text-text-tertiary">
                  +{badges.length - 3}
                </span>
              )}
            </div>
          )}

          {!compact && <OwnerMembersRow owner={owner} members={members} />}
        </div>

        {(viewSwitcher || actions) && (
          <div className="flex shrink-0 items-center gap-2">
            {viewSwitcher}
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

function NodeIdentityPath({
  node,
  workspaceId,
  trail,
  compact,
}: {
  node: WorkNode;
  workspaceId: string;
  trail: NodeIdentityTrailItem[];
  compact: boolean;
}) {
  if (trail.length === 0) return null;
  const visibleTrail = compact
    ? trail.filter((item) => item.isCurrent).slice(-1)
    : trail;

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm text-text-tertiary">
      {visibleTrail.map((item, index) => (
        <span key={item.id} className="flex min-w-0 items-center gap-1">
          {index > 0 && (
            <span className="shrink-0 text-text-tertiary">/</span>
          )}
          {item.isCurrent ? (
            <EditableTitle
              nodeId={node.id}
              workspaceId={workspaceId}
              parentId={node.parent_id}
              initialTitle={node.title}
              displayClassName={[
                "min-w-0 cursor-text truncate text-sm font-semibold text-text-primary transition-colors hover:text-accent",
                compact ? "max-w-[18rem]" : "max-w-[28rem]",
              ].join(" ")}
              inputClassName={[
                "h-7 rounded bg-transparent px-1 text-sm font-semibold text-text-primary outline-none ring-1 ring-accent focus:ring-2",
                compact ? "min-w-[10rem] max-w-[18rem]" : "min-w-[12rem] max-w-[28rem]",
              ].join(" ")}
            />
          ) : (
            <Link
              href={item.href ?? "#"}
              scroll={false}
              className="max-w-[11rem] truncate transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {item.title}
            </Link>
          )}
        </span>
      ))}

      {!compact && trail.length === 1 && trail[0]?.id !== workspaceId && (
        <Link
          href={`/n/${workspaceId}?view=board`}
          scroll={false}
          className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Board
        </Link>
      )}
    </nav>
  );
}

function OwnerMembersRow({
  owner,
  members,
}: {
  owner: NodeIdentityActor | null;
  members: NodeIdentityActor[];
}) {
  const actors = [
    ...(owner ? [{ ...owner, isOwner: true }] : []),
    ...members
      .filter((member) => member.id !== owner?.id)
      .map((member) => ({ ...member, isOwner: false })),
  ];

  if (actors.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {actors.slice(0, 3).map((actor) => (
        <ActorChip
          key={actor.id}
          name={actor.name}
          kind={actor.kind}
          isOwner={actor.isOwner}
        />
      ))}
      {actors.length > 3 && (
        <span className="text-[11px] text-text-tertiary">+{actors.length - 3}</span>
      )}
    </div>
  );
}

function ActorChip({
  name,
  kind,
  isOwner,
}: {
  name: string;
  kind: string;
  isOwner: boolean;
}) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      title={`${name}${isOwner ? " (owner)" : ""}`}
      className={[
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold",
        kind === "agent"
          ? "ring-2 ring-agent-accent bg-bg-hover text-text-secondary"
          : "bg-bg-hover text-text-secondary",
      ].join(" ")}
    >
      {initials || <User size={10} />}
    </div>
  );
}
