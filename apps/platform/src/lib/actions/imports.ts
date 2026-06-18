"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import {
  revalidateNode,
  revalidateNodeChildren,
  revalidateNodeMemoryPrimitives,
  revalidateNodePosts,
  revalidateRootNodes,
  revalidateThreadSurface,
  revalidateWorkspaceBoard,
} from "../cache";
import { buildAcceptedImportPlan } from "../import-materialization";
import { validateImportPreview, type ImportPreview } from "../import-preview";
import { supabase } from "../supabase";

export interface MaterializeImportResult {
  workspaceId: string;
  threadIds: string[];
}

async function nextPosition(parentId: string | null): Promise<number> {
  const query = supabase
    .from("nodes")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  const { data, error } = parentId
    ? await query.eq("parent_id", parentId)
    : await query.is("parent_id", null);
  if (error) throw error;
  const current = data?.[0]?.position ?? -1;
  return current + 1;
}

export async function materializeImportPreview(
  rawPreview: unknown
): Promise<MaterializeImportResult> {
  const preview: ImportPreview = validateImportPreview(rawPreview);
  const plan = buildAcceptedImportPlan(preview);
  const actor = await getCurrentActor();

  const workspacePosition = await nextPosition(null);
  const { data: workspace, error: workspaceError } = await supabase
    .from("nodes")
    .insert({
      instance_id: actor.instance_id,
      parent_id: null,
      type: "workspace",
      title: "Imported AI Context",
      description: "Generated from Claude/ChatGPT conversation exports.",
      owner_id: actor.id,
      position: workspacePosition,
    })
    .select("id")
    .single();
  if (workspaceError) throw workspaceError;

  const threadIds: string[] = [];
  for (let index = 0; index < plan.threads.length; index += 1) {
    const thread = plan.threads[index];
    const { data: node, error: nodeError } = await supabase
      .from("nodes")
      .insert({
        instance_id: actor.instance_id,
        parent_id: workspace.id,
        type: "stack",
        title: thread.title,
        description: thread.description,
        owner_id: actor.id,
        position: index,
        thread_resolution_status: "active",
      })
      .select("id")
      .single();
    if (nodeError) throw nodeError;
    threadIds.push(node.id);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        node_id: node.id,
        actor_id: actor.id,
        post_type: "post",
        body: thread.startingContextMarkdown,
        pinned: true,
        pinned_at: new Date().toISOString(),
        metadata: {
          import_job_id: plan.importJobId,
          import_cluster_id: thread.clusterId,
          source_refs: thread.sourceRefs,
          post_kind: "starting_context",
        },
      })
      .select("id")
      .single();
    if (postError) throw postError;

    for (const primitive of thread.memoryPrimitives) {
      const { error: primitiveError } = await supabase
        .from("memory_primitives")
        .insert({
          instance_id: actor.instance_id,
          node_id: node.id,
          type: primitive.type,
          statement: primitive.statement,
          body: primitive.body,
          status: primitive.type === "assumption" ? "untested" : "active",
          conviction: primitive.conviction,
          metadata: primitive.metadata,
          source_post_id: post.id,
          source_label: "Imported AI conversation",
          external_episode_id: primitive.externalEpisodeId,
          created_by_actor_id: actor.id,
        });
      if (primitiveError) throw primitiveError;
    }

    revalidateNode(node.id, workspace.id);
    revalidateNodePosts(node.id);
    revalidateNodeMemoryPrimitives(node.id);
    revalidateThreadSurface(node.id);
  }

  revalidateRootNodes();
  revalidateNode(workspace.id, null);
  revalidateNodeChildren(workspace.id);
  revalidateWorkspaceBoard(workspace.id);
  revalidatePath("/", "layout");
  revalidatePath(`/n/${workspace.id}`);
  return { workspaceId: workspace.id, threadIds };
}
