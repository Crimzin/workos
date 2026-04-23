"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { revalidateWorkspaceBoard } from "../cache";

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

  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

export async function reorderStack(
  stackId: string,
  workspaceId: string,
  newPosition: number
): Promise<void> {
  const { error } = await supabase
    .from("nodes")
    .update({ position: newPosition })
    .eq("id", stackId);
  if (error) throw error;

  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}
