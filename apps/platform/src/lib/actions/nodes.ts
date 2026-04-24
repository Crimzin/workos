"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import {
  revalidateRootNodes,
  revalidateNode,
  revalidateWorkspaceBoard,
} from "../cache";

export async function updateNodeTitle(
  nodeId: string,
  title: string,
  workspaceId: string,
  parentId: string | null
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;

  const { error } = await supabase
    .from("nodes")
    .update({ title: trimmed })
    .eq("id", nodeId);
  if (error) throw error;

  revalidateNode(nodeId, parentId);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
  // If the renamed node is a workspace, refresh the sidebar tree too.
  if (!parentId) {
    revalidateRootNodes();
    revalidatePath("/", "layout");
  }
}

export interface CreateWorkspaceResult {
  id: string;
}

export interface CreateStackResult {
  id: string;
}

export interface CreateCardResult {
  id: string;
}

async function nextPositionForSibling(
  parentId: string | null
): Promise<number> {
  const query = supabase
    .from("nodes")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  const { data, error } = parentId
    ? await query.eq("parent_id", parentId)
    : await query.is("parent_id", null);
  if (error) throw error;
  const top = data?.[0]?.position ?? -1;
  return top + 1;
}

export async function createWorkspace(
  title: string
): Promise<CreateWorkspaceResult> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Workspace title is required");
  const actor = await getCurrentActor();

  const position = await nextPositionForSibling(null);

  const { data: workspace, error: wErr } = await supabase
    .from("nodes")
    .insert({
      instance_id: actor.instance_id,
      parent_id: null,
      type: "workspace",
      title: trimmed,
      owner_id: actor.id,
      position,
    })
    .select("id")
    .single();
  if (wErr) throw wErr;

  // Auto-seed "My First Stack" so new workspaces aren't empty.
  const { error: sErr } = await supabase.from("nodes").insert({
    instance_id: actor.instance_id,
    parent_id: workspace.id,
    type: "stack",
    title: "My First Stack",
    description: "A place to start — rename me anytime",
    owner_id: actor.id,
    position: 0,
  });
  if (sErr) throw sErr;

  revalidateRootNodes();
  // Layouts don't re-render on client nav; force the sidebar tree to refresh.
  revalidatePath("/", "layout");
  return { id: workspace.id };
}

export async function createStack(
  workspaceId: string,
  title: string
): Promise<CreateStackResult> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Stack title is required");
  const actor = await getCurrentActor();

  const position = await nextPositionForSibling(workspaceId);

  const { data: stack, error } = await supabase
    .from("nodes")
    .insert({
      instance_id: actor.instance_id,
      parent_id: workspaceId,
      type: "stack",
      title: trimmed,
      owner_id: actor.id,
      position,
    })
    .select("id")
    .single();
  if (error) throw error;

  revalidateWorkspaceBoard(workspaceId);
  revalidateNode(workspaceId, null);
  revalidatePath(`/n/${workspaceId}`);
  return { id: stack.id };
}

export async function createCard(
  stackId: string,
  workspaceId: string,
  title: string,
  columnFieldId?: string | null,
  columnOptionId?: string | null
): Promise<CreateCardResult> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Card title is required");
  const actor = await getCurrentActor();

  const position = await nextPositionForSibling(stackId);

  const { data: card, error } = await supabase
    .from("nodes")
    .insert({
      instance_id: actor.instance_id,
      parent_id: stackId,
      type: "card",
      title: trimmed,
      owner_id: actor.id,
      position,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Pre-populate the column field value so the card lands in the column the
  // user clicked "+ Add card" in. Skip for the unassigned column.
  if (columnFieldId && columnOptionId) {
    const { error: vErr } = await supabase.from("node_field_values").insert({
      node_id: card.id,
      field_id: columnFieldId,
      option_id: columnOptionId,
      position: 0,
    });
    if (vErr) throw vErr;
  }

  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
  return { id: card.id };
}
