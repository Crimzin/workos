import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type {
  Actor,
  DataField,
  DataFieldOption,
  NodeFieldValue,
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

export interface NodeDetail {
  node: WorkNode;
  owner: Pick<Actor, "id" | "name" | "kind"> | null;
  fields: DetailField[];
  values: DetailFieldValue[];
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

      const [ownerRes, fieldsRes, optionsRes, valuesRes] = await Promise.all([
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
      ]);

      if (ownerRes.error) throw ownerRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      if (valuesRes.error) throw valuesRes.error;

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

      return {
        node,
        owner: ownerRes.data ?? null,
        fields,
        values: valuesRes.data ?? [],
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
