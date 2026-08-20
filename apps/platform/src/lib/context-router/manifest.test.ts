import assert from "node:assert/strict";
import {
  createContextPromptManifest,
  mergeInlineRuntimeIntoManifest,
  updateManifestStage,
} from "./manifest.ts";

const manifest = createContextPromptManifest({
  resolvedQuery: "finance planning",
  taskType: "blank-thread context discovery",
  budgetChars: 25_000,
});

assert.equal(manifest.router_version, "context-router-v2");
assert.equal(manifest.routing_status, "complete");
assert.equal(manifest.task_type, "blank-thread context discovery");
assert.equal(manifest.current_stage_label, "Understanding the request...");
assert.equal(manifest.estimated_prompt_chars, 0);
assert.equal(manifest.turn_resolution.shouldRetrieve, false);
assert.deepEqual(manifest.selected_claims, []);
assert.deepEqual(manifest.applied_overrides, []);

const updated = updateManifestStage(manifest, "Searching imported chats...");

assert.equal(updated.current_stage_label, "Searching imported chats...");
assert.equal(manifest.current_stage_label, "Understanding the request...");

const routedManifest = createContextPromptManifest({
  resolvedQuery: "Which trace surface ships first?",
  taskType: "planning",
  budgetChars: 18_000,
  estimatedPromptChars: 4_200,
  includedSources: [{ id: "source-1", reason: "Approved architecture" }],
  omittedSources: [{ id: "source-2", reason: "Below relevance threshold" }],
  turnResolution: {
    originalText: "What ships first?",
    resolvedQuery: "Which trace surface ships first?",
    shouldRetrieve: true,
    confidence: 0.92,
    reason: "The answer depends on prior architecture decisions.",
  },
  selectedClaims: [
    {
      id: "claim-1",
      kind: "decision",
      statement: "Ship read-only inspection first.",
      status: "active",
      posture: "assert",
      cached_score: 0.9,
      factors: [],
      evidence_refs: [],
      superseded_by_primitive_id: null,
      updated_at: "2026-08-19T10:00:00.000Z",
    },
  ],
  appliedOverrides: [
    {
      id: "override-1",
      target_type: "context_source",
      target_id: "source-3",
      directive: "exclude",
      reason: "Not relevant here.",
    },
  ],
});

const merged = mergeInlineRuntimeIntoManifest(routedManifest, {
  systemPrompt: "system prompt",
  userMessage: "user message",
  attachmentSourcePostIds: ["post-1"],
  modelSelection: {
    providerKey: "inline_claude",
    modelId: "claude-sonnet-4-5",
    label: "Sonnet 4.5",
  },
});

assert.deepEqual(merged.included_sources, routedManifest.included_sources);
assert.deepEqual(merged.omitted_sources, routedManifest.omitted_sources);
assert.deepEqual(merged.selected_claims, routedManifest.selected_claims);
assert.deepEqual(merged.applied_overrides, routedManifest.applied_overrides);
assert.equal(merged.provider_key, "inline_claude");
assert.equal(merged.model_selection?.model_id, "claude-sonnet-4-5");
assert.equal(merged.system_prompt_chars, 13);
assert.equal(merged.user_message_chars, 12);
assert.equal(merged.estimated_prompt_chars, 25);
assert.deepEqual(merged.attachment_source_post_ids, ["post-1"]);
