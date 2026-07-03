import assert from "node:assert/strict";
import { createContextPromptManifest, updateManifestStage } from "./manifest.ts";

const manifest = createContextPromptManifest({
  resolvedQuery: "finance planning",
  taskType: "blank-thread context discovery",
  budgetChars: 25_000,
});

assert.equal(manifest.router_version, "context-router-v2");
assert.equal(manifest.task_type, "blank-thread context discovery");
assert.equal(manifest.current_stage_label, "Understanding the request...");
assert.equal(manifest.estimated_prompt_chars, 0);

const updated = updateManifestStage(manifest, "Searching imported chats...");

assert.equal(updated.current_stage_label, "Searching imported chats...");
assert.equal(manifest.current_stage_label, "Understanding the request...");
