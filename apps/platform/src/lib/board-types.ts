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
  /** fieldId -> list of selected optionIds (single-select will have 0 or 1) */
  field_values: Record<string, string[]>;
}

export interface BoardStack {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  position: number;
  cards: BoardCard[];
  /** fieldId -> list of selected optionIds */
  field_values: Record<string, string[]>;
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
