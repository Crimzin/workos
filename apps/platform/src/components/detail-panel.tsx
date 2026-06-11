import Link from "next/link";
import { X } from "lucide-react";
import { getNodeDetail, getMirrorTargets } from "@/lib/node-detail";
import type { DetailField, DetailFieldValue } from "@/lib/node-detail";
import type { WorkNode } from "@/lib/types";
import type { NodeMirrorPlacement } from "@/lib/board-types";
import { getNodePosts } from "@/lib/posts";
import { getNodeMemoryPrimitives } from "@/lib/memory-primitives";
import { getNodeLinks } from "@/lib/links";
import type { NodeLinks } from "@/lib/links";
import { getCurrentActor, getActors } from "@/lib/actor";
import { getAgentSettings } from "@/lib/agent-settings";
import { getNodeBoard } from "@/lib/board";
import { getWorkspaceViews } from "@/lib/views";
import {
  buildBoardDetailTrail,
  getHeaderBadges,
} from "@/lib/detail-header";
import { FieldRowEditor } from "./field-row-editor";
import { AddFieldButton } from "./add-field-button";
import { NodeActions } from "./node-actions";
import { CardsTabContent } from "./cards-tab-content";
import { MirrorsSection } from "./mirrors-section";
import { NodeLinksSection } from "./node-links-section";
import { PostsTabContent } from "./posts-tab-content";
import { MemoryPrimitivesTabContent } from "./memory-primitives-tab-content";
import { NodeDetailTabs } from "./node-detail-tabs";
import { Board } from "./board/board";

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
  const [mirrorTargets, posts, links, memoryPrimitives, agentSettings, actors, board, views] = await Promise.all([
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
    detail ? getNodeBoard(nodeId) : Promise.resolve(null),
    detail ? getWorkspaceViews(nodeId) : Promise.resolve([]),
  ]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-bg-secondary/70">
      {detail ? (
        <DetailBody detail={detail} workspaceId={workspaceId} closeHref={closeHref} mirrorTargets={mirrorTargets} posts={posts} links={links} memoryPrimitives={memoryPrimitives} actor={actor} actors={actors} inlineClaudeEnabled={agentSettings.providers.some((provider) => provider.provider_key === "inline_claude" && provider.enabled)} agentProviders={agentSettings.providers} board={board} views={views} />
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
  agentProviders,
  board,
  views,
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
  agentProviders: import("@/lib/types").AgentProviderSetting[];
  board: Awaited<ReturnType<typeof getNodeBoard>>;
  views: Awaited<ReturnType<typeof getWorkspaceViews>>;
}) {
  const { node, owner, members, ancestors, fields, values, children, childFieldValues, mirrorPlacements } = detail;

  // Determine if we're viewing from the node's home context or a mirror context.
  const homePlacement = mirrorPlacements.find((p) => p.is_home);
  const homeWorkspaceId = homePlacement?.parent.id ?? workspaceId;
  const isHomeContext = homeWorkspaceId === workspaceId;
  const isMirrored = mirrorPlacements.length > 1;
  // If viewing from a mirror workspace, this is the mirror_parent_id to unlink.
  const mirrorParentId = !isHomeContext ? workspaceId : undefined;

  const headerBadges = getHeaderBadges(fields, values);
  const detailTrail = buildBoardDetailTrail({
    ancestors,
    current: { id: node.id, title: node.title, type: node.type },
    workspaceId,
  });

  const postsContent = (
    <PostsTabContent
      nodeId={node.id}
      workspaceId={workspaceId}
      initialPosts={posts}
      currentActorId={actor.id}
      currentActorName={actor.name}
      actors={actors}
      inlineClaudeEnabled={inlineClaudeEnabled}
      agentProviders={agentProviders}
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

  const boardContent = board ? (
    <Board data={board} views={views} navigationMode="thread" />
  ) : (
    <div className="flex h-full items-center justify-center px-5 text-sm text-text-tertiary">
      Board unavailable for this node.
    </div>
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
      <NodeDetailTabs
        identity={{
          node,
          workspaceId,
          trail: detailTrail,
          badges: headerBadges,
          owner,
          members,
          actions: (
            <>
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
            </>
          ),
        }}
        fieldsContent={fieldsContent}
        boardContent={boardContent}
        memoryContent={memoryContent}
        postsContent={postsContent}
        treeContent={cardsContent}
        paddingClassName="px-4"
      />
    </>
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
      <dl className="mt-2 mx-5 divide-y divide-border rounded-md border border-border bg-bg-card shadow-sm">
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
