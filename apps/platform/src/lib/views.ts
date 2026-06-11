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
  stack_filters: ViewFilter[];
  hidden_stack_ids: string[];
  collapsed_column_ids: string[];
  stack_column_fields: Record<string, string | null>;
}

export async function getWorkspaceViews(workspaceId: string): Promise<WorkspaceView[]> {
  const cached = unstable_cache(
    async (): Promise<WorkspaceView[]> => {
      const { data, error } = await supabase
        .from("workspace_views")
        .select("id, workspace_id, name, starred, column_field_id, filters, stack_filters, hidden_stack_ids, collapsed_column_ids, stack_column_fields")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) return data as WorkspaceView[];

      const { data: created, error: createErr } = await supabase
        .from("workspace_views")
        .insert({
          workspace_id: workspaceId,
          name: "Default",
          starred: true,
        })
        .select("id, workspace_id, name, starred, column_field_id, filters, stack_filters, hidden_stack_ids, collapsed_column_ids, stack_column_fields")
        .single();
      if (createErr) throw createErr;
      return [created as WorkspaceView];
    },
    ["workspace-views", workspaceId],
    {
      tags: [cacheTags.workspaceViews(workspaceId)],
      revalidate: 300,
    }
  );
  return cached();
}
