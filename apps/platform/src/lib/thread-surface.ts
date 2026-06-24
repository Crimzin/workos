import { getActors, getCurrentActor } from "./actor";
import { getAgentSettings } from "./agent-settings";
import { getNodeLinks, type NodeLinks } from "./links";
import { getNodeMemoryPrimitives } from "./memory-primitives";
import { getMirrorTargets, getNodeDetail } from "./node-detail";
import { getNodePath, type NodePathItem } from "./node-path";
import { getNodePosts, type PostRecord } from "./posts";
import { supabase } from "./supabase";
import type {
  AgentProviderSetting,
  SourceApp,
  ThreadContextAttachment,
} from "./types";

export interface ThreadContextAttachmentWithSource
  extends ThreadContextAttachment {
  source_node: {
    id: string;
    title: string;
    type: string;
    source_app: SourceApp | null;
  } | null;
}

type ThreadContextAttachmentRow = Omit<
  ThreadContextAttachmentWithSource,
  "source_node"
> & {
  source_node:
    | ThreadContextAttachmentWithSource["source_node"]
    | ThreadContextAttachmentWithSource["source_node"][];
};

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
  contextAttachments: ThreadContextAttachmentWithSource[];
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

  const [
    mirrorTargets,
    posts,
    links,
    memoryPrimitives,
    agentSettings,
    actors,
    contextAttachments,
  ] = await Promise.all([
    mirrorTargetsPromise,
    getNodePosts(nodeId, actor.id),
    getNodeLinks(nodeId),
    getNodeMemoryPrimitives(nodeId),
    getAgentSettings(actor.instance_id),
    actorsPromise,
    getThreadContextAttachments(nodeId),
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
    contextAttachments,
  };
}

async function getThreadContextAttachments(
  nodeId: string
): Promise<ThreadContextAttachmentWithSource[]> {
  const { data, error } = await supabase
    .from("thread_context_attachments")
    .select(
      "id,instance_id,thread_id,context_source_node_id,attached_by,status,reason,source_post_id,source_message_id,source_span,metadata,created_at,updated_at,removed_at,source_node:nodes!thread_context_attachments_context_source_node_id_fkey(id,title,type,source_app)"
    )
    .eq("thread_id", nodeId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as ThreadContextAttachmentRow[];

  return rows.map((row) => {
    const sourceNode = Array.isArray(row.source_node)
      ? row.source_node[0] ?? null
      : row.source_node;

    return {
      ...row,
      source_node: sourceNode
        ? {
            id: String(sourceNode.id),
            title: String(sourceNode.title),
            type: String(sourceNode.type),
            source_app: normalizeSourceApp(sourceNode.source_app),
          }
        : null,
    };
  });
}

function normalizeSourceApp(value: unknown): SourceApp | null {
  if (
    value === "workos" ||
    value === "claude" ||
    value === "chatgpt" ||
    value === "unknown" ||
    value === null
  ) {
    return value;
  }
  return "unknown";
}
