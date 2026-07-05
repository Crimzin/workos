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
export type AccountMemoryCategory =
  | "identity"
  | "role"
  | "current_project"
  | "standing_goal"
  | "preference"
  | "communication_style"
  | "writing_voice"
  | "recurring_constraint"
  | "tool_context"
  | "relationship"
  | "correction"
  | "sensitive_fact"
  | "work_standard";
export type AccountMemoryScope =
  | "account"
  | "workspace"
  | "project"
  | "person"
  | "domain";
export type AccountMemoryStatus =
  | "active"
  | "tentative"
  | "superseded"
  | "retracted";
export type AccountMemorySensitivity =
  | "normal"
  | "private"
  | "financial"
  | "medical"
  | "legal"
  | "credential_like"
  | "high_care";
export type StackLifecycleStatus =
  | "prioritized"
  | "deprioritized"
  | "completed"
  | "archived";
export type ThreadResolutionStatus =
  | "active"
  | "resolved"
  | "reopened"
  | "superseded";
export type SourceApp = "workos" | "claude" | "chatgpt" | "unknown";
export type SourceKind = "native" | "imported_ai_chat";
export type ImportedVisibility = "visible" | "hidden_from_imported_chats";
export type SuggestionStatus = "allowed" | "ignored";
export type ContextAttachedBy =
  | "automatic"
  | "conversational"
  | "hashtag"
  | "side_panel"
  | "user";
export type ThreadContextAttachmentStatus =
  | "active"
  | "removed"
  | "ignored_for_suggestions";
export type FocusSessionMode =
  | "weekly"
  | "morning"
  | "midday"
  | "end_of_day"
  | "friday_reflection"
  | "ad_hoc";
export type FocusSessionStatus = "active" | "closed";
export type FocusMessageRole = "user" | "workos" | "system";
export type FocusMessageKind = "briefing" | "reply" | "status" | "repair_prompt";
export type FocusItemType =
  | "priority"
  | "next_move"
  | "planning_question"
  | "radar";
export type FocusItemStatus =
  | "proposed"
  | "accepted"
  | "deferred"
  | "dismissed"
  | "completed";
export type FocusItemAnchorStatus = "anchored" | "needs_thread" | "dismissed";
export type FocusThreadRole = "primary" | "supporting";

export type WorkOSEventType =
  | "node.created"
  | "node.updated"
  | "node.archived"
  | "node.unarchived"
  | "node.deleted"
  | "thread.resolved"
  | "thread.reopened"
  | "thread.superseded"
  | "post.created"
  | "post.updated"
  | "post.deleted"
  | "post.pinned"
  | "post.unpinned"
  | "post.reaction_added"
  | "post.reaction_removed"
  | "field.created"
  | "field.updated"
  | "field.deleted"
  | "field.option_created"
  | "field.option_updated"
  | "field.option_deleted"
  | "field.option_reordered"
  | "field.value_changed"
  | "link.created"
  | "link.deleted"
  | "import.materialized"
  | "context.attached"
  | "context.removed"
  | "context.ignored"
  | "context.allowed"
  | "agent.reply_started"
  | "agent.reply_completed"
  | "agent.reply_failed"
  | "focus.session_started"
  | "focus.message_created"
  | "focus.item_created"
  | "focus.item_updated"
  | "focus.item_thread_attached";

export interface WorkOSEvent {
  id: string;
  instance_id: string;
  workspace_id: string | null;
  node_id: string | null;
  actor_id: string | null;
  event_type: WorkOSEventType;
  subject_type: string;
  subject_id: string | null;
  occurred_at: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FocusSession {
  id: string;
  instance_id: string;
  actor_id: string | null;
  mode: FocusSessionMode;
  window_key: string;
  status: FocusSessionStatus;
  title: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FocusMessage {
  id: string;
  instance_id: string;
  focus_session_id: string;
  actor_id: string | null;
  role: FocusMessageRole;
  message_kind: FocusMessageKind;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FocusItem {
  id: string;
  instance_id: string;
  focus_session_id: string;
  created_by_message_id: string | null;
  title: string;
  body: string | null;
  item_type: FocusItemType;
  status: FocusItemStatus;
  anchor_status: FocusItemAnchorStatus;
  priority_rank: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deferred_until: string | null;
}

export interface FocusItemThread {
  id: string;
  focus_item_id: string;
  thread_id: string;
  thread_role: FocusThreadRole;
  created_at: string;
}

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

export interface ImportSession {
  id: string;
  instance_id: string;
  actor_id: string | null;
  source_apps: SourceApp[];
  import_name: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  source_counts: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ThreadContextAttachment {
  id: string;
  instance_id: string;
  thread_id: string;
  context_source_node_id: string;
  attached_by: ContextAttachedBy;
  status: ThreadContextAttachmentStatus;
  reason: string | null;
  source_post_id: string | null;
  source_message_id: string | null;
  source_span: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
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
  thread_resolution_status: ThreadResolutionStatus;
  resolved_at: string | null;
  resolved_by_actor_id: string | null;
  resolution_summary: string | null;
  resolution_source_post_id: string | null;
  source_kind: SourceKind | null;
  source_app: SourceApp | null;
  source_import_session_id: string | null;
  source_conversation_id: string | null;
  source_title: string | null;
  source_hash: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  imported_visibility: ImportedVisibility;
  suggestion_status: SuggestionStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NodePin {
  node_id: string;
  instance_id: string;
  position: number;
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

export interface AccountMemoryRecord {
  id: string;
  instance_id: string;
  category: AccountMemoryCategory;
  statement: string;
  scope: AccountMemoryScope;
  scope_ref_id: string | null;
  status: AccountMemoryStatus;
  sensitivity_label: AccountMemorySensitivity;
  conviction: number;
  source_refs: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  supersedes_memory_id: string | null;
  superseded_by_memory_id: string | null;
  created_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
  last_confirmed_at: string | null;
  stale_after: string | null;
  retracted_at: string | null;
}

export interface ThreadContextSheetItem {
  id: string;
  statement: string;
  source_refs: Array<Record<string, unknown>>;
  status?: string;
  updated_at?: string;
}

export interface ThreadContextSheet {
  id: string;
  instance_id: string;
  thread_id: string;
  long_term: ThreadContextSheetItem[];
  short_term: ThreadContextSheetItem[];
  active_working: ThreadContextSheetItem[];
  markdown: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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
  current_stage: string | null;
  branch_name: string | null;
  worktree_path: string | null;
  summary: string | null;
  error: string | null;
  plan_body: string | null;
  confirmation_post_id: string | null;
  prompt_manifest: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentRunEvent {
  id: string;
  run_id: string;
  event_type: string;
  message: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AgentRunArtifact {
  id: string;
  run_id: string;
  artifact_type: string;
  title: string;
  uri: string | null;
  payload: Record<string, unknown>;
  created_at: string;
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
