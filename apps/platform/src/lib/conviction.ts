import type {
  ConvictionFactor,
  ConvictionPosture,
} from "./types";

const HUMAN_AUTHORITY_FACTOR_CODES = new Set([
  "explicit_human_confirmation",
  "explicit_human_statement",
  "human_adoption",
  "human_observed_action",
  "user_authored",
]);

const BLOCKING_FACTOR_CODES = new Set([
  "invalid_upstream_assumption",
  "source_unavailable",
  "scope_mismatch",
]);

export interface ComparableClaimSnapshot {
  id: string;
  statement: string;
  status: string;
  posture: ConvictionPosture;
  superseded_by_primitive_id: string | null;
  updated_at: string;
  change_reason?: string | null;
}

export interface ClaimSnapshotDiff {
  changed: true;
  changed_at: string | null;
  reason: string | null;
  fields: Array<
    "statement" | "status" | "posture" | "supersession" | "unavailable"
  >;
  previous: ComparableClaimSnapshot;
  current: ComparableClaimSnapshot | null;
}

export function deriveConvictionPosture(
  factors: ConvictionFactor[]
): ConvictionPosture {
  const hasHumanAuthority = factors.some(
    (factor) =>
      factor.direction === "supports" &&
      HUMAN_AUTHORITY_FACTOR_CODES.has(factor.code)
  );
  const hasBlockingGap = factors.some(
    (factor) =>
      factor.direction !== "supports" &&
      BLOCKING_FACTOR_CODES.has(factor.code)
  );
  const hasContradiction = factors.some(
    (factor) => factor.direction === "contradicts"
  );
  const hasWeakness = factors.some((factor) => factor.direction === "weakens");

  if (hasBlockingGap) return "ask";
  if (!hasHumanAuthority) return "ask";
  if (hasContradiction || hasWeakness) return "flag";
  return "assert";
}

export function postureLabel(posture: ConvictionPosture): string {
  if (posture === "assert") return "Strong";
  if (posture === "flag") return "Needs a check";
  return "Uncertain";
}

export function diffClaimSnapshot(
  snapshot: ComparableClaimSnapshot,
  live: ComparableClaimSnapshot | null
): ClaimSnapshotDiff | null {
  if (!live) {
    return {
      changed: true,
      changed_at: null,
      reason: null,
      fields: ["unavailable"],
      previous: snapshot,
      current: null,
    };
  }

  const fields: ClaimSnapshotDiff["fields"] = [];
  if (snapshot.statement !== live.statement) fields.push("statement");
  if (snapshot.status !== live.status) fields.push("status");
  if (snapshot.posture !== live.posture) fields.push("posture");
  if (
    snapshot.superseded_by_primitive_id !== live.superseded_by_primitive_id
  ) {
    fields.push("supersession");
  }
  if (fields.length === 0) return null;

  return {
    changed: true,
    changed_at: live.updated_at,
    reason: live.change_reason ?? null,
    fields,
    previous: snapshot,
    current: live,
  };
}
