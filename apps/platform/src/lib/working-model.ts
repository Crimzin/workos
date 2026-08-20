import { diffClaimSnapshot, postureLabel, type ClaimSnapshotDiff } from "./conviction";
import {
  hasResponseChangedSinceTrace,
  summarizeEvidenceProvenance,
  type AnswerReasonTraceSnapshotV1,
  type ReasonTraceEvidence,
} from "./reason-traces";
import type {
  ContextRetrievalOverride,
  ConvictionFactor,
  ConvictionPosture,
  MemoryPrimitive,
  MemoryPrimitiveEdge,
  MemoryPrimitiveEvidence,
  MemoryPrimitiveLifecycle,
  MemoryPrimitiveType,
  ReasonTraceRecord,
  SourceApp,
} from "./types";

export interface WorkingModelEvidenceRow extends MemoryPrimitiveEvidence {
  source_node: {
    id: string;
    title: string;
    source_app: SourceApp | null;
  } | null;
}

export interface WorkingModelEvidenceItem {
  id: string;
  relation: MemoryPrimitiveEvidence["relation"];
  sourceApp: SourceApp;
  sourceLabel: string;
  sourceNodeId: string | null;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  excerpt: string | null;
  observedAt: string | null;
  humanSignal: MemoryPrimitiveEvidence["human_signal"];
}

export interface WorkingModelEvidenceGroup {
  key: string;
  sourceApp: SourceApp;
  sourceLabel: string;
  count: number;
  items: WorkingModelEvidenceItem[];
}

export interface WorkingModelRelationshipView {
  id: string;
  kind: MemoryPrimitiveEdge["relationship_kind"];
  direction: "incoming" | "outgoing";
  claimId: string;
  statement: string;
}

export interface WorkingModelClaimView {
  id: string;
  kind: MemoryPrimitiveType;
  kindLabel: string;
  statement: string;
  body: string | null;
  status: MemoryPrimitiveLifecycle;
  posture: ConvictionPosture;
  postureLabel: string;
  factors: ConvictionFactor[];
  evidenceSummary: string;
  evidenceGroups: WorkingModelEvidenceGroup[];
  relationships: WorkingModelRelationshipView[];
  excludedHere: ContextRetrievalOverride | null;
  supersededByPrimitiveId: string | null;
  updatedAt: string;
}

export type WorkingModelGroupKey =
  | "aim"
  | "decisions"
  | "ideas"
  | "assumptions_constraints"
  | "questions"
  | "signals_standards";

export interface WorkingModelGroupView {
  key: WorkingModelGroupKey;
  label: string;
  claims: WorkingModelClaimView[];
}

export interface ThreadWorkingModelView {
  threadId: string;
  groups: WorkingModelGroupView[];
  claimCount: number;
  excludedCount: number;
}

export interface AnswerTraceSummary {
  id: string;
  postId: string;
  status: ReasonTraceRecord["status"];
  createdAt: string;
  summary: string;
  hasWarnings: boolean;
}

export interface ReasonTraceView {
  id: string;
  status: ReasonTraceRecord["status"];
  createdAt: string;
  snapshot: AnswerReasonTraceSnapshotV1;
  changedClaims: Array<{ claimId: string; diff: ClaimSnapshotDiff }>;
  responseEdited: boolean;
}

type WorkingModelGroupDefinition = {
  key: WorkingModelGroupKey;
  label: string;
  kinds: MemoryPrimitiveType[];
};

const GROUPS: WorkingModelGroupDefinition[] = [
  { key: "aim", label: "Aim", kinds: ["goal", "rationale"] },
  { key: "decisions", label: "Decisions", kinds: ["decision"] },
  { key: "ideas", label: "Ideas", kinds: ["idea"] },
  {
    key: "assumptions_constraints",
    label: "Assumptions and constraints",
    kinds: ["assumption", "constraint"],
  },
  { key: "questions", label: "Open questions", kinds: ["question"] },
  {
    key: "signals_standards",
    label: "Signals and standards",
    kinds: ["signal", "standard", "context_update"],
  },
];

const KIND_LABELS: Record<MemoryPrimitiveType, string> = {
  goal: "Goal",
  decision: "Decision",
  idea: "Idea",
  assumption: "Assumption",
  constraint: "Constraint",
  question: "Open question",
  standard: "Standard",
  signal: "Signal",
  context_update: "Update",
  rationale: "Rationale",
};

const POSTURE_ORDER: Record<ConvictionPosture, number> = {
  assert: 0,
  flag: 1,
  ask: 2,
};

export function buildThreadWorkingModelView(input: {
  threadId: string;
  primitives: MemoryPrimitive[];
  evidence: WorkingModelEvidenceRow[];
  edges: MemoryPrimitiveEdge[];
  overrides: ContextRetrievalOverride[];
}): ThreadWorkingModelView {
  const primitiveById = new Map(
    input.primitives.map((primitive) => [primitive.id, primitive])
  );
  const evidenceByClaim = groupBy(
    input.evidence,
    (evidence) => evidence.memory_primitive_id
  );
  const edgesByClaim = new Map<string, MemoryPrimitiveEdge[]>();
  for (const edge of input.edges.filter((item) => item.status === "active")) {
    appendToGroup(edgesByClaim, edge.from_primitive_id, edge);
    appendToGroup(edgesByClaim, edge.to_primitive_id, edge);
  }
  const overrideByClaim = new Map(
    input.overrides
      .filter(
        (override) =>
          override.target_type === "memory_primitive" && !override.cleared_at
      )
      .map((override) => [override.target_id, override])
  );

  const claims = input.primitives
    .filter((primitive) => isLiveLifecycle(normalizeLifecycle(primitive.status)))
    .map((primitive): WorkingModelClaimView => {
      const posture = normalizePosture(primitive);
      const claimEvidence = evidenceByClaim.get(primitive.id) ?? [];
      return {
        id: primitive.id,
        kind: primitive.type,
        kindLabel: KIND_LABELS[primitive.type],
        statement: primitive.statement,
        body: primitive.body,
        status: normalizeLifecycle(primitive.status),
        posture,
        postureLabel: postureLabel(posture),
        factors: primitive.conviction_factors ?? [],
        evidenceSummary: summarizeWorkingModelEvidence(claimEvidence),
        evidenceGroups: buildEvidenceGroups(claimEvidence),
        relationships: buildRelationships(
          primitive.id,
          edgesByClaim.get(primitive.id) ?? [],
          primitiveById
        ),
        excludedHere: overrideByClaim.get(primitive.id) ?? null,
        supersededByPrimitiveId: primitive.superseded_by_primitive_id ?? null,
        updatedAt: primitive.updated_at,
      };
    })
    .sort(compareClaimViews);

  const groups = GROUPS.flatMap((definition): WorkingModelGroupView[] => {
    const groupClaims = claims.filter((claim) =>
      definition.kinds.includes(claim.kind)
    );
    return groupClaims.length > 0
      ? [{ key: definition.key, label: definition.label, claims: groupClaims }]
      : [];
  });

  return {
    threadId: input.threadId,
    groups,
    claimCount: claims.length,
    excludedCount: claims.filter((claim) => claim.excludedHere).length,
  };
}

export async function getThreadWorkingModel(
  threadId: string
): Promise<ThreadWorkingModelView> {
  const [{ unstable_cache }, { cacheTags }, { supabase }] = await Promise.all([
    import("next/cache"),
    import("./cache"),
    import("./supabase"),
  ]);

  return unstable_cache(
    async () => {
      const { data: primitiveRows, error: primitiveError } = await supabase
        .from("memory_primitives")
        .select("*")
        .eq("node_id", threadId)
        .order("updated_at", { ascending: false });
      if (primitiveError) throw primitiveError;

      const primitives = (primitiveRows ?? []) as MemoryPrimitive[];
      if (primitives.length === 0) {
        return buildThreadWorkingModelView({
          threadId,
          primitives: [],
          evidence: [],
          edges: [],
          overrides: [],
        });
      }

      const claimIds = primitives.map((primitive) => primitive.id);
      const [evidenceResult, edgeResult, overrideResult] = await Promise.all([
        supabase
          .from("memory_primitive_evidence")
          .select(
            "*,source_node:nodes!memory_primitive_evidence_source_node_id_fkey(id,title,source_app)"
          )
          .in("memory_primitive_id", claimIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("memory_primitive_edges")
          .select("*")
          .or(
            `from_primitive_id.in.(${claimIds.join(",")}),to_primitive_id.in.(${claimIds.join(",")})`
          ),
        supabase
          .from("context_retrieval_overrides")
          .select("*")
          .eq("thread_id", threadId)
          .is("cleared_at", null),
      ]);

      for (const result of [evidenceResult, edgeResult, overrideResult]) {
        if (result.error && !isMissingWorkingModelRelationError(result.error)) {
          throw result.error;
        }
      }

      return buildThreadWorkingModelView({
        threadId,
        primitives,
        evidence: normalizeEvidenceRows(evidenceResult.data ?? []),
        edges: (edgeResult.data ?? []) as MemoryPrimitiveEdge[],
        overrides: (overrideResult.data ?? []) as ContextRetrievalOverride[],
      });
    },
    ["thread-working-model", threadId],
    { tags: [cacheTags.workingModel(threadId)], revalidate: false }
  )();
}

export async function getThreadAnswerTraces(
  threadId: string
): Promise<AnswerTraceSummary[]> {
  const [{ unstable_cache }, { cacheTags }, { supabase }] = await Promise.all([
    import("next/cache"),
    import("./cache"),
    import("./supabase"),
  ]);

  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("reason_traces")
        .select("id,subject_id,status,snapshot,created_at")
        .eq("thread_id", threadId)
        .eq("trace_kind", "answer")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        if (isMissingWorkingModelRelationError(error)) return [];
        throw error;
      }

      return (data ?? []).flatMap((row): AnswerTraceSummary[] => {
        const snapshot = parseAnswerTraceSnapshot(row.snapshot);
        if (!snapshot) return [];
        return [
          {
            id: String(row.id),
            postId: String(row.subject_id),
            status: row.status as ReasonTraceRecord["status"],
            createdAt: String(row.created_at),
            summary: snapshot.answer.summary,
            hasWarnings: snapshot.warnings.length > 0,
          },
        ];
      });
    },
    ["thread-answer-traces", threadId],
    { tags: [cacheTags.answerTraces(threadId)], revalidate: false }
  )();
}

export async function getReasonTraceForPost(
  postId: string
): Promise<ReasonTraceView | null> {
  const [{ unstable_cache }, { cacheTags }, { supabase }] = await Promise.all([
    import("next/cache"),
    import("./cache"),
    import("./supabase"),
  ]);

  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("reason_traces")
        .select("*")
        .eq("trace_kind", "answer")
        .eq("subject_type", "post")
        .eq("subject_id", postId)
        .maybeSingle();
      if (error) {
        if (isMissingWorkingModelRelationError(error)) return null;
        throw error;
      }
      if (!data) return null;

      const record = data as ReasonTraceRecord;
      const snapshot = parseAnswerTraceSnapshot(record.snapshot);
      if (!snapshot) return null;
      const claimIds = snapshot.working_model.claims.map((claim) => claim.id);
      const [liveResult, postResult] = await Promise.all([
        claimIds.length > 0
          ? supabase.from("memory_primitives").select("*").in("id", claimIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("posts").select("body").eq("id", postId).maybeSingle(),
      ]);
      if (liveResult.error) throw liveResult.error;
      if (postResult.error) throw postResult.error;

      const liveById = new Map(
        ((liveResult.data ?? []) as MemoryPrimitive[]).map((claim) => [
          claim.id,
          claim,
        ])
      );
      const changedClaims = snapshot.working_model.claims.flatMap((claim) => {
        const live = liveById.get(claim.id);
        const diff = diffClaimSnapshot(
          {
            id: claim.id,
            statement: claim.statement,
            status: claim.status,
            posture: claim.posture,
            superseded_by_primitive_id: claim.superseded_by_primitive_id,
            updated_at: claim.updated_at,
          },
          live
            ? {
                id: live.id,
                statement: live.statement,
                status: normalizeLifecycle(live.status),
                posture: normalizePosture(live),
                superseded_by_primitive_id:
                  live.superseded_by_primitive_id ?? null,
                updated_at: live.updated_at,
              }
            : null
        );
        return diff ? [{ claimId: claim.id, diff }] : [];
      });

      const body =
        typeof postResult.data?.body === "string" ? postResult.data.body : "";
      return {
        id: record.id,
        status: record.status,
        createdAt: record.created_at,
        snapshot,
        changedClaims,
        responseEdited: hasResponseChangedSinceTrace(body, snapshot),
      };
    },
    ["reason-trace-post", postId],
    { tags: [cacheTags.reasonTrace(postId)], revalidate: false }
  )();
}

export function parseAnswerTraceSnapshot(
  value: unknown
): AnswerReasonTraceSnapshotV1 | null {
  if (!isRecord(value)) return null;
  if (value.schema_version !== 1 || value.trace_kind !== "answer") return null;
  if (!isRecord(value.subject) || !isRecord(value.answer)) return null;
  if (!isRecord(value.working_model) || !Array.isArray(value.warnings)) return null;
  return value as unknown as AnswerReasonTraceSnapshotV1;
}

function buildEvidenceGroups(
  evidence: WorkingModelEvidenceRow[]
): WorkingModelEvidenceGroup[] {
  const groups = new Map<string, WorkingModelEvidenceItem[]>();
  for (const item of evidence) {
    const sourceApp = normalizeSourceApp(item.source_app ?? item.source_node?.source_app);
    const sourceLabel = item.source_node?.title ?? sourceAppLabel(sourceApp);
    const key = `${sourceApp}:${item.source_node_id ?? sourceLabel}`;
    appendToGroup(groups, key, {
      id: item.id,
      relation: item.relation,
      sourceApp,
      sourceLabel,
      sourceNodeId: item.source_node_id,
      sourcePostId: item.source_post_id,
      sourceMessageId: item.source_message_id,
      excerpt: item.excerpt,
      observedAt: item.observed_at,
      humanSignal: item.human_signal,
    });
  }

  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      sourceApp: items[0]?.sourceApp ?? "unknown",
      sourceLabel: items[0]?.sourceLabel ?? "Source",
      count: items.length,
      items: items.sort((left, right) =>
        (right.observedAt ?? "").localeCompare(left.observedAt ?? "")
      ),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.sourceLabel.localeCompare(right.sourceLabel)
    );
}

function summarizeWorkingModelEvidence(
  evidence: WorkingModelEvidenceRow[]
): string {
  const traceEvidence: ReasonTraceEvidence[] = evidence.map((item) => ({
    id: item.id,
    relation: item.relation,
    source_app: normalizeSourceApp(item.source_app ?? item.source_node?.source_app),
    source_kind: item.source_kind,
    source_node_id: item.source_node_id,
    source_post_id: item.source_post_id,
    source_message_id: item.source_message_id,
    source_label: item.source_node?.title ?? "Source",
    excerpt: item.excerpt,
    observed_at: item.observed_at,
    actor_id: item.actor_id,
    human_signal: item.human_signal,
    accessible: true,
  }));
  return summarizeEvidenceProvenance(traceEvidence);
}

function buildRelationships(
  claimId: string,
  edges: MemoryPrimitiveEdge[],
  primitiveById: Map<string, MemoryPrimitive>
): WorkingModelRelationshipView[] {
  return edges.flatMap((edge): WorkingModelRelationshipView[] => {
    const outgoing = edge.from_primitive_id === claimId;
    const relatedId = outgoing ? edge.to_primitive_id : edge.from_primitive_id;
    const related = primitiveById.get(relatedId);
    if (!related) return [];
    return [
      {
        id: edge.id,
        kind: edge.relationship_kind,
        direction: outgoing ? "outgoing" : "incoming",
        claimId: relatedId,
        statement: related.statement,
      },
    ];
  });
}

function normalizeLifecycle(status: string): MemoryPrimitiveLifecycle {
  if (status === "untested") return "tentative";
  if (status === "validated") return "active";
  if (status === "invalidated") return "retracted";
  if (status === "reversed") return "superseded";
  if (
    status === "tentative" ||
    status === "active" ||
    status === "superseded" ||
    status === "retracted" ||
    status === "resolved"
  ) {
    return status;
  }
  return "tentative";
}

function isLiveLifecycle(status: MemoryPrimitiveLifecycle): boolean {
  return status === "active" || status === "tentative";
}

function normalizePosture(primitive: MemoryPrimitive): ConvictionPosture {
  if (
    primitive.conviction_posture === "assert" ||
    primitive.conviction_posture === "flag" ||
    primitive.conviction_posture === "ask"
  ) {
    return primitive.conviction_posture;
  }
  if (primitive.conviction >= 0.75) return "assert";
  if (primitive.conviction >= 0.45) return "flag";
  return "ask";
}

function compareClaimViews(
  left: WorkingModelClaimView,
  right: WorkingModelClaimView
): number {
  return (
    POSTURE_ORDER[left.posture] - POSTURE_ORDER[right.posture] ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.statement.localeCompare(right.statement)
  );
}

function normalizeEvidenceRows(rows: unknown[]): WorkingModelEvidenceRow[] {
  return rows.map((row) => {
    const evidence = row as MemoryPrimitiveEvidence & {
      source_node?: WorkingModelEvidenceRow["source_node"] | WorkingModelEvidenceRow["source_node"][];
    };
    return {
      ...evidence,
      source_node: Array.isArray(evidence.source_node)
        ? evidence.source_node[0] ?? null
        : evidence.source_node ?? null,
    };
  });
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

function sourceAppLabel(sourceApp: SourceApp): string {
  if (sourceApp === "workos") return "WorkOS";
  if (sourceApp === "claude") return "Claude";
  if (sourceApp === "chatgpt") return "ChatGPT";
  return "Source";
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) appendToGroup(groups, keyFor(item), item);
  return groups;
}

function appendToGroup<T>(groups: Map<string, T[]>, key: string, item: T) {
  const existing = groups.get(key) ?? [];
  existing.push(item);
  groups.set(key, existing);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingWorkingModelRelationError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    /memory_primitive_evidence|memory_primitive_edges|context_retrieval_overrides|reason_traces/i.test(
      message
    )
  );
}
