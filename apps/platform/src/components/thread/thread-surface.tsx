import { getThreadSurface } from "@/lib/thread-surface";
import { getNodeBoard } from "@/lib/board";
import { getWorkspaceViews } from "@/lib/views";
import {
  buildThreadIdentityTrail,
  getHeaderBadges,
} from "@/lib/detail-header";
import { Board } from "../board/board";
import { FieldsTabContent } from "../detail-panel";
import { MemoryPrimitivesTabContent } from "../memory-primitives-tab-content";
import { NodeDetailTabs } from "../node-detail-tabs";
import { NodeActions } from "../node-actions";
import { PostsTabContent } from "../posts-tab-content";
import { ThreadTree } from "./thread-tree";

export async function ThreadSurface({ nodeId }: { nodeId: string }) {
  const [data, board, views] = await Promise.all([
    getThreadSurface(nodeId),
    getNodeBoard(nodeId),
    getWorkspaceViews(nodeId),
  ]);

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
    inlineClaudeEnabled,
    agentProviders,
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

  const homeWorkspaceId =
    path.find((item) => item.type === "workspace")?.id ?? workspaceId;
  const isHomeContext = true;
  const isMirrored = mirrorPlacements.length > 1;
  const mirrorParentId = undefined;

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
  const identityTrail = buildThreadIdentityTrail({ path, current: node });
  const headerBadges = getHeaderBadges(fields, values);

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

  const fieldsContent =
    node.type === "workspace" ? (
      <div className="px-5 py-10 text-center text-sm text-text-tertiary">
        Fields are available on nested threads.
      </div>
    ) : (
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
      Board unavailable for this thread.
    </div>
  );

  const treeContent = <ThreadTree threads={children} />;

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary">
      <NodeDetailTabs
        identity={{
          node,
          workspaceId,
          trail: identityTrail,
          badges: headerBadges,
          owner,
          members,
          actions,
          viewSwitcher: null,
        }}
        postsContent={postsContent}
        boardContent={boardContent}
        fieldsContent={fieldsContent}
        memoryContent={memoryContent}
        treeContent={treeContent}
        paddingClassName="px-6"
      />
    </main>
  );
}
