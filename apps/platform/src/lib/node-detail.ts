import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type {
  Actor,
  DataField,
  DataFieldOption,
  WorkNode,
} from "./types";
import type { NodeMirrorPlacement } from "./board-types";

export interface DetailField extends DataField {
  options: DataFieldOption[];
}

export interface DetailFieldValue {
  field_id: string;
  option_id: string | null;
  value_text: string | null;
  value_date: string | null;
}

export interface NodeAncestor {
  id: string;
  title: string;
  type: string;
}

export interface NodeDetail {
  node: WorkNode;
  owner: Pick<Actor, "id" | "name" | "kind"> | null;
  members: Pick<Actor, "id" | "name" | "kind">[];
  ancestors: NodeAncestor[];
  fields: DetailField[];
  values: DetailFieldValue[];
  children: WorkNode[];
  childFieldValues: Record<string, DetailFieldValue[]>;
  mirrorPlacements: NodeMirrorPlacement[];
}

export async function getNodeDetail(
  nodeId: string
): Promise<NodeDetail | null> {
  const cached = unstable_cache(
    async (): Promise<NodeDetail | null> => {
      const { data: node, error: nodeErr } = await supabase
        .from("nodes")
        .select("*")
        .eq("id", nodeId)
        .maybeSingle();
      if (nodeErr) throw nodeErr;
      if (!node) return null;

      // Fetch parent (needed for breadcrumb + grandparent lookup)
      const parentRes = node.parent_id
        ? await supabase
            .from("nodes")
            .select("id, title, type, parent_id")
            .eq("id", node.parent_id)
            .maybeSingle()
        : null;
      const parent = parentRes?.data ?? null;

      // Fetch grandparent (workspace when node is a card)
      const grandparentRes = parent?.parent_id
        ? await supabase
            .from("nodes")
            .select("id, title, type")
            .eq("id", parent.parent_id)
            .maybeSingle()
        : null;
      const grandparent = grandparentRes?.data ?? null;

      const ancestors: NodeAncestor[] = [grandparent, parent]
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map(({ id, title, type }) => ({ id, title, type }));

      const [ownerRes, fieldsRes, optionsRes, valuesRes, membershipsRes, childrenRes, mirrorsRes] =
        await Promise.all([
          node.owner_id
            ? supabase
                .from("actors")
                .select("id, name, kind")
                .eq("id", node.owner_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from("data_fields")
            .select("*")
            .eq("instance_id", node.instance_id)
            .order("position", { ascending: true }),
          supabase
            .from("data_field_options")
            .select("*")
            .order("position", { ascending: true }),
          supabase
            .from("node_field_values")
            .select("field_id, option_id, value_text, value_date")
            .eq("node_id", nodeId),
          supabase
            .from("node_members")
            .select("actor_id")
            .eq("node_id", nodeId),
          // Only fetch children for stack nodes (for Cards tab).
          // Include archived cards so the Cards tab can show/unarchive them.
          node.type === "stack"
            ? supabase
                .from("nodes")
                .select("*")
                .eq("parent_id", nodeId)
                .order("position", { ascending: true })
            : Promise.resolve({ data: [] as WorkNode[], error: null }),
          // Fetch mirror placements for the "Appears in" section.
          supabase
            .from("node_mirrors")
            .select("id, mirror_parent_id, created_at")
            .eq("node_id", nodeId)
            .order("created_at", { ascending: true }),
        ]);

      if (ownerRes.error) throw ownerRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      if (valuesRes.error) throw valuesRes.error;
      if (childrenRes.error) throw childrenRes.error;
      if (mirrorsRes.error) throw mirrorsRes.error;

      // Fetch member actor details
      const memberActorIds = (membershipsRes?.data ?? []).map(
        (m: { actor_id: string }) => m.actor_id
      );
      const membersRes =
        memberActorIds.length > 0
          ? await supabase
              .from("actors")
              .select("id, name, kind")
              .in("id", memberActorIds)
          : { data: [] as Pick<Actor, "id" | "name" | "kind">[], error: null };
      if (membersRes.error) throw membersRes.error;

      const optionsByField = new Map<string, DataFieldOption[]>();
      for (const opt of optionsRes.data ?? []) {
        const arr = optionsByField.get(opt.field_id) ?? [];
        arr.push(opt);
        optionsByField.set(opt.field_id, arr);
      }

      const fields: DetailField[] = (fieldsRes.data ?? []).map((f) => ({
        ...f,
        options: optionsByField.get(f.id) ?? [],
      }));

      // Fetch field values for child cards (for Cards tab badges)
      const children = (childrenRes.data ?? []) as WorkNode[];
      let childFieldValues: Record<string, DetailFieldValue[]> = {};
      if (children.length > 0) {
        const childIds = children.map((c) => c.id);
        const { data: cfvData } = await supabase
          .from("node_field_values")
          .select("node_id, field_id, option_id, value_text, value_date")
          .in("node_id", childIds);
        for (const row of cfvData ?? []) {
          const arr = childFieldValues[row.node_id] ?? [];
          arr.push({
            field_id: row.field_id,
            option_id: row.option_id,
            value_text: row.value_text,
            value_date: row.value_date,
          });
          childFieldValues[row.node_id] = arr;
        }
      }

      // Assemble "Appears in" placements.
      // Home placement is always first (nodes.parent_id / node.created_at).
      const mirrorRows = mirrorsRes.data ?? [];
      let mirrorPlacements: NodeMirrorPlacement[] = [];
      if (parent) {
        const homePlacement: NodeMirrorPlacement = {
          parent: { id: parent.id, title: parent.title, type: parent.type },
          is_home: true,
          mirror_id: null,
          created_at: node.created_at,
        };
        let otherPlacements: NodeMirrorPlacement[] = [];
        if (mirrorRows.length > 0) {
          const mirrorParentIds = mirrorRows.map((m: { mirror_parent_id: string }) => m.mirror_parent_id);
          const { data: mirrorParents } = await supabase
            .from("nodes")
            .select("id, title, type")
            .in("id", mirrorParentIds);
          const mirrorParentsById = Object.fromEntries(
            (mirrorParents ?? []).map((p: { id: string; title: string; type: string }) => [p.id, p])
          );
          otherPlacements = mirrorRows
            .filter((m: { mirror_parent_id: string }) => mirrorParentsById[m.mirror_parent_id])
            .map((m: { id: string; mirror_parent_id: string; created_at: string }) => ({
              parent: mirrorParentsById[m.mirror_parent_id],
              is_home: false,
              mirror_id: m.id,
              created_at: m.created_at,
            }));
        }
        mirrorPlacements = [homePlacement, ...otherPlacements];
      }

      return {
        node,
        owner: ownerRes.data ?? null,
        members: membersRes.data ?? [],
        ancestors,
        fields,
        values: valuesRes.data ?? [],
        children,
        childFieldValues,
        mirrorPlacements,
      };
    },
    ["node-detail", nodeId],
    {
      tags: [cacheTags.node(nodeId)],
      revalidate: 300,
    }
  );
  return cached();
}

/**
 * Returns all candidate parent nodes for mirroring the given node type.
 * For stacks: returns workspaces (where the stack can be mirrored into).
 * For cards:  returns stacks (where the card can be mirrored into).
 * Called server-side at panel render time; results passed as props to MirrorsSection.
 */
export async function getMirrorTargets(
  instanceId: string,
  nodeType: "stack" | "card"
): Promise<{ id: string; title: string; type: string }[]> {
  const targetType = nodeType === "stack" ? "workspace" : "stack";
  const { data, error } = await supabase
    .from("nodes")
    .select("id, title, type")
    .eq("instance_id", instanceId)
    .eq("type", targetType)
    .is("archived_at", null)
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { id: string; title: string; type: string }[];
}

/**
 * Returns the number of mirror placements for a node.
 * Not cached — called on demand before showing delete confirmations.
 */
export async function getNodeMirrorCount(nodeId: string): Promise<number> {
  const { count, error } = await supabase
    .from("node_mirrors")
    .select("id", { count: "exact", head: true })
    .eq("node_id", nodeId);
  if (error) throw error;
  return count ?? 0;
}
