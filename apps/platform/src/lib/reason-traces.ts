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
  routing_status: "complete" | "partial";
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
  responseContentForHash?: string;
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
  retrieval: Omit<ReasonTraceRetrievalSnapshot, "routing_status">;
  evidence: ReasonTraceEvidence[];
  runtime: ReasonTraceRuntimeSnapshot;
  associationStatus: "structured" | "invalid" | "failed" | "unavailable";
  routingStatus: "complete" | "partial";
  structuredAnchors?: ReasonTraceAnswerAnchor[];
  warnings?: string[];
}

export interface BuiltAnswerReasonTrace {
  status: ReasonTraceStatus;
  snapshot: AnswerReasonTraceSnapshotV1;
}

export interface EvidenceAccessSnapshot {
  accessibleNodeIds: Set<string>;
  accessiblePostIds: Set<string>;
}

export async function loadReasonTraceEvidence(
  claimIds: string[],
  viewerInstanceId: string
): Promise<ReasonTraceEvidence[]> {
  if (claimIds.length === 0) return [];
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("memory_primitive_evidence")
    .select(
      "*,source_node:nodes!memory_primitive_evidence_source_node_id_fkey(id,title,source_app)"
    )
    .in("memory_primitive_id", claimIds)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTraceRelationError(error)) return [];
    throw error;
  }

  const evidence = (data ?? []).map((row): ReasonTraceEvidence => {
    const rawNode = Array.isArray(row.source_node)
      ? row.source_node[0]
      : row.source_node;
    const sourceNode = isRecord(rawNode) ? rawNode : null;
    return {
      id: String(row.id),
      relation: typeof row.relation === "string" ? row.relation : "supports",
      source_app: normalizeSourceApp(row.source_app ?? sourceNode?.source_app),
      source_kind:
        typeof row.source_kind === "string" ? row.source_kind : "source",
      source_node_id:
        typeof row.source_node_id === "string" ? row.source_node_id : null,
      source_post_id:
        typeof row.source_post_id === "string" ? row.source_post_id : null,
      source_message_id:
        typeof row.source_message_id === "string"
          ? row.source_message_id
          : null,
      source_label:
        sourceNode && typeof sourceNode.title === "string"
          ? sourceNode.title
          : "Source no longer available",
      excerpt: typeof row.excerpt === "string" ? row.excerpt : null,
      observed_at:
        typeof row.observed_at === "string" ? row.observed_at : null,
      actor_id: typeof row.actor_id === "string" ? row.actor_id : null,
      human_signal: normalizeHumanSignal(row.human_signal),
      accessible: false,
    };
  });
  const access = await loadEvidenceAccessSnapshot(evidence, viewerInstanceId);
  return evidence.map((item) => reasonTraceEvidenceForViewer(item, access));
}

export async function loadEvidenceAccessSnapshot(
  evidence: Array<Pick<ReasonTraceEvidence, "source_node_id" | "source_post_id">>,
  viewerInstanceId: string
): Promise<EvidenceAccessSnapshot> {
  const { supabase } = await import("./supabase");
  const directNodeIds = unique(
    evidence.flatMap((item) => (item.source_node_id ? [item.source_node_id] : []))
  );
  const sourcePostIds = unique(
    evidence.flatMap((item) => (item.source_post_id ? [item.source_post_id] : []))
  );
  const { data: postRows, error: postError } = sourcePostIds.length
    ? await supabase.from("posts").select("id,node_id").in("id", sourcePostIds)
    : { data: [], error: null };
  if (postError) throw postError;

  const postNodeIds = (postRows ?? []).flatMap((row) =>
    typeof row.node_id === "string" ? [row.node_id] : []
  );
  const nodeIds = unique([...directNodeIds, ...postNodeIds]);
  const { data: nodeRows, error: nodeError } = nodeIds.length
    ? await supabase
        .from("nodes")
        .select("id,instance_id,archived_at,imported_visibility")
        .in("id", nodeIds)
    : { data: [], error: null };
  if (nodeError) throw nodeError;

  const accessibleNodeIds = new Set(
    (nodeRows ?? []).flatMap((row) =>
      row.instance_id === viewerInstanceId &&
      !row.archived_at &&
      row.imported_visibility !== "hidden_from_imported_chats"
        ? [String(row.id)]
        : []
    )
  );
  const accessiblePostIds = new Set(
    (postRows ?? []).flatMap((row) =>
      typeof row.node_id === "string" && accessibleNodeIds.has(row.node_id)
        ? [String(row.id)]
        : []
    )
  );
  return { accessibleNodeIds, accessiblePostIds };
}

export async function persistAnswerReasonTrace(input: {
  instanceId: string;
  threadId: string;
  agentRunId: string;
  built: BuiltAnswerReasonTrace;
}): Promise<string> {
  const [{ supabase }, cache] = await Promise.all([
    import("./supabase"),
    import("./cache"),
  ]);
  const { data, error } = await supabase
    .from("reason_traces")
    .insert({
      instance_id: input.instanceId,
      thread_id: input.threadId,
      trace_kind: "answer",
      subject_type: "post",
      subject_id: input.built.snapshot.subject.id,
      agent_run_id: input.agentRunId,
      status: input.built.status,
      schema_version: input.built.snapshot.schema_version,
      snapshot: input.built.snapshot,
    })
    .select("id")
    .single();
  if (error) throw error;

  cache.revalidateReasonTrace(input.built.snapshot.subject.id);
  cache.revalidateAnswerTraces(input.threadId);
  return String(data.id);
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
  const structured = validateStructuredAnchors(
    input.structuredAnchors ?? [],
    new Set(input.claims.map((claim) => claim.id)),
    new Set(input.evidence.map((item) => item.id))
  );
  const shouldUseStructured =
    (input.associationStatus === "structured" ||
      input.associationStatus === "invalid") &&
    input.structuredAnchors !== undefined;
  const anchors = shouldUseStructured ? structured.anchors : fallbackAnchors;
  const warnings = [...(input.warnings ?? [])];

  if (structured.invalidReferenceCount > 0) {
    warnings.push(
      "Invalid association references were removed because they were not selected for this answer."
    );
  }

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

  const associationsComplete =
    input.associationStatus === "structured" &&
    input.structuredAnchors !== undefined &&
    anchors.length > 0 &&
    structured.invalidReferenceCount === 0;

  return {
    status:
      input.routingStatus === "complete" && associationsComplete
        ? "complete"
        : "partial",
    snapshot: {
      schema_version: 1,
      trace_kind: "answer",
      generated_at: input.generatedAt,
      subject: {
        type: "post",
        id: input.responsePostId,
        thread_id: input.threadId,
        content_hash: hashTraceContent(
          input.responseContentForHash ?? input.responseBody
        ),
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
      retrieval: {
        routing_status: input.routingStatus,
        ...input.retrieval,
      },
      evidence: input.evidence.map(sanitizeTraceEvidence),
      runtime: input.runtime,
      warnings,
    },
  };
}

export function answerTraceClaimAttribution(
  snapshot: AnswerReasonTraceSnapshotV1
): {
  restedOn: ReasonTraceClaimSnapshot[];
  alsoAvailable: ReasonTraceClaimSnapshot[];
} {
  const claimById = new Map(
    snapshot.working_model.claims.map((claim) => [claim.id, claim])
  );
  const referencedIds = unique(
    snapshot.answer.anchors.flatMap((anchor) => anchor.belief_refs)
  );
  const referencedSet = new Set(referencedIds);
  return {
    restedOn: referencedIds.flatMap((id) => {
      const claim = claimById.get(id);
      return claim ? [claim] : [];
    }),
    alsoAvailable: snapshot.working_model.claims.filter(
      (claim) => !referencedSet.has(claim.id)
    ),
  };
}

export function redactAnswerReasonTraceSnapshotForRead(
  snapshot: AnswerReasonTraceSnapshotV1,
  access: EvidenceAccessSnapshot
): AnswerReasonTraceSnapshotV1 {
  return {
    ...snapshot,
    evidence: snapshot.evidence.map((item) => {
      const viewed = reasonTraceEvidenceForViewer(
        { ...item, accessible: false },
        access
      );
      return sanitizeTraceEvidence(viewed);
    }),
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

function reasonTraceEvidenceForViewer(
  evidence: ReasonTraceEvidence,
  access: EvidenceAccessSnapshot
): ReasonTraceEvidence {
  const hasSourceReference = Boolean(
    evidence.source_node_id || evidence.source_post_id
  );
  const nodeAccessible =
    !evidence.source_node_id ||
    access.accessibleNodeIds.has(evidence.source_node_id);
  const postAccessible =
    !evidence.source_post_id ||
    access.accessiblePostIds.has(evidence.source_post_id);
  const accessible = hasSourceReference && nodeAccessible && postAccessible;
  return {
    ...evidence,
    accessible,
    source_label: accessible ? evidence.source_label : "Restricted source",
    excerpt: accessible ? evidence.excerpt : null,
  };
}

function validateStructuredAnchors(
  anchors: ReasonTraceAnswerAnchor[],
  allowedClaimIds: Set<string>,
  allowedEvidenceIds: Set<string>
): { anchors: ReasonTraceAnswerAnchor[]; invalidReferenceCount: number } {
  let invalidReferenceCount = 0;
  const validatedAnchors = anchors.map((anchor) => {
      const beliefRefs = anchor.belief_refs.filter((id) => {
        const allowed = allowedClaimIds.has(id);
        if (!allowed) invalidReferenceCount += 1;
        return allowed;
      });
      const evidenceRefs = anchor.evidence_refs.filter((id) => {
        const allowed = allowedEvidenceIds.has(id);
        if (!allowed) invalidReferenceCount += 1;
        return allowed;
      });
      return {
        ...anchor,
        belief_refs: unique(beliefRefs),
        evidence_refs: unique(evidenceRefs),
      };
    });
  return { anchors: validatedAnchors, invalidReferenceCount };
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

function normalizeSourceApp(value: unknown): SourceApp {
  if (
    value === "workos" ||
    value === "claude" ||
    value === "chatgpt" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeHumanSignal(value: unknown): MemoryHumanSignal {
  if (
    value === "explicit_statement" ||
    value === "explicit_approval" ||
    value === "explicit_correction" ||
    value === "observed_action" ||
    value === "repeated_reference"
  ) {
    return value;
  }
  return "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingTraceRelationError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    /memory_primitive_evidence|reason_traces/i.test(message)
  );
}
