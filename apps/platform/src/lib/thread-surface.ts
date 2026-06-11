import { getActors, getCurrentActor } from "./actor";
import { getAgentSettings } from "./agent-settings";
import { getNodeLinks, type NodeLinks } from "./links";
import { getNodeMemoryPrimitives } from "./memory-primitives";
import { getMirrorTargets, getNodeDetail } from "./node-detail";
import { getNodePath, type NodePathItem } from "./node-path";
import { getNodePosts, type PostRecord } from "./posts";
import type { AgentProviderSetting } from "./types";

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
  inlineClaudeEnabled: boolean;
  agentProviders: AgentProviderSetting[];
}

export async function getThreadSurface(
  nodeId: string
): Promise<ThreadSurfaceData | null> {
  const [detail, path, actor] = await Promise.all([
    getNodeDetail(nodeId),
    getNodePath(nodeId),
    getCurrentActor(),
  ]);
  if (!detail) return null;

  const actorsPromise = getActors(actor.instance_id);
  const workspaceId = path[0]?.id ?? detail.node.id;
  const mirrorTargetsPromise =
    detail.node.type === "stack" || detail.node.type === "card"
      ? getMirrorTargets(detail.node.instance_id, detail.node.type)
      : Promise.resolve([]);

  const [mirrorTargets, posts, links, memoryPrimitives, agentSettings, actors] =
    await Promise.all([
    mirrorTargetsPromise,
    getNodePosts(nodeId),
    getNodeLinks(nodeId),
    getNodeMemoryPrimitives(nodeId),
    getAgentSettings(actor.instance_id),
    actorsPromise,
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
    inlineClaudeEnabled: agentSettings.providers.some(
      (provider) => provider.provider_key === "inline_claude" && provider.enabled
    ),
    agentProviders: agentSettings.providers,
  };
}
