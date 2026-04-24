import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type { BoardData } from "./board-types";

export { UNASSIGNED_COL_ID } from "./board-types";
export type { BoardOption, BoardField, BoardCard, BoardStack, BoardData } from "./board-types";

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
