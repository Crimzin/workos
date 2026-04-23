import { unstable_cache } from "next/cache";

export const UNASSIGNED_COL_ID = "__unassigned__";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type { WorkNode } from "./types";

export interface BoardOption {
  id: string;
  name: string;
  position: number;
}

export interface BoardField {
  id: string;
  name: string;
  field_type: "single_select" | "multi_select";
  color: string;
  description: string | null;
  locked: boolean;
  options: BoardOption[];
}

export interface BoardCard {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  position: number;
  /** fieldId -> list of selected optionIds (single-select will have 0 or 1) */
  field_values: Record<string, string[]>;
}

export interface BoardStack {
  id: string;
  title: string;
  description: string | null;
  position: number;
  cards: BoardCard[];
}

export interface BoardData {
  workspace: WorkNode;
  stacks: BoardStack[];
  fields: BoardField[];
  defaultColumnFieldId: string | null;
}

/**
 * Fetch the full board payload in one round trip via the
 * `rpc_get_workspace_board` Postgres function (migration 0003).
 * Cached per-workspace; invalidate with revalidateWorkspaceBoard().
 */
export async function getWorkspaceBoard(
  workspaceId: string
): Promise<BoardData | null> {
  const cached = unstable_cache(
    async (): Promise<BoardData | null> => {
      const { data, error } = await supabase.rpc("rpc_get_workspace_board", {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      if (!data) return null;
      return data as BoardData;
    },
    ["workspace-board", workspaceId],
    {
      tags: [cacheTags.workspaceBoard(workspaceId)],
      revalidate: 300,
    }
  );
  return cached();
}
