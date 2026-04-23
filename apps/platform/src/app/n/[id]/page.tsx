import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getNode, getChildren } from "@/lib/nodes";
import { getWorkspaceBoard } from "@/lib/board";
import { Board } from "@/components/board/board";
import { DetailPanel } from "@/components/detail-panel";

export default async function NodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { id } = await params;
  const { d: detailId } = await searchParams;
  const node = await getNode(id);
  if (!node) notFound();

  if (node.type === "workspace") {
    const board = await getWorkspaceBoard(id);
    if (!board) notFound();
    return (
      <div className="flex h-full flex-col">
        <WorkspaceHeader title={node.title} description={node.description} />
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <Board data={board} />
          </div>
          {detailId && (
            <Suspense key={detailId} fallback={<DetailPanelSkeleton />}>
              <DetailPanel
                nodeId={detailId}
                workspaceId={id}
                closeHref={`/n/${id}`}
              />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  // Non-workspace nodes: keep the simple children list for now; a richer
  // Detail panel lands in 1.5.
  const children = await getChildren(id);
  return (
    <main className="mx-auto max-w-3xl w-full px-8 py-10">
      <nav className="mb-6 text-xs text-text-tertiary">
        <Link href="/" className="transition-colors hover:text-text-primary">
          Home
        </Link>
        {node.parent_id && (
          <>
            {" / "}
            <Link
              href={`/n/${node.parent_id}`}
              className="transition-colors hover:text-text-primary"
            >
              Parent
            </Link>
          </>
        )}
      </nav>

      <header className="mb-8">
        <div className="section-label">{node.type}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
          {node.title}
        </h1>
        {node.description && (
          <p className="mt-2 text-sm text-text-secondary">{node.description}</p>
        )}
      </header>

      <section>
        <h2 className="section-label">Children</h2>
        <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-bg-card">
          {children.length === 0 && (
            <li className="px-4 py-6 text-sm text-text-secondary">
              No children yet.
            </li>
          )}
          {children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/n/${c.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-bg-hover"
              >
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {c.title}
                  </div>
                  {c.description && (
                    <div className="text-xs text-text-secondary">
                      {c.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-text-tertiary">
                  <span>{c.type}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function DetailPanelSkeleton() {
  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col border-l border-border bg-bg-primary">
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

function WorkspaceHeader({
  title,
  description,
}: {
  title: string;
  description: string | null;
}) {
  return (
    <div className="shrink-0 border-b border-border px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="section-label">Workspace</div>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-text-primary">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-text-secondary">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
