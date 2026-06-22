"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import { revalidateNodeLinksFor } from "../cache";
import { recordWorkOSEvent } from "../events";
import { searchLinkableNodes as _searchLinkableNodes } from "../links";

export async function createLink(
  fromNodeId: string,
  toNodeId: string,
  linkType: "related" | "blocks",
  workspaceId: string
): Promise<void> {
  if (fromNodeId === toNodeId) return;
  const actor = await getCurrentActor();

  const { error } = await supabase.from("node_links").insert({
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    link_type: linkType,
    created_by_actor_id: actor.id,
  });
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: fromNodeId,
    actorId: actor.id,
    eventType: "link.created",
    subjectType: "node_link",
    subjectId: null,
    summary: `${actor.name} linked two threads.`,
    metadata: {
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      link_type: linkType,
    },
  });

  revalidateNodeLinksFor([fromNodeId, toNodeId]);
  revalidatePath(`/n/${workspaceId}`);
}

export async function deleteLink(
  linkId: string,
  fromNodeId: string,
  toNodeId: string,
  workspaceId: string
): Promise<void> {
  const actor = await getCurrentActor();
  const { data: link, error: fetchErr } = await supabase
    .from("node_links")
    .select("link_type")
    .eq("id", linkId)
    .single();
  if (fetchErr) throw fetchErr;

  const { error } = await supabase.from("node_links").delete().eq("id", linkId);
  if (error) throw error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: fromNodeId,
    actorId: actor.id,
    eventType: "link.deleted",
    subjectType: "node_link",
    subjectId: linkId,
    summary: `${actor.name} removed a thread link.`,
    metadata: {
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      link_type: link.link_type,
    },
  });

  revalidateNodeLinksFor([fromNodeId, toNodeId]);
  revalidatePath(`/n/${workspaceId}`);
}

/** Server action wrapper for the picker UI to call from a client component. */
export async function searchLinkableNodes(
  query: string,
  excludeNodeId: string
): Promise<Awaited<ReturnType<typeof _searchLinkableNodes>>> {
  return _searchLinkableNodes(query, excludeNodeId);
}
