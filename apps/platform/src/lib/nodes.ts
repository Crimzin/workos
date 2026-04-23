import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type { WorkNode } from "./types";

export async function getRootNodes(): Promise<WorkNode[]> {
  return cachedGetRootNodes();
}

const cachedGetRootNodes = unstable_cache(
  async (): Promise<WorkNode[]> => {
    const { data, error } = await supabase
      .from("nodes")
      .select("*")
      .is("parent_id", null)
      .is("archived_at", null)
      .order("position", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  ["root-nodes"],
  {
    tags: [cacheTags.rootNodes()],
    revalidate: 300,
  }
);

export async function getNode(id: string): Promise<WorkNode | null> {
  const cached = unstable_cache(
    async (): Promise<WorkNode | null> => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    ["node", id],
    {
      tags: [cacheTags.node(id)],
      revalidate: 300,
    }
  );
  return cached();
}

export async function getChildren(parentId: string): Promise<WorkNode[]> {
  const cached = unstable_cache(
    async (): Promise<WorkNode[]> => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("parent_id", parentId)
        .is("archived_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    ["node-children", parentId],
    {
      tags: [cacheTags.children(parentId)],
      revalidate: 300,
    }
  );
  return cached();
}
