import type { AgentProviderKey } from "../types";

export interface AgentModelOption {
  providerKey: AgentProviderKey;
  modelId: string;
  label: string;
}

export interface AgentModelSelectionInput {
  providerKey: AgentProviderKey;
  modelId: string;
}

export type AgentModelSelection = AgentModelOption;

export const AGENT_MODEL_GROUPS: Record<AgentProviderKey, AgentModelOption[]> = {
  inline_claude: [
    {
      providerKey: "inline_claude",
      modelId: "claude-sonnet-4-5",
      label: "Sonnet",
    },
    {
      providerKey: "inline_claude",
      modelId: "claude-haiku-4-5",
      label: "Haiku",
    },
    {
      providerKey: "inline_claude",
      modelId: "claude-opus-4-1",
      label: "Opus",
    },
  ],
  codex: [
    {
      providerKey: "codex",
      modelId: "codex-cli-default",
      label: "CLI default",
    },
  ],
  claude_code: [
    {
      providerKey: "claude_code",
      modelId: "claude-code-cli-default",
      label: "CLI default",
    },
  ],
};

export const DEFAULT_MODEL_ID_CONFIG_KEY = "default_model_id";
export const DEFAULT_MODEL_LABEL_CONFIG_KEY = "default_model_label";

export function defaultModelForProvider(
  providerKey: AgentProviderKey
): AgentModelOption | null {
  return AGENT_MODEL_GROUPS[providerKey]?.[0] ?? null;
}

export function resolveModelSelection(
  providerKey: AgentProviderKey,
  selection?: AgentModelSelectionInput | null
): AgentModelSelection | null {
  const models = AGENT_MODEL_GROUPS[providerKey] ?? [];
  const selected =
    selection?.providerKey === providerKey
      ? models.find((model) => model.modelId === selection.modelId)
      : null;

  return selected ?? defaultModelForProvider(providerKey);
}

export function resolveDefaultModelFromConfig(
  providerKey: AgentProviderKey,
  config: Record<string, unknown> | null | undefined
): AgentModelSelection | null {
  const configuredModelId = config?.[DEFAULT_MODEL_ID_CONFIG_KEY];
  return resolveModelSelection(
    providerKey,
    typeof configuredModelId === "string"
      ? { providerKey, modelId: configuredModelId }
      : null
  );
}

export function withProviderDefaultModelConfig(
  config: Record<string, unknown>,
  providerKey: AgentProviderKey,
  modelId: string
): Record<string, unknown> {
  const model = resolveModelSelection(providerKey, { providerKey, modelId });
  if (!model || model.modelId !== modelId) {
    throw new Error(`Unsupported model "${modelId}" for provider "${providerKey}".`);
  }

  return {
    ...config,
    [DEFAULT_MODEL_ID_CONFIG_KEY]: model.modelId,
    [DEFAULT_MODEL_LABEL_CONFIG_KEY]: model.label,
  };
}

export function modelSelectionMetadata(
  selection: AgentModelSelection | null
): Record<string, string> {
  if (!selection) return {};
  return {
    provider_key: selection.providerKey,
    model_id: selection.modelId,
    model_label: selection.label,
  };
}

export function providerKeyForResponderName(name: string): AgentProviderKey {
  const normalized = name.toLowerCase();
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("claude code")) return "claude_code";
  return "inline_claude";
}
