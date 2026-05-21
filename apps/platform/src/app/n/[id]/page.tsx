import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ThreadSurface } from "@/components/thread/thread-surface";
import { getWorkspaceBoard } from "@/lib/board";
import { getWorkspaceViews } from "@/lib/views";
import { Board } from "@/components/board/board";
import { DetailPanel } from "@/components/detail-panel";
import { ResizablePanelGroup } from "@/components/resizable-panel-group";
import { getNode } from "@/lib/nodes";

export default async function NodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string; view?: string }>;
}) {
  const { id } = await params;
  const { d: detailId, view } = await searchParams;
  const node = await getNode(id);
  if (!node) notFound();

  if (node.type === "workspace" && view === "board") {
    const [board, views] = await Promise.all([
      getWorkspaceBoard(id),
      getWorkspaceViews(id),
    ]);
    if (!board) notFound();
    return (
      <div className="h-full min-h-0">
        <ResizablePanelGroup
          board={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspaceHeader title={node.title} description={node.description} />
              <div className="min-h-0 flex-1">
                <Board data={board} views={views} />
              </div>
            </div>
          }
          detail={
            detailId ? (
              <Suspense key={detailId} fallback={<DetailPanelSkeleton />}>
                <DetailPanel
                  nodeId={detailId}
                  workspaceId={id}
                  closeHref={`/n/${id}?view=board`}
                />
              </Suspense>
            ) : null
          }
        />
      </div>
    );
  }

  return <ThreadSurface nodeId={id} />;
}

function DetailPanelSkeleton() {
  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-bg-primary">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="h-3 w-16 animate-pulse rounded bg-bg-hover" />
      </div>
      <div className="flex-1 px-5 py-5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-bg-hover" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-bg-hover" />
      </div>
    </aside>
  );
}

function WorkspaceHeader({ title, description }: { title: string; description: string | null }) {
  return (
    <div className="shrink-0 border-b border-border px-6 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="section-label">Workspace</div>
          <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-text-primary">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
        </div>
      </div>
    </div>
  );
}
