import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { getThreadSurface } from "@/lib/thread-surface";
import { FieldsTabContent } from "../detail-panel";
import { MemoryPrimitivesTabContent } from "../memory-primitives-tab-content";
import { NodeActions } from "../node-actions";
import { PostsTabContent } from "../posts-tab-content";
import { SubThreadList } from "./sub-thread-list";
import { ThreadHeader } from "./thread-header";
import { ThreadTabs } from "./thread-tabs";
import { ThreadTree } from "./thread-tree";

export async function ThreadSurface({ nodeId }: { nodeId: string }) {
  const data = await getThreadSurface(nodeId);

  if (!data) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-bg-primary px-6 text-sm text-text-secondary">
        Thread not found.
      </main>
    );
  }

  const {
    detail,
    path,
    workspaceId,
    mirrorTargets,
    posts,
    links,
    memoryPrimitives,
    actor,
    actors,
  } = data;
  const {
    node,
    owner,
    members,
    fields,
    values,
    children,
    mirrorPlacements,
  } = detail;

  const homePlacement = mirrorPlacements.find((placement) => placement.is_home);
  const homeWorkspaceId = homePlacement?.parent.id ?? workspaceId;
  const isHomeContext = homeWorkspaceId === workspaceId;
  const isMirrored = mirrorPlacements.length > 1;
  const mirrorParentId = !isHomeContext ? workspaceId : undefined;

  const viewSwitcher =
    path.length === 1 ? (
      <Link
        href={`/n/${node.id}?view=board`}
        scroll={false}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LayoutGrid size={15} />
        Board
      </Link>
    ) : null;

  const actions =
    node.type === "workspace" ? null : (
      <NodeActions
        nodeId={node.id}
        workspaceId={workspaceId}
        parentId={node.parent_id}
        nodeType={node.type as "card" | "stack"}
        isArchived={!!node.archived_at}
        closeHref={`/n/${workspaceId}`}
        isHomeContext={isHomeContext}
        isMirrored={isMirrored}
        mirrorParentId={mirrorParentId}
        homeWorkspaceId={homeWorkspaceId}
      />
    );

  const postsContent = (
    <PostsTabContent
      nodeId={node.id}
      workspaceId={workspaceId}
      initialPosts={posts}
      currentActorId={actor.id}
      currentActorName={actor.name}
      actors={actors}
    />
  );

  const subThreadsContent = (
    <SubThreadList
      parentThreadId={node.id}
      workspaceId={workspaceId}
      subThreads={children}
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

  const treeContent = <ThreadTree children={children} />;

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary">
      <ThreadHeader
        node={node}
        path={path}
        fields={fields}
        values={values}
        owner={owner}
        members={members}
        workspaceId={workspaceId}
        actions={actions}
        viewSwitcher={viewSwitcher}
      />

      <ThreadTabs
        postsContent={postsContent}
        subThreadsContent={subThreadsContent}
        fieldsContent={fieldsContent}
        memoryContent={memoryContent}
        treeContent={treeContent}
      />
    </main>
  );
}
