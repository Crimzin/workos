"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import {
  revalidateRootNodes,
  revalidateNode,
  revalidateWorkspaceBoard,
  revalidateNodePosts,
  revalidateWorkspaceFeed,
} from "../cache";

export async function archiveNode(
  nodeId: string,
  workspaceId: string,
  parentId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("nodes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", nodeId);
  if (error) throw error;

  revalidateNode(nodeId, parentId);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
  if (!parentId) {
    revalidateRootNodes();
    revalidatePath("/", "layout");
  }
}

export async function unarchiveNode(
  nodeId: string,
  workspaceId: string,
  parentId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("nodes")
    .update({ archived_at: null })
    .eq("id", nodeId);
  if (error) throw error;

  revalidateNode(nodeId, parentId);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
  if (!parentId) {
    revalidateRootNodes();
    revalidatePath("/", "layout");
  }
}

export async function deleteNode(
  nodeId: string,
  workspaceId: string,
  parentId: string | null
): Promise<void> {
  // ON DELETE CASCADE on parent_id means deleting a stack cascades to its cards.
  // ON DELETE CASCADE on node_id in node_field_values cleans up field values.
  const { error } = await supabase.from("nodes").delete().eq("id", nodeId);
  if (error) throw error;

  revalidateNode(nodeId, parentId);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
  if (!parentId) {
    revalidateRootNodes();
    revalidatePath("/", "layout");
  }
}

export async function moveStackUpDown(
  stackId: string,
  workspaceId: string,
  direction: "up" | "down"
): Promise<void> {
  const { data: stacks, error } = await supabase
    .from("nodes")
    .select("id, position")
    .eq("parent_id", workspaceId)
    .eq("type", "stack")
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  if (!stacks) return;

  const idx = stacks.findIndex((s) => s.id === stackId);
  if (idx === -1) return;
  const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= stacks.length) return;

  const curr = stacks[idx];
  const neighbor = stacks[neighborIdx];
  await Promise.all([
    supabase.from("nodes").update({ position: neighbor.position }).eq("id", curr.id),
    supabase.from("nodes").update({ position: curr.position }).eq("id", neighbor.id),
  ]);

  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

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

// ---------------------------------------------------------------------------
// Mirroring
// ---------------------------------------------------------------------------

/**
 * Mirrors a node (stack or card) into an additional parent context.
 * - For stacks: mirrorParentId = target workspace id
 * - For cards:  mirrorParentId = target stack id
 * Pass homeWorkspaceId and targetWorkspaceId so both boards are revalidated.
 */
export async function mirrorNode(
  nodeId: string,
  mirrorParentId: string,
  homeWorkspaceId: string,
  targetWorkspaceId: string
): Promise<void> {
  // Guard: don't allow mirroring into the node's own home parent.
  const { data: node } = await supabase
    .from("nodes")
    .select("parent_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (node?.parent_id === mirrorParentId) return;

  // Next position in the mirror parent context.
  const { data: posRows } = await supabase
    .from("node_mirrors")
    .select("position")
    .eq("mirror_parent_id", mirrorParentId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = ((posRows?.[0]?.position) ?? -1) + 1;

  const { error } = await supabase.from("node_mirrors").insert({
    node_id: nodeId,
    mirror_parent_id: mirrorParentId,
    position: nextPos,
  });
  if (error) throw error;

  revalidateNode(nodeId, null);
  revalidateWorkspaceBoard(homeWorkspaceId);
  revalidateWorkspaceBoard(targetWorkspaceId);
  revalidatePath(`/n/${homeWorkspaceId}`);
  revalidatePath(`/n/${targetWorkspaceId}`);
}

/**
 * Removes a mirror placement for a node.
 * The node and its home placement are not affected.
 */
export async function unmirrorNode(
  nodeId: string,
  mirrorParentId: string,
  affectedWorkspaceId: string
): Promise<void> {
  const { error } = await supabase
    .from("node_mirrors")
    .delete()
    .eq("node_id", nodeId)
    .eq("mirror_parent_id", mirrorParentId);
  if (error) throw error;

  revalidateNode(nodeId, null);
  revalidateWorkspaceBoard(affectedWorkspaceId);
  revalidatePath(`/n/${affectedWorkspaceId}`);
}

/**
 * Remove a card from a specific stack, handling both home and mirror appearances.
 * - Mirror appearance: removes the node_mirrors row.
 * - Home appearance with other mirrors: promotes the oldest mirror placement to home.
 * - Home appearance with no other mirrors: no-op (card would be orphaned; caller should use deleteNode).
 */
export async function removeCardFromStack(
  cardId: string,
  stackId: string,
  workspaceId: string
): Promise<void> {
  const { data: node } = await supabase
    .from("nodes")
    .select("parent_id")
    .eq("id", cardId)
    .maybeSingle();

  if (node?.parent_id === stackId) {
    // Home context — promote the oldest mirror to the new home.
    const { data: mirrors } = await supabase
      .from("node_mirrors")
      .select("mirror_parent_id, position")
      .eq("node_id", cardId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (!mirrors?.length) return; // No other appearances — can't remove from last stack.

    const newHome = mirrors[0];
    const { error: nodeErr } = await supabase
      .from("nodes")
      .update({ parent_id: newHome.mirror_parent_id, position: newHome.position })
      .eq("id", cardId);
    if (nodeErr) throw nodeErr;

    const { error: mirrorErr } = await supabase
      .from("node_mirrors")
      .delete()
      .eq("node_id", cardId)
      .eq("mirror_parent_id", newHome.mirror_parent_id);
    if (mirrorErr) throw mirrorErr;
  } else {
    // Mirror context — just remove the mirror row.
    const { error } = await supabase
      .from("node_mirrors")
      .delete()
      .eq("node_id", cardId)
      .eq("mirror_parent_id", stackId);
    if (error) throw error;
  }

  revalidateNode(cardId, null);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

/**
 * Returns all stacks across the entire instance that don't already contain the card.
 * Current-workspace stacks come first (no subtitle); stacks from other workspaces
 * follow sorted by workspace name and carry a `subtitle` (workspace name) so the
 * picker can disambiguate them. Also returns `workspaceId` per stack so callers
 * can pass the correct targetWorkspaceId to mirrorNode.
 */
export async function getStacksForCard(
  cardId: string,
  workspaceId: string
): Promise<{ id: string; title: string; workspaceId: string; subtitle?: string }[]> {
  // Resolve the instance_id from the current workspace.
  const { data: currentWs } = await supabase
    .from("nodes")
    .select("instance_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!currentWs?.instance_id) return [];

  // Fetch everything in parallel: all workspaces, card's home stack, existing mirrors.
  const [{ data: allWorkspaces }, { data: cardNode }, { data: mirrors }] = await Promise.all([
    supabase
      .from("nodes")
      .select("id, title")
      .eq("instance_id", currentWs.instance_id)
      .eq("type", "workspace")
      .is("archived_at", null),
    supabase.from("nodes").select("parent_id").eq("id", cardId).maybeSingle(),
    supabase.from("node_mirrors").select("mirror_parent_id").eq("node_id", cardId),
  ]);

  const workspaceIds = (allWorkspaces ?? []).map((w) => w.id);
  if (!workspaceIds.length) return [];

  // Fetch all non-archived stacks across all workspaces in the instance.
  const { data: allStacks } = await supabase
    .from("nodes")
    .select("id, title, position, parent_id")
    .in("parent_id", workspaceIds)
    .eq("type", "stack")
    .is("archived_at", null)
    .order("position", { ascending: true });

  if (!allStacks?.length) return [];

  // Build a workspace name lookup.
  const wsNames = new Map((allWorkspaces ?? []).map((w) => [w.id, w.title as string]));

  // Filter out stacks where the card already appears.
  const occupied = new Set<string>();
  if (cardNode?.parent_id) occupied.add(cardNode.parent_id);
  for (const m of mirrors ?? []) occupied.add(m.mirror_parent_id);

  const available = allStacks.filter((s) => !occupied.has(s.id));

  // Current-workspace stacks first (sorted by position), then other workspaces
  // sorted by workspace name then position.
  const sameWs = available.filter((s) => s.parent_id === workspaceId);
  const otherWs = available
    .filter((s) => s.parent_id !== workspaceId)
    .sort((a, b) => {
      const wa = wsNames.get(a.parent_id) ?? "";
      const wb = wsNames.get(b.parent_id) ?? "";
      if (wa !== wb) return wa.localeCompare(wb);
      return a.position - b.position;
    });

  return [
    ...sameWs.map((s) => ({ id: s.id, title: s.title, workspaceId: s.parent_id })),
    ...otherWs.map((s) => ({
      id: s.id,
      title: s.title,
      workspaceId: s.parent_id,
      subtitle: wsNames.get(s.parent_id),
    })),
  ];
}

/**
 * Returns workspaces in the same instance that don't already contain the given stack.
 * Used to populate the "Mirror to…" submenu in the stack QUAM.
 */
export async function getWorkspacesForStack(
  stackId: string,
  currentWorkspaceId: string
): Promise<{ id: string; title: string }[]> {
  const { data: workspace } = await supabase
    .from("nodes")
    .select("instance_id")
    .eq("id", currentWorkspaceId)
    .maybeSingle();

  if (!workspace?.instance_id) return [];

  const [{ data: allWorkspaces }, { data: stackNode }, { data: mirrors }] = await Promise.all([
    supabase
      .from("nodes")
      .select("id, title")
      .eq("instance_id", workspace.instance_id)
      .eq("type", "workspace")
      .is("archived_at", null)
      .order("position", { ascending: true }),
    supabase.from("nodes").select("parent_id").eq("id", stackId).maybeSingle(),
    supabase.from("node_mirrors").select("mirror_parent_id").eq("node_id", stackId),
  ]);

  if (!allWorkspaces?.length) return [];

  const occupied = new Set<string>();
  if (stackNode?.parent_id) occupied.add(stackNode.parent_id);
  for (const m of mirrors ?? []) occupied.add(m.mirror_parent_id);

  return allWorkspaces.filter((w) => !occupied.has(w.id));
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

  // Log a card_created activity post on the parent stack.
  await supabase.from("posts").insert({
    node_id: stackId,
    actor_id: actor.id,
    post_type: "card_created",
    metadata: { card_id: card.id, card_title: trimmed },
  });

  revalidateWorkspaceBoard(workspaceId);
  revalidateNodePosts(stackId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
  return { id: card.id };
}
