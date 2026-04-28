"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import { revalidateNodeLinksFor } from "../cache";
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

  revalidateNodeLinksFor([fromNodeId, toNodeId]);
  revalidatePath(`/n/${workspaceId}`);
}

export async function deleteLink(
  linkId: string,
  fromNodeId: string,
  toNodeId: string,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase.from("node_links").delete().eq("id", linkId);
  if (error) throw error;

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
