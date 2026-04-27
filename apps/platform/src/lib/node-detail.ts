import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type {
  Actor,
  DataField,
  DataFieldOption,
  WorkNode,
} from "./types";

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

      const [ownerRes, fieldsRes, optionsRes, valuesRes, membershipsRes, childrenRes] =
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
        ]);

      if (ownerRes.error) throw ownerRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      if (valuesRes.error) throw valuesRes.error;
      if (childrenRes.error) throw childrenRes.error;

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

      return {
        node,
        owner: ownerRes.data ?? null,
        members: membersRes.data ?? [],
        ancestors,
        fields,
        values: valuesRes.data ?? [],
        children,
        childFieldValues,
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
