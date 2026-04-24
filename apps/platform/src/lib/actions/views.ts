"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { revalidateWorkspaceViews } from "../cache";

export async function createView(
  workspaceId: string,
  name: string,
  columnFieldId: string | null
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("workspace_views")
    .insert({ workspace_id: workspaceId, name, column_field_id: columnFieldId, starred: false })
    .select("id")
    .single();
  if (error) throw error;
  revalidateWorkspaceViews(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
  return data as { id: string };
}

export async function updateViewName(
  viewId: string,
  workspaceId: string,
  name: string
): Promise<void> {
  const { error } = await supabase
    .from("workspace_views")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", viewId);
  if (error) throw error;
  revalidateWorkspaceViews(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

export async function updateViewColumnField(
  viewId: string,
  workspaceId: string,
  columnFieldId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("workspace_views")
    .update({ column_field_id: columnFieldId, updated_at: new Date().toISOString() })
    .eq("id", viewId);
  if (error) throw error;
  revalidateWorkspaceViews(workspaceId);
}

export async function starView(viewId: string, workspaceId: string): Promise<void> {
  await supabase
    .from("workspace_views")
    .update({ starred: false })
    .eq("workspace_id", workspaceId);
  const { error } = await supabase
    .from("workspace_views")
    .update({ starred: true, updated_at: new Date().toISOString() })
    .eq("id", viewId);
  if (error) throw error;
  revalidateWorkspaceViews(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

export async function deleteView(viewId: string, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("workspace_views")
    .delete()
    .eq("id", viewId);
  if (error) throw error;
  revalidateWorkspaceViews(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}
