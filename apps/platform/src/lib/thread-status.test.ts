import assert from "node:assert/strict";
import {
  buildSubThreadResolvedMetadata,
  getThreadStatusLabel,
  normalizeResolutionSummary,
} from "./thread-status";

assert.equal(getThreadStatusLabel("active"), "Unresolved");
assert.equal(getThreadStatusLabel("resolved"), "Resolved");
assert.equal(getThreadStatusLabel("reopened"), "Reopened");
assert.equal(getThreadStatusLabel("superseded"), "Superseded");

assert.equal(
  normalizeResolutionSummary("  Pricing resolved: $12k fixed fee.  "),
  "Pricing resolved: $12k fixed fee."
);

assert.throws(() => normalizeResolutionSummary("   "), /Resolution summary is required/);

assert.deepEqual(
  buildSubThreadResolvedMetadata({
    subThreadId: "pricing",
    subThreadTitle: "Pricing",
    summary: "Pricing resolved: $12k fixed fee.",
  }),
  {
    sub_thread_id: "pricing",
    sub_thread_title: "Pricing",
    summary: "Pricing resolved: $12k fixed fee.",
  }
);
