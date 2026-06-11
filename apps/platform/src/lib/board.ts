import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { cacheTags } from "./cache";
import type { BoardActor, BoardData, BoardField } from "./board-types";
import {
  buildRecursiveBoardData,
  type RecursiveBoardFieldValueRow,
  type RecursiveBoardMirrorRow,
  type RecursiveBoardNodeRow,
} from "./recursive-board";

export { UNASSIGNED_COL_ID } from "./board-types";
export type { BoardOption, BoardField, BoardCard, BoardStack, BoardData, BoardActor } from "./board-types";
export {
  buildRecursiveBoardData,
  type RecursiveBoardFieldValueRow,
  type RecursiveBoardMirrorRow,
  type RecursiveBoardNodeRow,
} from "./recursive-board";

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

      // Merge mirror_cards into cards with compound dnd_id (`${cardId}:${stackId}`).
      // All appearances become equal peers in the same sortable list — there is
      // no functional distinction between home and mirror copies on the board.
      board.stacks = board.stacks.map((s) => ({
        ...s,
        cards: [
          ...s.cards.map((c) => ({ ...c, dnd_id: `${c.id}:${s.id}` })),
          ...(s.mirror_cards ?? []).map((c) => ({ ...c, dnd_id: `${c.id}:${s.id}` })),
        ],
        mirror_cards: [],
      }));

      // Fetch actors for avatar rendering.
      const instanceId = (board.workspace as { instance_id?: string }).instance_id;
      if (instanceId) {
        const { data: actorRows } = await supabase
          .from("actors")
          .select("id, name, kind, avatar_url")
          .eq("instance_id", instanceId);
        const actors: Record<string, BoardActor> = {};
        for (const a of actorRows ?? []) actors[a.id] = a as BoardActor;
        board.actors = actors;
      } else {
        board.actors = {};
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

export async function getNodeBoard(nodeId: string): Promise<BoardData | null> {
  const cached = unstable_cache(
    async (): Promise<BoardData | null> => {
      const { data: root, error: rootErr } = await supabase
        .from("nodes")
        .select("*")
        .eq("id", nodeId)
        .maybeSingle();
      if (rootErr) throw rootErr;
      if (!root || root.archived_at) return null;

      const [
        homeStacksRes,
        stackMirrorsRes,
        fieldsRes,
        optionsRes,
        actorRowsRes,
      ] = await Promise.all([
        supabase
          .from("nodes")
          .select("*")
          .eq("parent_id", nodeId)
          .order("position", { ascending: true }),
        supabase
          .from("node_mirrors")
          .select("node_id, mirror_parent_id, position")
          .eq("mirror_parent_id", nodeId)
          .order("position", { ascending: true }),
        supabase
          .from("data_fields")
          .select("*")
          .eq("instance_id", root.instance_id)
          .in("field_type", ["single_select", "multi_select"])
          .order("position", { ascending: true }),
        supabase
          .from("data_field_options")
          .select("*")
          .order("position", { ascending: true }),
        supabase
          .from("actors")
          .select("id, name, kind, avatar_url")
          .eq("instance_id", root.instance_id),
      ]);

      if (homeStacksRes.error) throw homeStacksRes.error;
      if (stackMirrorsRes.error) throw stackMirrorsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      if (actorRowsRes.error) throw actorRowsRes.error;

      const stackMirrorRows = (stackMirrorsRes.data ?? []) as RecursiveBoardMirrorRow[];
      const mirrorStackIds = stackMirrorRows.map((row) => row.node_id);
      const { data: mirrorStacks, error: mirrorStacksErr } = mirrorStackIds.length
        ? await supabase.from("nodes").select("*").in("id", mirrorStackIds)
        : { data: [] as RecursiveBoardNodeRow[], error: null };
      if (mirrorStacksErr) throw mirrorStacksErr;

      const stackRows = [
        ...((homeStacksRes.data ?? []) as RecursiveBoardNodeRow[]),
        ...((mirrorStacks ?? []) as RecursiveBoardNodeRow[]),
      ];
      const stackIds = stackRows.map((row) => row.id);

      const [homeCardsRes, cardMirrorsRes] = stackIds.length
        ? await Promise.all([
            supabase
              .from("nodes")
              .select("*")
              .in("parent_id", stackIds)
              .order("position", { ascending: true }),
            supabase
              .from("node_mirrors")
              .select("node_id, mirror_parent_id, position")
              .in("mirror_parent_id", stackIds)
              .order("position", { ascending: true }),
          ])
        : [
            { data: [] as RecursiveBoardNodeRow[], error: null },
            { data: [] as RecursiveBoardMirrorRow[], error: null },
          ];
      if (homeCardsRes.error) throw homeCardsRes.error;
      if (cardMirrorsRes.error) throw cardMirrorsRes.error;

      const cardMirrorRows = (cardMirrorsRes.data ?? []) as RecursiveBoardMirrorRow[];
      const mirrorCardIds = cardMirrorRows.map((row) => row.node_id);
      const { data: mirrorCards, error: mirrorCardsErr } = mirrorCardIds.length
        ? await supabase.from("nodes").select("*").in("id", mirrorCardIds)
        : { data: [] as RecursiveBoardNodeRow[], error: null };
      if (mirrorCardsErr) throw mirrorCardsErr;

      const rows = dedupeRows([
        ...stackRows,
        ...((homeCardsRes.data ?? []) as RecursiveBoardNodeRow[]),
        ...((mirrorCards ?? []) as RecursiveBoardNodeRow[]),
      ]);
      const boardNodeIds = rows.map((row) => row.id);

      const [fieldValuesRes, mirroredIdsRes] = boardNodeIds.length
        ? await Promise.all([
            supabase
              .from("node_field_values")
              .select("node_id, field_id, option_id")
              .in("node_id", boardNodeIds)
              .not("option_id", "is", null),
            supabase
              .from("node_mirrors")
              .select("node_id")
              .in("node_id", boardNodeIds),
          ])
        : [
            { data: [] as RecursiveBoardFieldValueRow[], error: null },
            { data: [] as { node_id: string }[], error: null },
          ];
      if (fieldValuesRes.error) throw fieldValuesRes.error;
      if (mirroredIdsRes.error) throw mirroredIdsRes.error;

      const optionsByField = new Map<string, import("./types").DataFieldOption[]>();
      for (const option of optionsRes.data ?? []) {
        const options = optionsByField.get(option.field_id) ?? [];
        options.push(option);
        optionsByField.set(option.field_id, options);
      }

      const fields: BoardField[] = (fieldsRes.data ?? []).map((field) => ({
        ...field,
        options: optionsByField.get(field.id) ?? [],
      }));

      const actors: Record<string, BoardActor> = {};
      for (const actor of actorRowsRes.data ?? []) actors[actor.id] = actor as BoardActor;

      return buildRecursiveBoardData({
        root: root as RecursiveBoardNodeRow,
        rows,
        fields,
        fieldValues: (fieldValuesRes.data ?? []) as RecursiveBoardFieldValueRow[],
        mirrorRows: [...stackMirrorRows, ...cardMirrorRows],
        mirroredNodeIds: new Set((mirroredIdsRes.data ?? []).map((row) => row.node_id)),
        actors,
      });
    },
    ["node-board", nodeId],
    {
      tags: [cacheTags.workspaceBoard(nodeId)],
      revalidate: 300,
    }
  );
  return cached();
}

function dedupeRows(rows: RecursiveBoardNodeRow[]): RecursiveBoardNodeRow[] {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}
