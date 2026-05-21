export type NodeType = "workspace" | "stack" | "card";

export type ActorKind = "human" | "agent";
export type AgentType =
  | "claude"
  | "claude_code"
  | "codex"
  | "swarm"
  | "brainshare";

export type FieldType = "single_select" | "multi_select" | "text" | "date";

export type MemoryPrimitiveType = "rationale" | "assumption" | "decision";
export type AssumptionStatus = "untested" | "validated" | "invalidated";
export type DecisionStatus = "active" | "superseded" | "reversed";
export type MemoryPrimitiveStatus =
  | "active"
  | AssumptionStatus
  | DecisionStatus;
export type StackLifecycleStatus =
  | "prioritized"
  | "deprioritized"
  | "completed"
  | "archived";

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
  stack_lifecycle_status: StackLifecycleStatus;
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

export interface MemoryPrimitive {
  id: string;
  instance_id: string;
  node_id: string;
  type: MemoryPrimitiveType;
  statement: string;
  body: string | null;
  status: MemoryPrimitiveStatus;
  conviction: number;
  metadata: Record<string, unknown>;
  source_post_id: string | null;
  source_label: string | null;
  external_episode_id: string | null;
  created_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_actor?: Pick<Actor, "id" | "name" | "kind"> | null;
}

export type AIStandardCategory = "interaction" | "output" | "execution";
export type AIStandardMode = "latent" | "visible_when_useful";
export type AIStandardSource = "default" | "override" | "custom";

export interface AIStandard {
  id?: string;
  instance_id?: string;
  standard_key: string;
  category: AIStandardCategory;
  title: string;
  instruction: string;
  mode: AIStandardMode;
  enabled: boolean;
  position: number;
  source: AIStandardSource;
  created_at?: string;
  updated_at?: string;
}

export type AgentCapability =
  | "chat"
  | "code"
  | "shell"
  | "git"
  | "browser"
  | "github"
  | "database"
  | "web";

export type AgentRunStatus =
  | "mentioned"
  | "planning"
  | "awaiting_confirmation"
  | "queued"
  | "running"
  | "needs_input"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentProviderKey = "inline_claude" | "codex" | "claude_code";
export type AgentToolKey = "aidex";
export type AgentToolStatus = "available" | "missing" | "stale" | "disabled";

export interface AgentActorCapabilityRecord {
  id: string;
  actor_id: string;
  capability: AgentCapability;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  instance_id: string;
  workspace_id: string;
  target_node_id: string;
  trigger_post_id: string;
  requester_actor_id: string;
  agent_actor_id: string;
  provider_key: AgentProviderKey;
  status: AgentRunStatus;
  branch_name: string | null;
  worktree_path: string | null;
  summary: string | null;
  error: string | null;
  plan_body: string | null;
  confirmation_post_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentProviderSetting {
  id: string;
  instance_id: string;
  provider_key: AgentProviderKey;
  label: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentToolSetting {
  id: string;
  instance_id: string;
  tool_key: AgentToolKey;
  label: string;
  status: AgentToolStatus;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
