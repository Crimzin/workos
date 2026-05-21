import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";

export interface NodePathRow {
  id: string;
  title: string;
  type: string;
  parent_id: string | null;
}

export interface NodePathItem {
  id: string;
  title: string;
  type: string;
}

export function buildNodePathFromRows(
  nodeId: string,
  rows: NodePathRow[]
): NodePathItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: NodePathItem[] = [];
  const seen = new Set<string>();
  let cursor: string | null = nodeId;

  while (cursor) {
    if (seen.has(cursor)) {
      throw new Error("Cycle detected while building node path");
    }
    seen.add(cursor);

    const row = byId.get(cursor);
    if (!row) return [];
    path.push({ id: row.id, title: row.title, type: row.type });
    cursor = row.parent_id;
  }

  return path.reverse();
}

export async function getNodePath(nodeId: string): Promise<NodePathItem[]> {
  const cached = unstable_cache(
    async (): Promise<NodePathItem[]> => {
      const { supabase } = await import("./supabase");
      const rows: NodePathRow[] = [];
      const seen = new Set<string>();
      let cursor: string | null = nodeId;

      while (cursor) {
        if (seen.has(cursor)) {
          throw new Error("Cycle detected while fetching node path");
        }
        seen.add(cursor);

        const { data, error } = await supabase
          .from("nodes")
          .select("id, title, type, parent_id")
          .eq("id", cursor)
          .maybeSingle();
        if (error) throw error;
        if (!data) return [];

        rows.push(data as NodePathRow);
        cursor = data.parent_id;
      }

      return rows
        .map(({ id, title, type }) => ({ id, title, type }))
        .reverse();
    },
    ["node-path", nodeId],
    {
      tags: [cacheTags.nodePath(nodeId)],
      revalidate: 300,
    }
  );

  return cached();
}
