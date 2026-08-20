import { diffClaimSnapshot, postureLabel, type ClaimSnapshotDiff } from "./conviction";
import {
  answerTraceClaimAttribution,
  hasResponseChangedSinceTrace,
  loadEvidenceAccessSnapshot,
  redactAnswerReasonTraceSnapshotForRead,
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
import type { ContextPromptManifestClaim } from "./context-router/types";
import type { PostTurnProposedClaim } from "./thread-context-extractor";

export interface WorkingModelEvidenceRow extends MemoryPrimitiveEvidence {
  accessible: boolean;
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
  cachedScore: number;
  factors: ConvictionFactor[];
  evidenceRefs: string[];
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
  evidenceSummary: string;
  snapshot: AnswerReasonTraceSnapshotV1;
  changedClaims: Array<{ claimId: string; diff: ClaimSnapshotDiff }>;
  responseEdited: boolean;
}

export interface ReasonTraceView {
  id: string;
  status: ReasonTraceRecord["status"];
  createdAt: string;
  snapshot: AnswerReasonTraceSnapshotV1;
  changedClaims: Array<{ claimId: string; diff: ClaimSnapshotDiff }>;
  responseEdited: boolean;
}

export interface PostTurnClaimInsert {
  claim: Record<string, unknown>;
  evidence: Record<string, unknown>;
}

export function buildAnswerTraceSummaryView(input: {
  id: string;
  status: ReasonTraceRecord["status"];
  createdAt: string;
  snapshot: AnswerReasonTraceSnapshotV1;
  currentResponseBody: string;
  liveClaims: MemoryPrimitive[];
}): AnswerTraceSummary {
  const liveById = new Map(input.liveClaims.map((claim) => [claim.id, claim]));
  const changedClaims = input.snapshot.working_model.claims.flatMap((claim) => {
    const live = liveById.get(claim.id);
    const diff = diffClaimSnapshot(
      comparableSnapshot(claim),
      live ? comparableLiveClaim(live) : null
    );
    return diff ? [{ claimId: claim.id, diff }] : [];
  });

  const attribution = answerTraceClaimAttribution(input.snapshot);
  const relevantEvidenceIds = new Set([
    ...input.snapshot.answer.anchors.flatMap((anchor) => anchor.evidence_refs),
    ...attribution.restedOn.flatMap((claim) => claim.evidence_refs),
  ]);

  return {
    id: input.id,
    postId: input.snapshot.subject.id,
    status: input.status,
    createdAt: input.createdAt,
    summary: input.snapshot.answer.summary,
    hasWarnings: input.snapshot.warnings.length > 0,
    evidenceSummary: summarizeEvidenceProvenance(
      input.snapshot.evidence
        .filter((item) => relevantEvidenceIds.has(item.id))
        .map((item) => ({ ...item, accessible: item.excerpt !== null }))
    ),
    snapshot: input.snapshot,
    changedClaims,
    responseEdited: hasResponseChangedSinceTrace(
      input.currentResponseBody,
      input.snapshot
    ),
  };
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
        cachedScore: primitive.conviction,
        factors: primitive.conviction_factors ?? [],
        evidenceRefs: claimEvidence.map((item) => item.id),
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

export function buildPostTurnClaimInsert(input: {
  instanceId: string;
  threadId: string;
  triggerPostId: string;
  responsePostId: string;
  requesterActorId: string;
  agentActorId: string;
  now: string;
  claim: PostTurnProposedClaim;
}): PostTurnClaimInsert {
  const fromHuman = input.claim.origin === "human";
  const sourcePostId = fromHuman
    ? input.triggerPostId
    : input.responsePostId;
  const actorId = fromHuman ? input.requesterActorId : input.agentActorId;
  const factor: ConvictionFactor = fromHuman
    ? {
        code: convictionFactorCodeForHumanSignal(input.claim.human_signal),
        direction: "supports",
        explanation: "This claim traces to an explicit human signal.",
        evidence_refs: [],
      }
    : {
        code: "ai_generated_synthesis",
        direction: "supports",
        explanation:
          "This was proposed by the assistant and has not been adopted by the user.",
        evidence_refs: [],
      };

  return {
    claim: {
      instance_id: input.instanceId,
      node_id: input.threadId,
      type: input.claim.kind,
      statement: input.claim.statement,
      body: input.claim.body,
      status: input.claim.status,
      conviction: fromHuman ? 0.9 : 0.35,
      extraction_mode: input.claim.extraction_mode,
      conviction_posture: input.claim.posture,
      conviction_factors: [factor],
      conviction_version: "working-model-v1",
      valid_from: input.now,
      last_confirmed_at: fromHuman ? input.now : null,
      sensitivity_label: "normal",
      source_post_id: sourcePostId,
      source_label: "Current WorkOS thread",
      created_by_actor_id: actorId,
      updated_by_actor_id: actorId,
      metadata: {
        extraction_origin: input.claim.origin,
        post_turn_extraction: true,
      },
    },
    evidence: {
      instance_id: input.instanceId,
      relation: "extracted_from",
      source_kind: fromHuman ? "user_post" : "assistant_post",
      source_app: "workos",
      source_node_id: input.threadId,
      source_post_id: sourcePostId,
      actor_id: actorId,
      observed_at: input.now,
      excerpt: input.claim.source_span?.text ?? null,
      source_span: input.claim.source_span ?? {},
      human_signal: input.claim.human_signal,
      authority_snapshot: fromHuman
        ? { actor_id: input.requesterActorId, source: "current_user_turn" }
        : {},
      metadata: { post_turn_extraction: true },
    },
  };
}

export async function persistPostTurnClaimProposals(input: {
  instanceId: string;
  threadId: string;
  triggerPostId: string;
  responsePostId: string;
  requesterActorId: string;
  agentActorId: string;
  claims: PostTurnProposedClaim[];
  now?: string;
}): Promise<string[]> {
  if (input.claims.length === 0) return [];
  const [{ supabase }, cache] = await Promise.all([
    import("./supabase"),
    import("./cache"),
  ]);
  const { data: existingRows, error: existingError } = await supabase
    .from("memory_primitives")
    .select("type,statement")
    .eq("node_id", input.threadId);
  if (existingError) throw existingError;

  const existingKeys = new Set(
    (existingRows ?? []).map(
      (row) => `${row.type}:${normalizeStatement(String(row.statement))}`
    )
  );
  const createdIds: string[] = [];
  const now = input.now ?? new Date().toISOString();

  for (const proposal of input.claims) {
    const key = `${proposal.kind}:${normalizeStatement(proposal.statement)}`;
    if (existingKeys.has(key)) continue;
    const payload = buildPostTurnClaimInsert({ ...input, claim: proposal, now });
    const { data: claimRow, error: claimError } = await supabase
      .from("memory_primitives")
      .insert(payload.claim)
      .select("id")
      .single();
    if (claimError) throw claimError;

    const claimId = String(claimRow.id);
    const { error: evidenceError } = await supabase
      .from("memory_primitive_evidence")
      .insert({ ...payload.evidence, memory_primitive_id: claimId });
    if (evidenceError) {
      await supabase.from("memory_primitives").delete().eq("id", claimId);
      throw evidenceError;
    }
    existingKeys.add(key);
    createdIds.push(claimId);
  }

  if (createdIds.length > 0) {
    cache.revalidateNodeMemoryPrimitives(input.threadId);
    cache.revalidateWorkingModel(input.threadId);
  }
  return createdIds;
}

export function workingModelClaimsForManifest(
  model: ThreadWorkingModelView
): ContextPromptManifestClaim[] {
  return model.groups.flatMap((group) =>
    group.claims.flatMap((claim): ContextPromptManifestClaim[] =>
      claim.excludedHere
        ? []
        : [
            {
              id: claim.id,
              kind: claim.kind,
              statement: claim.statement,
              status: claim.status,
              posture: claim.posture,
              cached_score: claim.cachedScore,
              factors: claim.factors,
              evidence_refs: claim.evidenceRefs,
              superseded_by_primitive_id: claim.supersededByPrimitiveId,
              updated_at: claim.updatedAt,
            },
          ]
    )
  );
}

export async function getThreadWorkingModel(
  threadId: string,
  viewerInstanceId: string
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
        .eq("instance_id", viewerInstanceId)
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

      const normalizedEvidence = normalizeEvidenceRows(evidenceResult.data ?? []);
      const evidenceAccess = await loadEvidenceAccessSnapshot(
        normalizedEvidence,
        viewerInstanceId
      );
      return buildThreadWorkingModelView({
        threadId,
        primitives,
        evidence: redactWorkingModelEvidenceForRead(
          normalizedEvidence,
          evidenceAccess
        ),
        edges: (edgeResult.data ?? []) as MemoryPrimitiveEdge[],
        overrides: (overrideResult.data ?? []) as ContextRetrievalOverride[],
      });
    },
    ["thread-working-model", viewerInstanceId, threadId],
    { tags: [cacheTags.workingModel(threadId)], revalidate: false }
  )();
}

export async function getThreadAnswerTraces(
  threadId: string,
  viewerInstanceId: string
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
        .eq("instance_id", viewerInstanceId)
        .eq("trace_kind", "answer")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        if (isMissingWorkingModelRelationError(error)) return [];
        throw error;
      }

      const rawParsedRows = (data ?? []).flatMap((row) => {
        const snapshot = parseAnswerTraceSnapshot(row.snapshot);
        if (!snapshot) return [];
        return [{ row, snapshot }];
      });
      const evidenceAccess = await loadEvidenceAccessSnapshot(
        rawParsedRows.flatMap(({ snapshot }) => snapshot.evidence),
        viewerInstanceId
      );
      const parsedRows = rawParsedRows.map(({ row, snapshot }) => ({
        row,
        snapshot: redactAnswerReasonTraceSnapshotForRead(
          snapshot,
          evidenceAccess
        ),
      }));
      if (parsedRows.length === 0) return [];

      const postIds = parsedRows.map(({ snapshot }) => snapshot.subject.id);
      const claimIds = unique(
        parsedRows.flatMap(({ snapshot }) =>
          snapshot.working_model.claims.map((claim) => claim.id)
        )
      );
      const [postResult, liveResult] = await Promise.all([
        supabase.from("posts").select("id,body").in("id", postIds),
        claimIds.length > 0
          ? supabase
              .from("memory_primitives")
              .select("*")
              .eq("instance_id", viewerInstanceId)
              .in("id", claimIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (postResult.error) throw postResult.error;
      if (liveResult.error) throw liveResult.error;

      const bodyByPostId = new Map(
        (postResult.data ?? []).map((post) => [
          String(post.id),
          typeof post.body === "string" ? post.body : "",
        ])
      );
      const liveClaims = (liveResult.data ?? []) as MemoryPrimitive[];
      return parsedRows.map(({ row, snapshot }) =>
        buildAnswerTraceSummaryView({
          id: String(row.id),
          status: row.status as ReasonTraceRecord["status"],
          createdAt: String(row.created_at),
          snapshot,
          currentResponseBody: bodyByPostId.get(snapshot.subject.id) ?? "",
          liveClaims,
        })
      );
    },
    ["thread-answer-traces", viewerInstanceId, threadId],
    { tags: [cacheTags.answerTraces(threadId)], revalidate: false }
  )();
}

export async function getReasonTraceForPost(
  postId: string,
  viewerInstanceId: string
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
        .eq("instance_id", viewerInstanceId)
        .maybeSingle();
      if (error) {
        if (isMissingWorkingModelRelationError(error)) return null;
        throw error;
      }
      if (!data) return null;

      const record = data as ReasonTraceRecord;
      const storedSnapshot = parseAnswerTraceSnapshot(record.snapshot);
      if (!storedSnapshot) return null;
      const evidenceAccess = await loadEvidenceAccessSnapshot(
        storedSnapshot.evidence,
        viewerInstanceId
      );
      const snapshot = redactAnswerReasonTraceSnapshotForRead(
        storedSnapshot,
        evidenceAccess
      );
      const claimIds = snapshot.working_model.claims.map((claim) => claim.id);
      const [liveResult, postResult] = await Promise.all([
        claimIds.length > 0
          ? supabase
              .from("memory_primitives")
              .select("*")
              .eq("instance_id", viewerInstanceId)
              .in("id", claimIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("posts").select("body").eq("id", postId).maybeSingle(),
      ]);
      if (liveResult.error) throw liveResult.error;
      if (postResult.error) throw postResult.error;

      const body =
        typeof postResult.data?.body === "string" ? postResult.data.body : "";
      const summary = buildAnswerTraceSummaryView({
        id: record.id,
        status: record.status,
        createdAt: record.created_at,
        snapshot,
        currentResponseBody: body,
        liveClaims: (liveResult.data ?? []) as MemoryPrimitive[],
      });
      return {
        id: record.id,
        status: record.status,
        createdAt: record.created_at,
        snapshot,
        changedClaims: summary.changedClaims,
        responseEdited: summary.responseEdited,
      };
    },
    ["reason-trace-post", viewerInstanceId, postId],
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
    const sourceLabel = item.accessible
      ? item.source_node?.title ?? sourceAppLabel(sourceApp)
      : "Restricted source";
    const key = `${sourceApp}:${item.source_node_id ?? sourceLabel}`;
    appendToGroup(groups, key, {
      id: item.id,
      relation: item.relation,
      sourceApp,
      sourceLabel,
      sourceNodeId: item.source_node_id,
      sourcePostId: item.source_post_id,
      sourceMessageId: item.source_message_id,
      excerpt: item.accessible ? item.excerpt : null,
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
    source_label: item.accessible
      ? item.source_node?.title ?? "Source"
      : "Restricted source",
    excerpt: item.accessible ? item.excerpt : null,
    observed_at: item.observed_at,
    actor_id: item.actor_id,
    human_signal: item.human_signal,
    accessible: item.accessible,
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

function comparableSnapshot(
  claim: AnswerReasonTraceSnapshotV1["working_model"]["claims"][number]
) {
  return {
    id: claim.id,
    statement: claim.statement,
    status: claim.status,
    posture: claim.posture,
    superseded_by_primitive_id: claim.superseded_by_primitive_id,
    updated_at: claim.updated_at,
  };
}

function comparableLiveClaim(claim: MemoryPrimitive) {
  return {
    id: claim.id,
    statement: claim.statement,
    status: normalizeLifecycle(claim.status),
    posture: normalizePosture(claim),
    superseded_by_primitive_id: claim.superseded_by_primitive_id ?? null,
    updated_at: claim.updated_at,
    change_reason:
      typeof claim.metadata.correction_reason === "string"
        ? claim.metadata.correction_reason
        : null,
  };
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
      accessible: false,
      source_node: Array.isArray(evidence.source_node)
        ? evidence.source_node[0] ?? null
        : evidence.source_node ?? null,
    };
  });
}

function redactWorkingModelEvidenceForRead(
  evidence: WorkingModelEvidenceRow[],
  access: {
    accessibleNodeIds: Set<string>;
    accessiblePostIds: Set<string>;
  }
): WorkingModelEvidenceRow[] {
  return evidence.map((item) => {
    const hasReference = Boolean(item.source_node_id || item.source_post_id);
    const accessible =
      hasReference &&
      (!item.source_node_id || access.accessibleNodeIds.has(item.source_node_id)) &&
      (!item.source_post_id || access.accessiblePostIds.has(item.source_post_id));
    return {
      ...item,
      accessible,
      excerpt: accessible ? item.excerpt : null,
      source_node: accessible ? item.source_node : null,
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

function normalizeStatement(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function convictionFactorCodeForHumanSignal(
  signal: PostTurnProposedClaim["human_signal"]
): string {
  if (signal === "explicit_statement") return "explicit_human_statement";
  if (signal === "observed_action") return "human_observed_action";
  if (signal === "repeated_reference") return "human_adoption";
  return "explicit_human_confirmation";
}
