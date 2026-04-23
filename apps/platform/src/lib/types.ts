export type NodeType = "workspace" | "stack" | "card";

export type ActorKind = "human" | "agent";
export type AgentType = "claude" | "claude_code" | "swarm" | "brainshare";

export type FieldType = "single_select" | "multi_select" | "text" | "date";

export interface Instance {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Actor {
  id: string;
  instance_id: string;
  kind: ActorKind;
  name: string;
  agent_type: AgentType | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkNode {
  id: string;
  instance_id: string;
  parent_id: string | null;
  type: NodeType;
  title: string;
  description: string | null;
  owner_id: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataField {
  id: string;
  instance_id: string;
  name: string;
  field_type: FieldType;
  color: string;
  description: string | null;
  locked: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DataFieldOption {
  id: string;
  field_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface NodeFieldValue {
  id: string;
  node_id: string;
  field_id: string;
  option_id: string | null;
  value_text: string | null;
  value_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}
