import type {
  ConvictionFactor,
  ConvictionPosture,
  MemoryPrimitiveStatus,
  MemoryPrimitiveType,
  SourceApp,
} from "../types";
import type { ContextSourceOrigin } from "./provenance";

export type ContextCandidateSourceKind =
  | "active"
  | "mention"
  | "family"
  | "attached"
  | "linked"
  | "imported"
  | "global"
  | "account-memory"
  | "thread-sheet"
  | "chunk";

export type ContextFidelity =
  | "none"
  | "metadata"
  | "compact_pack"
  | "compact_pack_with_snippet"
  | "selected_window"
  | "raw_excerpt";

export type ContextSourceRole = "core" | "supporting" | "watchlist" | "exclude";

export interface ContextTurnResolution {
  originalText: string;
  resolvedQuery: string;
  shouldRetrieve: boolean;
  confidence: number;
  reason: string;
}

export interface ContextRouterCandidate {
  id: string;
  title: string;
  sourceApp: SourceApp;
  updatedAt: string | null;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  snippet: string;
  lexicalScore: number;
  sourceKind?: ContextCandidateSourceKind;
  sourceOrigin?: ContextSourceOrigin;
  sourceProvenance?: string;
  relation?: string;
  path?: string | null;
  previewFacts?: string[];
  freshnessHint?: string | null;
  sensitivityLabel?: string | null;
  estimatedChars?: number;
  priorWeight?: number;
  expandedMatchScore?: number;
  sourcePostCount?: number;
  sourceBodyChars?: number;
}

export interface ContextRerankDecision {
  candidateId: string;
  action: "include" | "exclude";
  sourceRole?: ContextSourceRole;
  confidence: number;
  reason: string;
  usefulFacts: string[];
  sourcePostId: string | null;
  sourceMessageId: string | null;
}

export interface ContextPack {
  router_version: "context-router-v1";
  resolved_query: string;
  source_role?: Exclude<ContextSourceRole, "exclude">;
  relevance_confidence: number;
  reason: string;
  useful_facts: string[];
  snippet: string;
  source_origin?: ContextSourceOrigin;
  source_app?: SourceApp;
  source_provenance?: string;
}

export interface ContextPromptManifestAccountMemory {
  included: string[];
  omitted: string[];
  suppressed: string[];
}

export interface ContextPromptManifestClaim {
  id: string;
  kind: MemoryPrimitiveType;
  statement: string;
  status: MemoryPrimitiveStatus;
  posture: ConvictionPosture;
  cached_score: number;
  factors: ConvictionFactor[];
  evidence_refs: string[];
  superseded_by_primitive_id: string | null;
  updated_at: string;
}

export interface ContextPromptManifestOverride {
  id: string;
  target_type: "memory_primitive" | "account_memory" | "context_source";
  target_id: string;
  directive: "exclude" | "demote";
  reason: string | null;
}

export interface ContextPromptManifestThreadSheet {
  id: string;
  updated_at: string;
  content_hash: string;
  bands_used: string[];
}

export interface ContextPromptManifestModelSelection {
  provider_key: string;
  model_id: string;
  label: string;
}

export interface ContextPromptManifest extends Record<string, unknown> {
  router_version: "context-router-v2";
  resolved_query: string;
  task_type: string;
  turn_resolution: ContextTurnResolution;
  current_stage_label: string;
  context_budget_chars: number;
  estimated_prompt_chars: number;
  included_sources: Array<Record<string, unknown>>;
  omitted_sources: Array<Record<string, unknown>>;
  account_memory: ContextPromptManifestAccountMemory;
  thread_context_sheet_bands_used: string[];
  thread_context_sheet: ContextPromptManifestThreadSheet | null;
  selected_claims: ContextPromptManifestClaim[];
  applied_overrides: ContextPromptManifestOverride[];
  warnings: string[];
  timings_ms: Record<string, number>;
  provider_key?: "inline_claude";
  model_selection?: ContextPromptManifestModelSelection | null;
  system_prompt_chars?: number;
  user_message_chars?: number;
  attachment_count?: number;
  attachment_source_post_ids?: string[];
}
