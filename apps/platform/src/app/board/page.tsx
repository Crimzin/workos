import { Suspense } from "react";
import { Board } from "@/components/board/board";
import { DetailPanel } from "@/components/detail-panel";
import { ResizablePanelGroup } from "@/components/resizable-panel-group";
import { getGlobalBoardData } from "@/lib/global-board";

export default async function GlobalBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d: detailId } = await searchParams;
  const data = await getGlobalBoardData();

  return (
    <ResizablePanelGroup
      board={
        <div className="flex h-full min-h-0 flex-col bg-bg-primary">
          <div className="shrink-0 border-b border-border px-6 py-4">
            <div className="section-label">Global</div>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
              Board
            </h1>
          </div>
          <div className="min-h-0 flex-1">
            {data ? (
              <Board data={data.board} views={data.views} />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-sm text-text-tertiary">
                No board root available.
              </div>
            )}
          </div>
        </div>
      }
      detail={
        data ? (
          detailId ? (
            <Suspense key={detailId} fallback={<DetailPanelSkeleton />}>
              <DetailPanel
                nodeId={detailId}
                workspaceId={data.root.id}
                closeHref="/board"
              />
            </Suspense>
          ) : null
        ) : null
      }
    />
  );
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
