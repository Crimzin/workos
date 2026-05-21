import type { ReactNode } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import type { DetailField, DetailFieldValue } from "@/lib/node-detail";
import type { NodePathItem } from "@/lib/node-path";
import type { WorkNode } from "@/lib/types";
import { EditableTitle } from "../editable-title";
import { FieldBadge } from "../field-badge";

type ThreadActor = {
  id: string;
  name: string;
  kind: string;
};

export interface ThreadHeaderProps {
  node: WorkNode;
  path: NodePathItem[];
  fields: DetailField[];
  values: DetailFieldValue[];
  owner: ThreadActor | null;
  members: ThreadActor[];
  workspaceId: string;
  actions?: ReactNode;
  viewSwitcher?: ReactNode;
}

export function ThreadHeader({
  node,
  path,
  fields,
  values,
  owner,
  members,
  workspaceId,
  actions,
  viewSwitcher,
}: ThreadHeaderProps) {
  const headerBadges = getHeaderBadges(fields, values);

  return (
    <header className="shrink-0 border-b border-border px-6 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <ThreadPath path={path} workspaceId={workspaceId} />

          {node.archived_at && (
            <span className="mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-bg-hover text-text-tertiary">
              Archived
            </span>
          )}

          <div className="mt-1">
            <EditableTitle
              nodeId={node.id}
              workspaceId={workspaceId}
              parentId={node.parent_id}
              initialTitle={node.title}
            />
          </div>

          {headerBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {headerBadges.map((badge) => (
                <FieldBadge key={badge.id} name={badge.name} color={badge.color} />
              ))}
            </div>
          )}

          <OwnerMembersRow owner={owner} members={members} />
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

function ThreadPath({
  path,
  workspaceId,
}: {
  path: NodePathItem[];
  workspaceId: string;
}) {
  if (path.length === 0) return null;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-text-tertiary">
      {path.map((item, index) => {
        const isLast = index === path.length - 1;

        return (
          <span key={item.id} className="flex min-w-0 items-center gap-1">
            {index > 0 && <span className="text-text-tertiary">/</span>}
            {isLast ? (
              <span className="max-w-[180px] truncate font-medium text-text-secondary">
                {item.title}
              </span>
            ) : (
              <Link
                href={`/n/${item.id}`}
                scroll={false}
                className="max-w-[180px] truncate transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {item.title}
              </Link>
            )}
          </span>
        );
      })}

      {path.length === 1 && (
        <Link
          href={`/n/${workspaceId}?view=board`}
          scroll={false}
          className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
  owner: ThreadActor | null;
  members: ThreadActor[];
}) {
  const actors = [
    ...(owner ? [{ ...owner, isOwner: true }] : []),
    ...members
      .filter((member) => member.id !== owner?.id)
      .map((member) => ({ ...member, isOwner: false })),
  ];

  if (actors.length === 0) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {actors.map((actor) => (
        <ActorChip
          key={actor.id}
          name={actor.name}
          kind={actor.kind}
          isOwner={actor.isOwner}
        />
      ))}
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
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
        kind === "agent"
          ? "ring-2 ring-agent-accent bg-bg-hover text-text-secondary"
          : "bg-bg-hover text-text-secondary",
      ].join(" ")}
    >
      {initials || <User size={10} />}
    </div>
  );
}

function getHeaderBadges(
  fields: DetailField[],
  values: DetailFieldValue[]
): { id: string; name: string; color: string }[] {
  const valuesByField = new Map<string, DetailFieldValue[]>();
  for (const value of values) {
    const fieldValues = valuesByField.get(value.field_id) ?? [];
    fieldValues.push(value);
    valuesByField.set(value.field_id, fieldValues);
  }

  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    const fieldValues = valuesByField.get(field.id) ?? [];
    for (const value of fieldValues) {
      if (!value.option_id) continue;
      const option = field.options.find((candidate) => candidate.id === value.option_id);
      if (option) {
        badges.push({
          id: `${field.id}:${option.id}`,
          name: option.name,
          color: field.color,
        });
      }
    }
  }

  return badges;
}
