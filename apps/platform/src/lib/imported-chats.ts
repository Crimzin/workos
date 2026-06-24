import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import type { SourceApp, WorkNode } from "./types";

type ImportedSourceApp = Exclude<SourceApp, "workos">;

export interface ImportedChatRow extends WorkNode {
  source_app: ImportedSourceApp;
}

export async function getImportedChats(
  instanceId: string
): Promise<ImportedChatRow[]> {
  return unstable_cache(
    async () => {
      const { supabase } = await import("./supabase");
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
      return toImportedChatRows((data ?? []) as WorkNode[]);
    },
    [`imported-chats-${instanceId}`],
    { tags: [cacheTags.importedChats(instanceId)], revalidate: 300 }
  )();
}

export function toImportedChatRows(nodes: WorkNode[]): ImportedChatRow[] {
  return nodes.filter((node): node is ImportedChatRow => {
    return (
      node.source_kind === "imported_ai_chat" &&
      isImportedSourceApp(node.source_app)
    );
  });
}

function isImportedSourceApp(value: unknown): value is ImportedSourceApp {
  return value === "claude" || value === "chatgpt" || value === "unknown";
}
