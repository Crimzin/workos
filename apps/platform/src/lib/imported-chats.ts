import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { SourceApp, WorkNode } from "./types";

export interface ImportedChatRow extends WorkNode {
  source_app: Exclude<SourceApp, "workos">;
}

export async function getImportedChats(
  instanceId: string
): Promise<ImportedChatRow[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("source_kind", "imported_ai_chat")
        .eq("imported_visibility", "visible")
        .is("archived_at", null)
        .order("source_updated_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImportedChatRow[];
    },
    [`imported-chats-${instanceId}`],
    { tags: [cacheTags.importedChats(instanceId)], revalidate: 300 }
  )();
}
