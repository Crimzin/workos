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

      const board = data as BoardData;

      // RPC only returns card field_values; fetch stack field_values separately.
      const stackIds = board.stacks.map((s) => s.id);
      if (stackIds.length > 0) {
        const { data: sfv } = await supabase
          .from("node_field_values")
          .select("node_id, field_id, option_id")
          .in("node_id", stackIds)
          .not("option_id", "is", null);

        const byStack: Record<string, Record<string, string[]>> = {};
        for (const row of sfv ?? []) {
          const stackVals = (byStack[row.node_id] ??= {});
          const opts = (stackVals[row.field_id] ??= []);
          opts.push(row.option_id);
        }
        board.stacks = board.stacks.map((s) => ({
          ...s,
          field_values: byStack[s.id] ?? {},
        }));
      } else {
        board.stacks = board.stacks.map((s) => ({ ...s, field_values: {} }));
      }

      return board;
    },
    ["workspace-board", workspaceId],
    {
      tags: [cacheTags.workspaceBoard(workspaceId)],
      revalidate: 300,
    }
  );
  return cached();
}
