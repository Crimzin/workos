import type { SourceApp } from "../types";

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
  relation?: string;
  path?: string | null;
  previewFacts?: string[];
  freshnessHint?: string | null;
  sensitivityLabel?: string | null;
  estimatedChars?: number;
  priorWeight?: number;
  expandedMatchScore?: number;
}

export interface ContextRerankDecision {
  candidateId: string;
  action: "include" | "exclude";
  confidence: number;
  reason: string;
  usefulFacts: string[];
  sourcePostId: string | null;
  sourceMessageId: string | null;
}

export interface ContextPack {
  router_version: "context-router-v1";
  resolved_query: string;
  relevance_confidence: number;
  reason: string;
  useful_facts: string[];
  snippet: string;
}

export interface ContextPromptManifestAccountMemory {
  included: string[];
  omitted: string[];
  suppressed: string[];
}

export interface ContextPromptManifest {
  router_version: "context-router-v2";
  resolved_query: string;
  task_type: string;
  current_stage_label: string;
  context_budget_chars: number;
  estimated_prompt_chars: number;
  included_sources: Array<Record<string, unknown>>;
  omitted_sources: Array<Record<string, unknown>>;
  account_memory: ContextPromptManifestAccountMemory;
  thread_context_sheet_bands_used: string[];
  warnings: string[];
  timings_ms: Record<string, number>;
}
