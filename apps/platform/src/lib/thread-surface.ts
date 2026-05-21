import { unstable_cache } from "next/cache";
import { getActors, getCurrentActor } from "./actor";
import { cacheTags } from "./cache";
import { getNodeLinks, type NodeLinks } from "./links";
import { getNodeMemoryPrimitives } from "./memory-primitives";
import { getMirrorTargets, getNodeDetail } from "./node-detail";
import { getNodePath, type NodePathItem } from "./node-path";
import { getNodePosts, type PostRecord } from "./posts";

export interface ThreadSurfaceData {
  detail: NonNullable<Awaited<ReturnType<typeof getNodeDetail>>>;
  path: NodePathItem[];
  workspaceId: string;
  mirrorTargets: { id: string; title: string; type: string }[];
  posts: PostRecord[];
  links: NodeLinks;
  memoryPrimitives: Awaited<ReturnType<typeof getNodeMemoryPrimitives>>;
  actor: Awaited<ReturnType<typeof getCurrentActor>>;
  actors: Awaited<ReturnType<typeof getActors>>;
}

export async function getThreadSurface(
  nodeId: string
): Promise<ThreadSurfaceData | null> {
  const cached = unstable_cache(
    async (): Promise<ThreadSurfaceData | null> => {
      const [detail, path, actor, actors] = await Promise.all([
        getNodeDetail(nodeId),
        getNodePath(nodeId),
        getCurrentActor(),
        getActors(),
      ]);
      if (!detail) return null;

      const workspaceId = path[0]?.id ?? detail.node.id;
      const mirrorTargetsPromise =
        detail.node.type === "stack" || detail.node.type === "card"
          ? getMirrorTargets(detail.node.instance_id, detail.node.type)
          : Promise.resolve([]);

      const [mirrorTargets, posts, links, memoryPrimitives] = await Promise.all([
        mirrorTargetsPromise,
        getNodePosts(nodeId),
        getNodeLinks(nodeId),
        getNodeMemoryPrimitives(nodeId),
      ]);

      return {
        detail,
        path,
        workspaceId,
        mirrorTargets,
        posts,
        links,
        memoryPrimitives,
        actor,
        actors,
      };
    },
    ["thread-surface", nodeId],
    {
      tags: [cacheTags.threadSurface(nodeId)],
      revalidate: 300,
    }
  );

  return cached();
}
