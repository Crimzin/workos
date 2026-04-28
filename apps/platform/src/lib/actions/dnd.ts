"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { revalidateWorkspaceBoard, revalidateNode } from "../cache";

export async function moveCard(
  cardId: string,
  workspaceId: string,
  newStackId: string,
  newPosition: number,
  columnFieldId: string | null,
  newOptionId: string | null
): Promise<void> {
  const { error: nodeErr } = await supabase
    .from("nodes")
    .update({ parent_id: newStackId, position: newPosition })
    .eq("id", cardId);
  if (nodeErr) throw nodeErr;

  // Guard: if the card was previously mirrored into newStackId, that mirror row
  // is now redundant (the card is home there). Delete it to prevent the detail
  // panel from showing the same stack as both home AND a mirror.
  const { error: mirrorCleanupErr } = await supabase
    .from("node_mirrors")
    .delete()
    .eq("node_id", cardId)
    .eq("mirror_parent_id", newStackId);
  if (mirrorCleanupErr) throw mirrorCleanupErr;

  if (columnFieldId) {
    const { error: delErr } = await supabase
      .from("node_field_values")
      .delete()
      .eq("node_id", cardId)
      .eq("field_id", columnFieldId);
    if (delErr) throw delErr;

    if (newOptionId) {
      const { error: insErr } = await supabase.from("node_field_values").insert({
        node_id: cardId,
        field_id: columnFieldId,
        option_id: newOptionId,
        position: 0,
      });
      if (insErr) throw insErr;
    }
  }

  revalidateNode(cardId, null);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

export async function reorderStack(
  stackId: string,
  workspaceId: string,
  newPosition: number
): Promise<void> {
  // Check whether this workspace is the stack's home or a mirror context.
  const { data: node } = await supabase
    .from("nodes")
    .select("parent_id")
    .eq("id", stackId)
    .maybeSingle();

  if (node?.parent_id === workspaceId) {
    // Home context: update the canonical position on the node.
    const { error } = await supabase
      .from("nodes")
      .update({ position: newPosition })
      .eq("id", stackId);
    if (error) throw error;
  } else {
    // Mirror context: update position within the mirror placement.
    const { error } = await supabase
      .from("node_mirrors")
      .update({ position: newPosition })
      .eq("node_id", stackId)
      .eq("mirror_parent_id", workspaceId);
    if (error) throw error;
  }

  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}
