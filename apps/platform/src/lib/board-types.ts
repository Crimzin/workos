export const UNASSIGNED_COL_ID = "__unassigned__";

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
  archived_at: string | null;
  /** True if this card has any mirror placements anywhere in the instance. */
  is_mirrored: boolean;
  /** fieldId -> list of selected optionIds (single-select will have 0 or 1) */
  field_values: Record<string, string[]>;
}

export interface BoardStack {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  position: number;
  archived_at: string | null;
  cards: BoardCard[];
  /** fieldId -> list of selected optionIds */
  field_values: Record<string, string[]>;
  /** True if this stack has any mirror placements anywhere in the instance. */
  is_mirrored: boolean;
  /** True if this appearance is via a node_mirrors row (not the home workspace). */
  is_mirror_here: boolean;
}

/** One entry in the "Appears in" list shown in the detail panel. */
export interface NodeMirrorPlacement {
  /** The parent node (workspace for stacks, stack for cards). */
  parent: { id: string; title: string; type: string };
  /** True only for the home parent (nodes.parent_id). */
  is_home: boolean;
  /** The node_mirrors row id — null for the home placement. */
  mirror_id: string | null;
  /** ISO timestamp; used for ordering (home = node.created_at). */
  created_at: string;
}

export interface BoardActor {
  id: string;
  name: string;
  kind: "human" | "agent";
  avatar_url: string | null;
}

export interface BoardData {
  workspace: import("./types").WorkNode;
  stacks: BoardStack[];
  fields: BoardField[];
  defaultColumnFieldId: string | null;
  actors: Record<string, BoardActor>;
}
