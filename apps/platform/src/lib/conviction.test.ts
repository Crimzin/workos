import assert from "node:assert/strict";
import {
  deriveConvictionPosture,
  diffClaimSnapshot,
  postureLabel,
} from "./conviction.ts";
import type { ConvictionFactor } from "./types.ts";

const factor = (
  code: string,
  direction: ConvictionFactor["direction"],
  explanation = code
): ConvictionFactor => ({
  code,
  direction,
  explanation,
  evidence_refs: [],
});

assert.equal(
  deriveConvictionPosture([
    factor("explicit_human_confirmation", "supports"),
    factor("recent_reinforcement", "supports"),
  ]),
  "assert",
  "removing human-confirmation recognition would make an adopted claim too weak"
);

assert.equal(
  deriveConvictionPosture([
    factor("ai_generated_synthesis", "supports"),
    factor("specific_and_testable", "supports"),
  ]),
  "ask",
  "AI generation alone must never create human authority"
);

assert.equal(
  deriveConvictionPosture([
    factor("explicit_human_statement", "supports"),
    factor("unresolved_contradiction", "contradicts"),
  ]),
  "flag",
  "a contradiction must prevent direct assertion even with human support"
);

assert.equal(
  deriveConvictionPosture([
    factor("explicit_human_statement", "supports"),
    factor("invalid_upstream_assumption", "weakens"),
  ]),
  "ask",
  "an invalid dependency must force a question rather than a settled claim"
);

assert.equal(postureLabel("assert"), "Strong");
assert.equal(postureLabel("flag"), "Needs a check");
assert.equal(postureLabel("ask"), "Uncertain");

const unchanged = {
  id: "claim-1",
  statement: "Ship the read-only panel first.",
  status: "active" as const,
  posture: "assert" as const,
  superseded_by_primitive_id: null,
  updated_at: "2026-08-19T10:00:00.000Z",
};

assert.equal(diffClaimSnapshot(unchanged, unchanged), null);

assert.deepEqual(
  diffClaimSnapshot(unchanged, {
    ...unchanged,
    statement: "Ship corrections with the panel.",
    status: "superseded",
    posture: "flag",
    superseded_by_primitive_id: "claim-2",
    updated_at: "2026-08-20T10:00:00.000Z",
  }),
  {
    changed: true,
    changed_at: "2026-08-20T10:00:00.000Z",
    fields: ["statement", "status", "posture", "supersession"],
    previous: unchanged,
    current: {
      ...unchanged,
      statement: "Ship corrections with the panel.",
      status: "superseded",
      posture: "flag",
      superseded_by_primitive_id: "claim-2",
      updated_at: "2026-08-20T10:00:00.000Z",
    },
  }
);

assert.deepEqual(diffClaimSnapshot(unchanged, null)?.fields, ["unavailable"]);
