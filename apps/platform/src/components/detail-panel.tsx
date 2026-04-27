import Link from "next/link";
import { X, User } from "lucide-react";
import { getNodeDetail } from "@/lib/node-detail";
import type { DetailField, DetailFieldValue, NodeAncestor } from "@/lib/node-detail";
import type { WorkNode } from "@/lib/types";
import { FieldBadge } from "./field-badge";
import { FieldRowEditor } from "./field-row-editor";
import { AddFieldButton } from "./add-field-button";
import { EditableTitle } from "./editable-title";
import { DetailPanelTabs } from "./detail-panel-tabs";
import { AddCardFromPanel } from "./add-card-from-panel";
import { NodeActions } from "./node-actions";

interface DetailPanelProps {
  nodeId: string;
  workspaceId: string;
  closeHref: string;
}

export async function DetailPanel({
  nodeId,
  workspaceId,
  closeHref,
}: DetailPanelProps) {
  const detail = await getNodeDetail(nodeId);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-bg-primary">
      {detail ? (
        <DetailBody detail={detail} workspaceId={workspaceId} closeHref={closeHref} />
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-end border-b border-border px-4 py-3">
            <CloseButton href={closeHref} />
          </div>
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-text-secondary">
            Node not found.
          </div>
        </>
      )}
    </aside>
  );
}

function DetailBody({
  detail,
  workspaceId,
  closeHref,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getNodeDetail>>>;
  workspaceId: string;
  closeHref: string;
}) {
  const { node, owner, members, ancestors, fields, values, children, childFieldValues } = detail;

  // Header field badges: select-type fields that have a value set
  const valuesByField = new Map<string, DetailFieldValue[]>();
  for (const v of values) {
    const arr = valuesByField.get(v.field_id) ?? [];
    arr.push(v);
    valuesByField.set(v.field_id, arr);
  }

  const headerBadges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    const vals = valuesByField.get(field.id) ?? [];
    for (const v of vals) {
      if (!v.option_id) continue;
      const opt = field.options.find((o) => o.id === v.option_id);
      if (opt) headerBadges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }

  const fieldsContent = (
    <FieldsTabContent
      node={node}
      owner={owner}
      fields={fields}
      values={values}
      workspaceId={workspaceId}
    />
  );

  const cardsContent =
    node.type === "stack" ? (
      <CardsTabContent
        stackId={node.id}
        cards={children}
        fields={fields}
        childFieldValues={childFieldValues}
        workspaceId={workspaceId}
      />
    ) : null;

  return (
    <>
      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {/* Breadcrumb */}
            <Breadcrumb ancestors={ancestors} workspaceId={workspaceId} />

            {/* Archived badge */}
            {node.archived_at && (
              <span className="mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-bg-hover text-text-tertiary">
                Archived
              </span>
            )}

            {/* Editable title */}
            <div className="mt-1">
              <EditableTitle
                nodeId={node.id}
                workspaceId={workspaceId}
                parentId={node.parent_id}
                initialTitle={node.title}
              />
            </div>

            {/* Field badges */}
            {headerBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {headerBadges.map((b) => (
                  <FieldBadge key={b.id} name={b.name} color={b.color} />
                ))}
              </div>
            )}

            {/* Owner + members */}
            <OwnerMembersRow owner={owner} members={members} />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <NodeActions
              nodeId={node.id}
              workspaceId={workspaceId}
              parentId={node.parent_id}
              nodeType={node.type as "card" | "stack"}
              isArchived={!!node.archived_at}
              closeHref={closeHref}
            />
            <CloseButton href={closeHref} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <DetailPanelTabs
        nodeType={node.type}
        fieldsContent={fieldsContent}
        cardsContent={cardsContent}
      />
    </>
  );
}

function Breadcrumb({
  ancestors,
  workspaceId,
}: {
  ancestors: NodeAncestor[];
  workspaceId: string;
}) {
  if (ancestors.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-text-tertiary">
      {ancestors.map((a, i) => {
        const isLast = i === ancestors.length - 1;
        // Workspace links go to the board; stacks open in the panel
        const href =
          a.type === "workspace"
            ? `/n/${workspaceId}`
            : `/n/${workspaceId}?d=${a.id}`;
        return (
          <span key={a.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-tertiary">/</span>}
            <Link
              href={href}
              scroll={false}
              className={[
                "truncate max-w-[120px] hover:text-text-secondary transition-colors",
                isLast ? "font-medium" : "",
              ].join(" ")}
            >
              {a.title}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}

function OwnerMembersRow({
  owner,
  members,
}: {
  owner: { id: string; name: string; kind: string } | null;
  members: { id: string; name: string; kind: string }[];
}) {
  const all = [
    ...(owner ? [{ ...owner, isOwner: true }] : []),
    ...members.filter((m) => m.id !== owner?.id).map((m) => ({ ...m, isOwner: false })),
  ];

  if (all.length === 0) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {all.map((a) => (
        <ActorChip key={a.id} name={a.name} kind={a.kind} isOwner={a.isOwner} />
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
    .map((w) => w[0])
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

function CloseButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label="Close panel"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
    >
      <X size={14} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Fields tab
// ---------------------------------------------------------------------------

function FieldsTabContent({
  node,
  owner,
  fields,
  values,
  workspaceId,
}: {
  node: WorkNode;
  owner: { name: string } | null;
  fields: DetailField[];
  values: DetailFieldValue[];
  workspaceId: string;
}) {
  const valuesByField = new Map<string, DetailFieldValue[]>();
  for (const v of values) {
    const arr = valuesByField.get(v.field_id) ?? [];
    arr.push(v);
    valuesByField.set(v.field_id, arr);
  }

  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between">
        <div className="section-label">Fields</div>
        <AddFieldButton workspaceId={workspaceId} />
      </div>
      <dl className="mt-2 divide-y divide-border rounded-md border border-border bg-bg-card">
        <SystemRow label="Owner" value={owner?.name ?? "—"} />
        <SystemRow label="Type" value={node.type} />
        <SystemRow label="Created" value={formatDate(node.created_at)} />
        <SystemRow label="Updated" value={formatDate(node.updated_at)} />
        {fields.length === 0 && (
          <div className="px-3 py-3 text-xs text-text-tertiary">
            No custom fields yet.
          </div>
        )}
        {fields.map((field) => (
          <FieldRowEditor
            key={field.id}
            field={field}
            values={valuesByField.get(field.id) ?? []}
            nodeId={node.id}
            parentId={node.parent_id}
            workspaceId={workspaceId}
          />
        ))}
      </dl>
    </div>
  );
}

function SystemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards tab (stacks only)
// ---------------------------------------------------------------------------

function CardsTabContent({
  stackId,
  cards,
  fields,
  childFieldValues,
  workspaceId,
}: {
  stackId: string;
  cards: WorkNode[];
  fields: DetailField[];
  childFieldValues: Record<string, DetailFieldValue[]>;
  workspaceId: string;
}) {
  return (
    <div className="px-5 py-4">
      {cards.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">No cards yet.</p>
      ) : (
      <ul className="mb-3 divide-y divide-border rounded-md border border-border bg-bg-card">
        {cards.map((card) => {
          const cardValues = childFieldValues[card.id] ?? [];
          const badges = getCardBadges(card, cardValues, fields);
          return (
            <li key={card.id} className="group flex items-stretch">
              <Link
                href={`/n/${workspaceId}?d=${card.id}`}
                scroll={false}
                className={[
                  "flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-bg-hover",
                  card.archived_at ? "opacity-50" : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-1">
                  {card.archived_at && (
                    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-bg-hover text-text-tertiary">
                      Archived
                    </span>
                  )}
                  <span className="text-sm font-medium text-text-primary line-clamp-1">
                    {card.title}
                  </span>
                </div>
                {card.description && (
                  <span className="text-xs text-text-secondary line-clamp-1">
                    {card.description}
                  </span>
                )}
                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {badges.map((b) => (
                      <FieldBadge key={b.id} name={b.name} color={b.color} />
                    ))}
                  </div>
                )}
              </Link>
              <div className="flex shrink-0 items-center px-2 opacity-0 transition-opacity group-hover:opacity-100">
                <NodeActions
                  nodeId={card.id}
                  workspaceId={workspaceId}
                  parentId={stackId}
                  nodeType="card"
                  isArchived={!!card.archived_at}
                  closeHref={`/n/${workspaceId}?d=${stackId}`}
                />
              </div>
            </li>
          );
        })}
      </ul>
      )}
      <AddCardFromPanel stackId={stackId} workspaceId={workspaceId} />
    </div>
  );
}

function getCardBadges(
  _card: WorkNode,
  values: DetailFieldValue[],
  fields: DetailField[]
) {
  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    const fieldVals = values.filter((v) => v.field_id === field.id && v.option_id);
    for (const v of fieldVals) {
      const opt = field.options.find((o) => o.id === v.option_id);
      if (opt) badges.push({ id: `${field.id}:${opt.id}`, name: opt.name, color: field.color });
    }
  }
  return badges;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
