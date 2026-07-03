import { getThreadSurface } from "@/lib/thread-surface";
import {
  buildThreadIdentityTrail,
  getHeaderBadges,
} from "@/lib/detail-header";
import { FieldsTabContent } from "../detail-panel";
import { MemoryPrimitivesTabContent } from "../memory-primitives-tab-content";
import { NodeDetailTabs } from "../node-detail-tabs";
import { NodeActions } from "../node-actions";
import { PostsTabContent } from "../posts-tab-content";
import { ContextPanel } from "./context-panel";
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
    inlineClaudeEnabled,
    agentProviders,
    activeInlineRuns,
    contextAttachments,
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
        nodeType={node.type}
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
      initialActiveInlineRuns={activeInlineRuns}
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

  const treeContent = <ThreadTree threads={children} />;

  return (
    <main className="flex h-full min-h-0 overflow-hidden bg-bg-primary">
      <div className="min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
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
          fieldsContent={fieldsContent}
          memoryContent={memoryContent}
          treeContent={treeContent}
          detailsPlacement="external"
          pinIdentityHeader
          paddingClassName="px-6"
        />
      </div>
      <ContextPanel
        attachments={contextAttachments}
        fieldsContent={fieldsContent}
        memoryContent={memoryContent}
        treeContent={treeContent}
      />
    </main>
  );
}
