import assert from "node:assert/strict";
import {
  AGENT_MODEL_GROUPS,
  defaultModelForProvider,
  modelSelectionMetadata,
  providerKeyForResponderName,
  resolveDefaultModelFromConfig,
  resolveModelSelection,
  withProviderDefaultModelConfig,
} from "./model-selection.ts";

assert.deepEqual(
  AGENT_MODEL_GROUPS.inline_claude.map((model) => model.label),
  ["Sonnet", "Haiku", "Opus"]
);

assert.equal(defaultModelForProvider("inline_claude")?.label, "Sonnet");
assert.equal(defaultModelForProvider("codex")?.label, "CLI default");
assert.equal(defaultModelForProvider("claude_code")?.label, "CLI default");

assert.deepEqual(
  resolveModelSelection("inline_claude", {
    providerKey: "inline_claude",
    modelId: "claude-opus-4-1",
  }),
  {
    providerKey: "inline_claude",
    modelId: "claude-opus-4-1",
    label: "Opus",
  }
);

assert.deepEqual(
  resolveModelSelection("inline_claude", {
    providerKey: "codex",
    modelId: "codex-cli-default",
  }),
  {
    providerKey: "inline_claude",
    modelId: "claude-sonnet-4-5",
    label: "Sonnet",
  }
);

assert.deepEqual(
  modelSelectionMetadata({
    providerKey: "inline_claude",
    modelId: "claude-haiku-4-5",
    label: "Haiku",
  }),
  {
    provider_key: "inline_claude",
    model_id: "claude-haiku-4-5",
    model_label: "Haiku",
  }
);

assert.equal(providerKeyForResponderName("Claude"), "inline_claude");
assert.equal(providerKeyForResponderName("WorkOS"), "inline_claude");
assert.equal(providerKeyForResponderName("Claude Code"), "claude_code");
assert.equal(providerKeyForResponderName("Codex"), "codex");

assert.deepEqual(
  resolveDefaultModelFromConfig("inline_claude", {
    default_model_id: "claude-haiku-4-5",
  }),
  {
    providerKey: "inline_claude",
    modelId: "claude-haiku-4-5",
    label: "Haiku",
  }
);

assert.deepEqual(
  resolveDefaultModelFromConfig("inline_claude", {
    default_model_id: "not-a-real-model",
  }),
  {
    providerKey: "inline_claude",
    modelId: "claude-sonnet-4-5",
    label: "Sonnet",
  }
);

assert.deepEqual(
  withProviderDefaultModelConfig(
    { requires_confirmation: true },
    "inline_claude",
    "claude-opus-4-1"
  ),
  {
    requires_confirmation: true,
    default_model_id: "claude-opus-4-1",
    default_model_label: "Opus",
  }
);
