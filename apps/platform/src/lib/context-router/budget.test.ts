import assert from "node:assert/strict";
import { chooseContextFidelity, contextBudgetForTask } from "./budget.ts";

assert.deepEqual(contextBudgetForTask("ordinary"), {
  targetChars: 25_000,
  warningChars: 50_000,
});

assert.equal(contextBudgetForTask("source-heavy").warningChars, 120_000);

assert.equal(
  chooseContextFidelity({
    score: 0.8,
    estimatedChars: 2_000,
    sourceSensitive: false,
  }),
  "compact_pack_with_snippet"
);

assert.equal(
  chooseContextFidelity({
    score: 0.8,
    estimatedChars: 9_000,
    sourceSensitive: false,
  }),
  "compact_pack"
);

assert.equal(
  chooseContextFidelity({
    score: 0.95,
    estimatedChars: 2_000,
    sourceSensitive: true,
  }),
  "selected_window"
);
