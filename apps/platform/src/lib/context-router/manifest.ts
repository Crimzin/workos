import type {
  ContextPromptManifest,
  ContextPromptManifestAccountMemory,
} from "./types";

export interface CreateContextPromptManifestInput {
  resolvedQuery: string;
  taskType: string;
  budgetChars: number;
  estimatedPromptChars?: number;
  includedSources?: Array<Record<string, unknown>>;
  omittedSources?: Array<Record<string, unknown>>;
  accountMemory?: ContextPromptManifestAccountMemory;
  threadContextSheetBandsUsed?: string[];
  warnings?: string[];
  timingsMs?: Record<string, number>;
}

const INITIAL_STAGE_LABEL = "Understanding the request...";

export function createContextPromptManifest(
  input: CreateContextPromptManifestInput
): ContextPromptManifest {
  return {
    router_version: "context-router-v2",
    resolved_query: input.resolvedQuery,
    task_type: input.taskType,
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
    warnings: input.warnings ?? [],
    timings_ms: input.timingsMs ?? {},
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
