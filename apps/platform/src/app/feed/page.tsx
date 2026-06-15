import { getActors, getCurrentActor } from "@/lib/actor";
import { getRootNodes } from "@/lib/nodes";
import { getWorkspaceFeed } from "@/lib/posts";
import { WorkspaceFeed } from "@/components/workspace-feed";

export default async function GlobalFeedPage() {
  const [roots, actor, actors] = await Promise.all([
    getRootNodes(),
    getCurrentActor(),
    getActors(),
  ]);
  const fallbackWorkspaceId = roots[0]?.id ?? "";
  const posts = fallbackWorkspaceId
    ? await getWorkspaceFeed(fallbackWorkspaceId, "all", actor.id)
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Global</div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
          Feed
        </h1>
      </div>
      <div className="flex-1 overflow-auto px-6 py-0">
        <WorkspaceFeed
          workspaceId={fallbackWorkspaceId}
          workspaceFeed={posts}
          allFeed={posts}
          actorId={actor.id}
          actors={actors}
          isPersonal
          global
        />
      </div>
    </div>
  );
}
