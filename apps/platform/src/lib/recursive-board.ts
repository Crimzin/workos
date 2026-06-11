import type { BoardActor, BoardData, BoardField, BoardStack } from "./board-types";
import type { WorkNode } from "./types";

export type RecursiveBoardNodeRow = WorkNode;

export interface RecursiveBoardFieldValueRow {
  node_id: string;
  field_id: string;
  option_id: string | null;
}

export interface RecursiveBoardMirrorRow {
  node_id: string;
  mirror_parent_id: string;
  position: number;
}

export interface BuildRecursiveBoardDataInput {
  root: RecursiveBoardNodeRow;
  rows: RecursiveBoardNodeRow[];
  fields: BoardField[];
  fieldValues: RecursiveBoardFieldValueRow[];
  mirrorRows: RecursiveBoardMirrorRow[];
  mirroredNodeIds: Set<string>;
  actors: Record<string, BoardActor>;
}

export function buildRecursiveBoardData({
  root,
  rows,
  fields,
  fieldValues,
  mirrorRows,
  mirroredNodeIds,
  actors,
}: BuildRecursiveBoardDataInput): BoardData {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const fieldValuesByNode = buildFieldValuesByNode(fieldValues);

  const stackAppearances = [
    ...rows
      .filter((row) => row.parent_id === root.id)
      .map((row) => ({
        row,
        position: row.position,
        isMirrorHere: false,
      })),
    ...mirrorRows
      .filter((mirror) => mirror.mirror_parent_id === root.id)
      .flatMap((mirror) => {
        const row = rowsById.get(mirror.node_id);
        return row
          ? [{ row, position: mirror.position, isMirrorHere: true }]
          : [];
      }),
  ].sort((a, b) => a.position - b.position);

  const stacks: BoardStack[] = stackAppearances.map(({ row, position, isMirrorHere }) => {
    const cardAppearances = [
      ...rows
        .filter((card) => card.parent_id === row.id)
        .map((card) => ({
          row: card,
          position: card.position,
          isMirrorHere: false,
        })),
      ...mirrorRows
        .filter((mirror) => mirror.mirror_parent_id === row.id)
        .flatMap((mirror) => {
          const card = rowsById.get(mirror.node_id);
          return card
            ? [{ row: card, position: mirror.position, isMirrorHere: true }]
            : [];
        }),
    ].sort((a, b) => a.position - b.position);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      owner_id: row.owner_id,
      position,
      stack_lifecycle_status: row.stack_lifecycle_status,
      archived_at: row.archived_at,
      is_mirror_here: isMirrorHere,
      is_mirrored: mirroredNodeIds.has(row.id),
      field_values: fieldValuesByNode[row.id] ?? {},
      cards: cardAppearances.map((appearance) => ({
        id: appearance.row.id,
        title: appearance.row.title,
        description: appearance.row.description,
        owner_id: appearance.row.owner_id,
        position: appearance.position,
        archived_at: appearance.row.archived_at,
        is_mirror_here: appearance.isMirrorHere,
        is_mirrored: appearance.isMirrorHere || mirroredNodeIds.has(appearance.row.id),
        field_values: fieldValuesByNode[appearance.row.id] ?? {},
        dnd_id: `${appearance.row.id}:${row.id}`,
      })),
      mirror_cards: [],
    };
  });

  return {
    workspace: root,
    stacks,
    fields,
    defaultColumnFieldId: fields[0]?.id ?? null,
    actors,
  };
}

function buildFieldValuesByNode(
  values: RecursiveBoardFieldValueRow[]
): Record<string, Record<string, string[]>> {
  const byNode: Record<string, Record<string, string[]>> = {};

  for (const value of values) {
    if (!value.option_id) continue;
    const nodeValues = (byNode[value.node_id] ??= {});
    const fieldValues = (nodeValues[value.field_id] ??= []);
    fieldValues.push(value.option_id);
  }

  return byNode;
}
