import Link from "next/link";
import { X, User } from "lucide-react";
import { getNodeDetail, getMirrorTargets } from "@/lib/node-detail";
import type { DetailField, DetailFieldValue, NodeAncestor } from "@/lib/node-detail";
import type { WorkNode } from "@/lib/types";
import type { NodeMirrorPlacement } from "@/lib/board-types";
import { getNodePosts } from "@/lib/posts";
import { getNodeMemoryPrimitives } from "@/lib/memory-primitives";
import { getNodeLinks } from "@/lib/links";
import type { NodeLinks } from "@/lib/links";
import { getCurrentActor, getActors } from "@/lib/actor";
import { getAgentSettings } from "@/lib/agent-settings";
import { FieldBadge } from "./field-badge";
import { FieldRowEditor } from "./field-row-editor";
import { AddFieldButton } from "./add-field-button";
import { EditableTitle } from "./editable-title";
import { DetailPanelTabs } from "./detail-panel-tabs";
import { NodeActions } from "./node-actions";
import { CardsTabContent } from "./cards-tab-content";
import { MirrorsSection } from "./mirrors-section";
import { NodeLinksSection } from "./node-links-section";
import { PostsTabContent } from "./posts-tab-content";
import { MemoryPrimitivesTabContent } from "./memory-primitives-tab-content";

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
  const [detail, actor] = await Promise.all([
    getNodeDetail(nodeId),
    getCurrentActor(),
  ]);

  // Fetch mirror targets + posts + links + memory in parallel with detail panel render.
  const [mirrorTargets, posts, links, memoryPrimitives, agentSettings, actors] = await Promise.all([
    detail
      ? getMirrorTargets(detail.node.instance_id, detail.node.type as "stack" | "card")
      : Promise.resolve([]),
    detail ? getNodePosts(nodeId) : Promise.resolve([]),
    detail
      ? getNodeLinks(nodeId)
      : Promise.resolve({ related: [], blocks: [], blockedBy: [] } as NodeLinks),
    detail
      ? getNodeMemoryPrimitives(nodeId)
      : Promise.resolve({ rationale: null, assumptions: [], decisions: [] }),
    getAgentSettings(actor.instance_id),
    getActors(actor.instance_id),
  ]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-bg-primary">
      {detail ? (
        <DetailBody detail={detail} workspaceId={workspaceId} closeHref={closeHref} mirrorTargets={mirrorTargets} posts={posts} links={links} memoryPrimitives={memoryPrimitives} actor={actor} actors={actors} inlineClaudeEnabled={agentSettings.providers.some((provider) => provider.provider_key === "inline_claude" && provider.enabled)} />
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
  mirrorTargets,
  posts,
  links,
  memoryPrimitives,
  actor,
  actors,
  inlineClaudeEnabled,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getNodeDetail>>>;
  workspaceId: string;
  closeHref: string;
  mirrorTargets: { id: string; title: string; type: string }[];
  posts: import("@/lib/posts").PostRecord[];
  links: NodeLinks;
  memoryPrimitives: import("@/lib/memory-primitives").NodeMemoryPrimitives;
  actor: import("@/lib/actor").CurrentActor;
  actors: import("@/lib/actor").ActorForMention[];
  inlineClaudeEnabled: boolean;
}) {
  const { node, owner, members, ancestors, fields, values, children, childFieldValues, mirrorPlacements } = detail;

  // Determine if we're viewing from the node's home context or a mirror context.
  const homePlacement = mirrorPlacements.find((p) => p.is_home);
  const homeWorkspaceId = homePlacement?.parent.id ?? workspaceId;
  const isHomeContext = homeWorkspaceId === workspaceId;
  const isMirrored = mirrorPlacements.length > 1;
  // If viewing from a mirror workspace, this is the mirror_parent_id to unlink.
  const mirrorParentId = !isHomeContext ? workspaceId : undefined;

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

  const postsContent = (
    <PostsTabContent
      nodeId={node.id}
      workspaceId={workspaceId}
      initialPosts={posts}
      currentActorId={actor.id}
      currentActorName={actor.name}
      actors={actors}
      inlineClaudeEnabled={inlineClaudeEnabled}
    />
  );

  const fieldsContent = (
    <FieldsTabContent
      node={node}
      owner={owner}
      fields={fields}
      values={values}
      workspaceId={workspaceId}
      mirrorPlacements={mirrorPlacements}
      mirrorTargets={mirrorTargets}
      homeWorkspaceId={homeWorkspaceId}
      links={links}
    />
  );

  const memoryContent = (
    <MemoryPrimitivesTabContent
      nodeId={node.id}
      workspaceId={workspaceId}
      initialPrimitives={memoryPrimitives}
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
      <div className="shrink-0 border-b border-border px-4 py-2.5">
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
            <div className="mt-0.5">
              <EditableTitle
                nodeId={node.id}
                workspaceId={workspaceId}
                parentId={node.parent_id}
                initialTitle={node.title}
              />
            </div>

            {/* Field badges */}
            {headerBadges.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
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
              isHomeContext={isHomeContext}
              isMirrored={isMirrored}
              mirrorParentId={mirrorParentId}
              homeWorkspaceId={homeWorkspaceId}
            />
            <CloseButton href={closeHref} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <DetailPanelTabs
        nodeType={node.type}
        fieldsContent={fieldsContent}
        memoryContent={memoryContent}
        cardsContent={cardsContent}
        postsContent={postsContent}
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
            ? `/n/${workspaceId}?view=board`
            : `/n/${workspaceId}?view=board&d=${a.id}`;
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
    <div className="mt-1.5 flex items-center gap-1.5">
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

export function FieldsTabContent({
  node,
  owner,
  fields,
  values,
  workspaceId,
  mirrorPlacements,
  mirrorTargets,
  homeWorkspaceId,
  links,
}: {
  node: WorkNode;
  owner: { name: string } | null;
  fields: DetailField[];
  values: DetailFieldValue[];
  workspaceId: string;
  mirrorPlacements: NodeMirrorPlacement[];
  mirrorTargets: { id: string; title: string; type: string }[];
  homeWorkspaceId: string;
  links: NodeLinks;
}) {
  const valuesByField = new Map<string, DetailFieldValue[]>();
  for (const v of values) {
    const arr = valuesByField.get(v.field_id) ?? [];
    arr.push(v);
    valuesByField.set(v.field_id, arr);
  }

  return (
    <div className="py-5">
      <div className="flex items-center justify-between px-5">
        <div className="section-label">Fields</div>
        <AddFieldButton workspaceId={workspaceId} />
      </div>
      <dl className="mt-2 mx-5 divide-y divide-border rounded-md border border-border bg-bg-card">
        <SystemRow label="Owner" value={owner?.name ?? "—"} />
        <SystemRow label="Type" value={node.type} />
        {node.type === "stack" && (
          <SystemRow label="Lifecycle" value={formatLifecycle(node.stack_lifecycle_status)} />
        )}
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

      {/* "Appears in" section */}
      <MirrorsSection
        nodeId={node.id}
        nodeType={node.type as "stack" | "card"}
        workspaceId={workspaceId}
        homeWorkspaceId={homeWorkspaceId}
        placements={mirrorPlacements}
        availableTargets={mirrorTargets}
      />

      {/* "Linked Context" section */}
      <NodeLinksSection
        nodeId={node.id}
        workspaceId={workspaceId}
        links={links}
      />
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


function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLifecycle(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
