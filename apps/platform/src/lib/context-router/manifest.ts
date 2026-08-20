import type {
  ContextPromptManifest,
  ContextPromptManifestAccountMemory,
  ContextPromptManifestClaim,
  ContextPromptManifestOverride,
  ContextPromptManifestThreadSheet,
  ContextTurnResolution,
} from "./types";

export interface CreateContextPromptManifestInput {
  resolvedQuery: string;
  taskType: string;
  routingStatus?: "complete" | "partial";
  turnResolution?: ContextTurnResolution;
  budgetChars: number;
  estimatedPromptChars?: number;
  includedSources?: Array<Record<string, unknown>>;
  omittedSources?: Array<Record<string, unknown>>;
  accountMemory?: ContextPromptManifestAccountMemory;
  threadContextSheetBandsUsed?: string[];
  threadContextSheet?: ContextPromptManifestThreadSheet | null;
  selectedClaims?: ContextPromptManifestClaim[];
  appliedOverrides?: ContextPromptManifestOverride[];
  warnings?: string[];
  timingsMs?: Record<string, number>;
}

const INITIAL_STAGE_LABEL = "Understanding the request...";

export function createContextPromptManifest(
  input: CreateContextPromptManifestInput
): ContextPromptManifest {
  return {
    router_version: "context-router-v2",
    routing_status: input.routingStatus ?? "complete",
    resolved_query: input.resolvedQuery,
    task_type: input.taskType,
    turn_resolution: input.turnResolution ?? {
      originalText: input.resolvedQuery,
      resolvedQuery: input.resolvedQuery,
      shouldRetrieve: false,
      confidence: 0,
      reason: "No retrieval decision was recorded.",
    },
    current_stage_label: INITIAL_STAGE_LABEL,
    context_budget_chars: input.budgetChars,
    estimated_prompt_chars: input.estimatedPromptChars ?? 0,
    included_sources: input.includedSources ?? [],
    omitted_sources: input.omittedSources ?? [],
    account_memory: input.accountMemory ?? {
      included: [],
      omitted: [],
      suppressed: [],
    },
    thread_context_sheet_bands_used: input.threadContextSheetBandsUsed ?? [],
    thread_context_sheet: input.threadContextSheet ?? null,
    selected_claims: input.selectedClaims ?? [],
    applied_overrides: input.appliedOverrides ?? [],
    warnings: input.warnings ?? [],
    timings_ms: input.timingsMs ?? {},
  };
}

export function mergeInlineRuntimeIntoManifest(
  manifest: ContextPromptManifest,
  input: {
    systemPrompt: string;
    userMessage: string;
    attachmentSourcePostIds: string[];
    modelSelection: {
      providerKey: string;
      modelId: string;
      label: string;
    } | null;
  }
): ContextPromptManifest {
  return {
    ...manifest,
    provider_key: "inline_claude",
    model_selection: input.modelSelection
      ? {
          provider_key: input.modelSelection.providerKey,
          model_id: input.modelSelection.modelId,
          label: input.modelSelection.label,
        }
      : null,
    system_prompt_chars: input.systemPrompt.length,
    user_message_chars: input.userMessage.length,
    estimated_prompt_chars:
      input.systemPrompt.length + input.userMessage.length,
    attachment_count: input.attachmentSourcePostIds.length,
    attachment_source_post_ids: [...input.attachmentSourcePostIds],
  };
}

export function updateManifestStage(
  manifest: ContextPromptManifest,
  stageLabel: string
): ContextPromptManifest {
  return {
    ...manifest,
    current_stage_label: stageLabel,
  };
}
