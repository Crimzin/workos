import { createHash } from "node:crypto";
import type {
  ConvictionFactor,
  ConvictionPosture,
  MemoryHumanSignal,
  MemoryPrimitiveStatus,
  MemoryPrimitiveType,
  ReasonTraceStatus,
  SourceApp,
} from "./types";

export type AnswerAnchorMappingKind =
  | "structured_post_turn_association"
  | "deterministic_fallback"
  | "unavailable";

export interface ReasonTraceAnswerAnchor {
  id: string;
  statement: string;
  belief_refs: string[];
  evidence_refs: string[];
  mapping_kind: AnswerAnchorMappingKind;
}

export interface ReasonTraceClaimSnapshot {
  id: string;
  kind: MemoryPrimitiveType;
  statement: string;
  body: string | null;
  status: MemoryPrimitiveStatus;
  posture: ConvictionPosture;
  cached_score: number;
  factors: ConvictionFactor[];
  evidence_refs: string[];
  superseded_by_primitive_id: string | null;
  updated_at: string;
}

export interface ReasonTraceEvidence {
  id: string;
  relation: string;
  source_app: SourceApp;
  source_kind: string;
  source_node_id: string | null;
  source_post_id: string | null;
  source_message_id: string | null;
  source_label: string;
  excerpt: string | null;
  observed_at: string | null;
  actor_id: string | null;
  human_signal: MemoryHumanSignal;
  accessible: boolean;
}

export interface ReasonTraceRetrievalSnapshot {
  budget_chars: number;
  estimated_prompt_chars: number;
  included: Array<Record<string, unknown>>;
  omitted: Array<Record<string, unknown>>;
  overrides_applied: string[];
  warnings: string[];
}

export interface ReasonTraceRuntimeSnapshot {
  agent_run_id: string;
  provider_key: string;
  model_key: string | null;
  request_id: string | null;
  router_version: string;
  extractor_version: string | null;
}

export interface AnswerReasonTraceSnapshotV1 {
  schema_version: 1;
  trace_kind: "answer";
  generated_at: string;
  subject: {
    type: "post";
    id: string;
    thread_id: string;
    content_hash: string;
  };
  request: {
    trigger_post_id: string;
    resolved_query: string;
    task_type: string;
    turn_resolution: {
      should_retrieve: boolean;
      confidence: number;
      reason: string;
    };
  };
  answer: {
    summary: string;
    anchors: ReasonTraceAnswerAnchor[];
  };
  working_model: {
    thread_sheet_id: string | null;
    thread_sheet_updated_at: string | null;
    thread_sheet_hash: string | null;
    claims: ReasonTraceClaimSnapshot[];
  };
  retrieval: ReasonTraceRetrievalSnapshot;
  evidence: Array<Omit<ReasonTraceEvidence, "accessible">>;
  runtime: ReasonTraceRuntimeSnapshot;
  warnings: string[];
}

export interface BuildAnswerReasonTraceInput {
  generatedAt: string;
  responsePostId: string;
  threadId: string;
  responseBody: string;
  triggerPostId: string;
  request: {
    resolved_query: string;
    task_type: string;
    turn_resolution: {
      should_retrieve: boolean;
      confidence: number;
      reason: string;
    };
  };
  threadSheet: {
    id: string;
    updated_at: string;
    markdown: string;
  } | null;
  claims: ReasonTraceClaimSnapshot[];
  retrieval: ReasonTraceRetrievalSnapshot;
  evidence: ReasonTraceEvidence[];
  runtime: ReasonTraceRuntimeSnapshot;
  associationStatus: "structured" | "failed" | "unavailable";
  structuredAnchors?: ReasonTraceAnswerAnchor[];
  warnings?: string[];
}

export interface BuiltAnswerReasonTrace {
  status: ReasonTraceStatus;
  snapshot: AnswerReasonTraceSnapshotV1;
}

const TRACE_EXCERPT_MAX_CHARS = 280;
const TRACE_SUMMARY_MAX_CHARS = 240;
const TRACE_ANCHOR_LIMIT = 4;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
]);

export function hashTraceContent(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function buildAnswerAnchors(
  answer: string,
  claims: ReasonTraceClaimSnapshot[]
): ReasonTraceAnswerAnchor[] {
  return splitAnswerStatements(answer)
    .slice(0, TRACE_ANCHOR_LIMIT)
    .map((statement, index) => {
      const statementTerms = terms(statement);
      const rankedClaims = claims
        .map((claim) => ({
          claim,
          overlap: overlapCount(statementTerms, terms(claim.statement)),
        }))
        .filter((candidate) => candidate.overlap > 0)
        .sort(
          (left, right) =>
            right.overlap - left.overlap ||
            left.claim.statement.localeCompare(right.claim.statement)
        )
        .slice(0, 3)
        .map((candidate) => candidate.claim);

      return {
        id: `answer-anchor-${index + 1}`,
        statement,
        belief_refs: rankedClaims.map((claim) => claim.id),
        evidence_refs: unique(rankedClaims.flatMap((claim) => claim.evidence_refs)),
        mapping_kind: "deterministic_fallback",
      };
    });
}

export function buildAnswerReasonTraceSnapshot(
  input: BuildAnswerReasonTraceInput
): BuiltAnswerReasonTrace {
  const fallbackAnchors = buildAnswerAnchors(input.responseBody, input.claims);
  const anchors =
    input.associationStatus === "structured" && input.structuredAnchors
      ? input.structuredAnchors
      : fallbackAnchors;
  const warnings = [...(input.warnings ?? [])];

  if (anchors.length === 0) {
    warnings.push("Answer mapping is unavailable for this response.");
  } else if (
    input.associationStatus !== "structured" &&
    !warnings.some((warning) => warning.toLowerCase().includes("association"))
  ) {
    warnings.push(
      "Structured answer association was unavailable; deterministic matching is shown."
    );
  }

  return {
    status: input.associationStatus === "structured" ? "complete" : "partial",
    snapshot: {
      schema_version: 1,
      trace_kind: "answer",
      generated_at: input.generatedAt,
      subject: {
        type: "post",
        id: input.responsePostId,
        thread_id: input.threadId,
        content_hash: hashTraceContent(input.responseBody),
      },
      request: {
        trigger_post_id: input.triggerPostId,
        ...input.request,
      },
      answer: {
        summary: summarizeAnswer(input.responseBody),
        anchors,
      },
      working_model: {
        thread_sheet_id: input.threadSheet?.id ?? null,
        thread_sheet_updated_at: input.threadSheet?.updated_at ?? null,
        thread_sheet_hash: input.threadSheet
          ? hashTraceContent(input.threadSheet.markdown)
          : null,
        claims: input.claims,
      },
      retrieval: input.retrieval,
      evidence: input.evidence.map(sanitizeTraceEvidence),
      runtime: input.runtime,
      warnings,
    },
  };
}

export function summarizeEvidenceProvenance(
  evidence: ReasonTraceEvidence[]
): string {
  const sourceIdsByApp = new Map<SourceApp, Set<string>>();
  for (const item of evidence) {
    const sourceId =
      item.source_node_id ??
      item.source_post_id ??
      item.source_message_id ??
      item.source_label;
    const existing = sourceIdsByApp.get(item.source_app) ?? new Set<string>();
    existing.add(sourceId);
    sourceIdsByApp.set(item.source_app, existing);
  }

  const segments: string[] = [];
  for (const app of ["workos", "claude", "chatgpt", "unknown"] as const) {
    const count = sourceIdsByApp.get(app)?.size ?? 0;
    if (count === 0) continue;
    if (app === "workos") {
      segments.push(`${count} WorkOS ${plural(count, "thread")}`);
    } else if (app === "claude") {
      segments.push(`${count} Claude ${plural(count, "conversation")}`);
    } else if (app === "chatgpt") {
      segments.push(`${count} ChatGPT ${plural(count, "conversation")}`);
    } else {
      segments.push(`${count} other ${plural(count, "source")}`);
    }
  }

  const references = `${evidence.length} evidence ${plural(
    evidence.length,
    "reference"
  )}`;
  return segments.length > 0 ? `${references} across ${joinList(segments)}` : references;
}

export function hasResponseChangedSinceTrace(
  currentBody: string,
  snapshot: AnswerReasonTraceSnapshotV1
): boolean {
  return hashTraceContent(currentBody) !== snapshot.subject.content_hash;
}

function sanitizeTraceEvidence(
  evidence: ReasonTraceEvidence
): Omit<ReasonTraceEvidence, "accessible"> {
  const { accessible, ...safe } = evidence;
  return {
    ...safe,
    excerpt:
      accessible && safe.excerpt
        ? safe.excerpt.replace(/\s+/g, " ").trim().slice(0, TRACE_EXCERPT_MAX_CHARS)
        : null,
  };
}

function summarizeAnswer(answer: string): string {
  const first = splitAnswerStatements(answer)[0] ?? answer.replace(/\s+/g, " ").trim();
  return first.slice(0, TRACE_SUMMARY_MAX_CHARS);
}

function splitAnswerStatements(answer: string): string[] {
  return answer
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
  );
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const term of left) if (right.has(term)) count += 1;
  return count;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
