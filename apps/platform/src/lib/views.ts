import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";

export interface ViewFilter {
  fieldId: string;
  optionIds: string[];
}

export interface WorkspaceView {
  id: string;
  workspace_id: string;
  name: string;
  starred: boolean;
  column_field_id: string | null;
  filters: ViewFilter[];
}

export async function getWorkspaceViews(workspaceId: string): Promise<WorkspaceView[]> {
  const cached = unstable_cache(
    async (): Promise<WorkspaceView[]> => {
      const { data, error } = await supabase
        .from("workspace_views")
        .select("id, workspace_id, name, starred, column_field_id, filters")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkspaceView[];
    },
    ["workspace-views", workspaceId],
    {
      tags: [cacheTags.workspaceViews(workspaceId)],
      revalidate: 300,
    }
  );
  return cached();
}
