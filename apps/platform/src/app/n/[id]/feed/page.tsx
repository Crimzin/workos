import { notFound } from "next/navigation";
import { getNode } from "@/lib/nodes";
import { getRootNodes } from "@/lib/nodes";
import { getWorkspaceFeed } from "@/lib/posts";
import { getCurrentActor } from "@/lib/actor";
import { WorkspaceFeed } from "@/components/workspace-feed";

export default async function FeedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [node, roots, actor] = await Promise.all([
    getNode(id),
    getRootNodes(),
    getCurrentActor(),
  ]);

  if (!node || node.type !== "workspace") notFound();

  // Personal workspace = lowest-position root (first in list)
  const isPersonal = roots[0]?.id === id;

  const [workspaceFeed, allFeed] = await Promise.all([
    getWorkspaceFeed(id, "workspace"),
    isPersonal ? getWorkspaceFeed(id, "all") : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Feed</div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
          {node.title}
        </h1>
      </div>
      <div className="flex-1 overflow-auto px-6 py-0">
        <WorkspaceFeed
          workspaceId={id}
          workspaceFeed={workspaceFeed}
          allFeed={allFeed}
          actorId={actor.id}
          isPersonal={isPersonal}
        />
      </div>
    </div>
  );
}
