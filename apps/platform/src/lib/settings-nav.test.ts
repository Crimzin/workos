import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS_PATH,
  SETTINGS_SECTIONS,
  isSettingsPathActive,
} from "./settings-nav.ts";

assert.equal(DEFAULT_SETTINGS_PATH, "/settings/agents");
assert.deepEqual(
  SETTINGS_SECTIONS.map((section) => section.label),
  ["Agents", "AI Standards"]
);
assert.equal(isSettingsPathActive("/settings"), true);
assert.equal(isSettingsPathActive("/settings/agents"), true);
assert.equal(isSettingsPathActive("/settings/ai-standards"), true);
assert.equal(isSettingsPathActive("/n/workspace-1"), false);
