import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { MemoryPrimitive, MemoryPrimitiveType } from "./types";

export interface NodeMemoryPrimitives {
  rationale: MemoryPrimitive | null;
  assumptions: MemoryPrimitive[];
  decisions: MemoryPrimitive[];
}

export function getNodeMemoryPrimitives(
  nodeId: string
): Promise<NodeMemoryPrimitives> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("memory_primitives")
        .select("*, created_by_actor:actors(id,name,kind)")
        .eq("node_id", nodeId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const primitives = (data ?? []) as MemoryPrimitive[];
      return {
        rationale: primitives.find((p) => p.type === "rationale") ?? null,
        assumptions: primitives.filter((p) => p.type === "assumption"),
        decisions: primitives.filter((p) => p.type === "decision"),
      };
    },
    [`memory-primitives-node-${nodeId}`],
    { tags: [cacheTags.nodeMemoryPrimitives(nodeId)], revalidate: false }
  )();
}

export function statusForPrimitiveType(type: MemoryPrimitiveType): string {
  if (type === "assumption") return "untested";
  return "active";
}
