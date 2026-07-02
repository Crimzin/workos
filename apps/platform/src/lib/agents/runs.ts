import type { AgentProviderKey, AgentRun, AgentRunStatus } from "../types";

export interface CreateAgentRunInput {
  instanceId: string;
  workspaceId: string;
  targetNodeId: string;
  triggerPostId: string;
  requesterActorId: string;
  agentActorId: string;
  providerKey: AgentProviderKey;
  planBody: string;
  metadata?: Record<string, unknown>;
}

export interface CreateInlineAgentRunInput {
  instanceId: string;
  workspaceId: string;
  targetNodeId: string;
  triggerPostId: string;
  requesterActorId: string;
  agentActorId: string;
  currentStage: string;
  metadata?: Record<string, unknown>;
}

export interface CompleteInlineAgentRunInput {
  runId: string;
  manifest: Record<string, unknown>;
  summary?: string;
}

export interface FailInlineAgentRunInput {
  runId: string;
  manifest?: Record<string, unknown>;
  error: unknown;
}

export interface QueueAwaitingRunsForConfirmationInput {
  nodeId: string;
  workspaceId: string;
  requesterActorId: string;
  confirmationPostId: string;
  agentActorIds?: string[];
}

type AgentRunInsert = {
  instance_id: string;
  workspace_id: string;
  target_node_id: string;
  trigger_post_id: string;
  requester_actor_id: string;
  agent_actor_id: string;
  provider_key: AgentProviderKey;
  status: AgentRunStatus;
  current_stage?: string;
  plan_body: string;
  metadata: Record<string, unknown>;
};

interface ConfirmableRunCandidate {
  id: string;
  agent_actor_id: string;
  created_at?: string;
}

const CONFIRMABLE_RUN_MAX_AGE_MS = 30 * 60 * 1000;
const INLINE_STAGE_METADATA_KEY = "current_stage";
const INLINE_PROMPT_MANIFEST_METADATA_KEY = "prompt_manifest";

export function buildAgentRunInsert(input: CreateAgentRunInput): AgentRunInsert {
  return {
    instance_id: input.instanceId,
    workspace_id: input.workspaceId,
    target_node_id: input.targetNodeId,
    trigger_post_id: input.triggerPostId,
    requester_actor_id: input.requesterActorId,
    agent_actor_id: input.agentActorId,
    provider_key: input.providerKey,
    status: "awaiting_confirmation",
    plan_body: input.planBody,
    metadata: input.metadata ?? {},
  };
}

export function buildInlineAgentRunInsert(
  input: CreateInlineAgentRunInput
): AgentRunInsert {
  return {
    instance_id: input.instanceId,
    workspace_id: input.workspaceId,
    target_node_id: input.targetNodeId,
    trigger_post_id: input.triggerPostId,
    requester_actor_id: input.requesterActorId,
    agent_actor_id: input.agentActorId,
    provider_key: "inline_claude",
    status: "running",
    current_stage: input.currentStage,
    plan_body: "",
    metadata: metadataWithInlineStage(input.metadata, input.currentStage),
  };
}

export function isInlineRunActive(
  run: Pick<AgentRun, "provider_key" | "status">
): boolean {
  return (
    run.provider_key === "inline_claude" &&
    (run.status === "running" || run.status === "planning")
  );
}

export function inlineRunStageFromRecord(input: {
  current_stage?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  if (typeof input.current_stage === "string" && input.current_stage.trim()) {
    return input.current_stage;
  }
  const stage = input.metadata?.[INLINE_STAGE_METADATA_KEY];
  return typeof stage === "string" && stage.trim() ? stage : null;
}

export function isMissingInlineAgentRunColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as Record<string, unknown>;
  const code = typeof row.code === "string" ? row.code : "";
  const message = typeof row.message === "string" ? row.message : "";
  const compactMessage = message.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    (code === "PGRST204" || code === "PGRST205" || code === "42703") &&
    (compactMessage.includes("currentstage") ||
      compactMessage.includes("promptmanifest"))
  );
}

export function selectConfirmableRunId(
  rows: ConfirmableRunCandidate[],
  agentActorIds: string[] = [],
  now = new Date()
): string | null {
  const recentRows = rows.filter((row) => {
    if (!row.created_at) return true;
    return now.getTime() - new Date(row.created_at).getTime() <=
      CONFIRMABLE_RUN_MAX_AGE_MS;
  });

  if (recentRows.length === 0) return null;

  const uniqueAgentIds = new Set(recentRows.map((row) => row.agent_actor_id));
  if (agentActorIds.length > 0) {
    const allowed = new Set(agentActorIds);
    return recentRows.find((row) => allowed.has(row.agent_actor_id))?.id ?? null;
  }

  if (uniqueAgentIds.size === 1) return recentRows[0]?.id ?? null;
  return recentRows.length === 1 ? recentRows[0]?.id ?? null : null;
}

async function loadAgentRunRuntime() {
  const [{ revalidatePath }, cache, supabaseModule] = await Promise.all([
    import("next/cache"),
    import("../cache"),
    import("../supabase"),
  ]);

  return {
    revalidatePath,
    revalidateAgentRuns: cache.revalidateAgentRuns,
    revalidateNodePosts: cache.revalidateNodePosts,
    revalidateWorkspaceFeed: cache.revalidateWorkspaceFeed,
    supabase: supabaseModule.supabase,
  };
}

export async function createPlanningAgentRun(
  input: CreateAgentRunInput
): Promise<AgentRun> {
  const { revalidatePath, revalidateAgentRuns, supabase } =
    await loadAgentRunRuntime();

  const { data, error } = await supabase
    .from("agent_runs")
    .insert(buildAgentRunInsert(input))
    .select("*")
    .single();
  if (error) throw error;

  const run = data as AgentRun;
  try {
    await appendAgentRunEvent(run.id, "plan_posted", "Agent posted a plan.", {
      trigger_post_id: input.triggerPostId,
    });
  } catch (err) {
    console.error("[agent-runtime] failed to append plan event", err);
  }

  revalidateAgentRuns(input.targetNodeId);
  revalidatePath(`/n/${input.workspaceId}`);

  return run;
}

export async function createInlineAgentRun(
  input: CreateInlineAgentRunInput
): Promise<AgentRun> {
  const { revalidatePath, revalidateAgentRuns, supabase } =
    await loadAgentRunRuntime();

  let { data, error } = await supabase
    .from("agent_runs")
    .insert(buildInlineAgentRunInsert(input))
    .select("*")
    .single();
  if (error && isMissingInlineAgentRunColumnError(error)) {
    const legacyInsert = buildInlineAgentRunInsert(input);
    delete legacyInsert.current_stage;
    const fallback = await supabase
      .from("agent_runs")
      .insert(legacyInsert)
      .select("*")
      .single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;

  const run = normalizeInlineAgentRun(data as AgentRun);
  await appendAgentRunEvent(run.id, "stage", input.currentStage, {
    stage: input.currentStage,
    trigger_post_id: input.triggerPostId,
  });

  revalidateAgentRuns(input.targetNodeId);
  revalidatePath(`/n/${input.workspaceId}`);

  return run;
}

export async function updateInlineAgentRunStage(
  runId: string,
  stage: string
): Promise<void> {
  const { revalidateAgentRuns, supabase } = await loadAgentRunRuntime();

  const { data, error } = await supabase
    .from("agent_runs")
    .update({ current_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .select("id,target_node_id")
    .single();
  if (error && isMissingInlineAgentRunColumnError(error)) {
    const targetNodeId = await updateInlineRunMetadataFallback(supabase, runId, {
      [INLINE_STAGE_METADATA_KEY]: stage,
    });
    await appendAgentRunEvent(runId, "stage", stage, { stage });
    revalidateAgentRuns(targetNodeId);
    return;
  }
  if (error) throw error;

  await appendAgentRunEvent(runId, "stage", stage, { stage });
  revalidateAgentRuns(String(data.target_node_id));
}

export async function completeInlineAgentRun({
  runId,
  manifest,
  summary,
}: CompleteInlineAgentRunInput): Promise<void> {
  const { revalidateAgentRuns, supabase } = await loadAgentRunRuntime();

  const { data, error } = await supabase
    .from("agent_runs")
    .update({
      status: "completed",
      current_stage: "Writing the reply...",
      prompt_manifest: manifest,
      summary: summary ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .select("id,target_node_id")
    .single();
  if (error && isMissingInlineAgentRunColumnError(error)) {
    const targetNodeId = await updateInlineRunMetadataFallback(
      supabase,
      runId,
      {
        [INLINE_STAGE_METADATA_KEY]: "Writing the reply...",
        [INLINE_PROMPT_MANIFEST_METADATA_KEY]: manifest,
      },
      {
        status: "completed",
        summary: summary ?? null,
      }
    );
    await appendAgentRunEvent(
      runId,
      "completed",
      "Inline Claude reply completed.",
      {
        prompt_manifest: manifest,
      }
    );
    revalidateAgentRuns(targetNodeId);
    return;
  }
  if (error) throw error;

  await appendAgentRunEvent(runId, "completed", "Inline Claude reply completed.", {
    prompt_manifest: manifest,
  });
  revalidateAgentRuns(String(data.target_node_id));
}

export async function failInlineAgentRun({
  runId,
  manifest,
  error,
}: FailInlineAgentRunInput): Promise<void> {
  const { revalidateAgentRuns, supabase } = await loadAgentRunRuntime();
  const message = error instanceof Error ? error.message : String(error);

  const { data, error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: "failed",
      current_stage: "Reply failed.",
      ...(manifest ? { prompt_manifest: manifest } : {}),
      error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .select("id,target_node_id")
    .single();
  if (updateError && isMissingInlineAgentRunColumnError(updateError)) {
    const targetNodeId = await updateInlineRunMetadataFallback(
      supabase,
      runId,
      {
        [INLINE_STAGE_METADATA_KEY]: "Reply failed.",
        ...(manifest ? { [INLINE_PROMPT_MANIFEST_METADATA_KEY]: manifest } : {}),
      },
      {
        status: "failed",
        error: message,
      }
    );
    await appendAgentRunEvent(runId, "failed", "Reply failed.", {
      error: message,
      ...(manifest ? { prompt_manifest: manifest } : {}),
    });
    revalidateAgentRuns(targetNodeId);
    return;
  }
  if (updateError) throw updateError;

  await appendAgentRunEvent(runId, "failed", "Reply failed.", {
    error: message,
    ...(manifest ? { prompt_manifest: manifest } : {}),
  });
  revalidateAgentRuns(String(data.target_node_id));
}

export async function getActiveInlineAgentRuns(
  nodeId: string
): Promise<AgentRun[]> {
  const { supabase } = await loadAgentRunRuntime();

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("target_node_id", nodeId)
    .eq("provider_key", "inline_claude")
    .in("status", ["running", "planning"])
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as AgentRun[])
    .filter(isInlineRunActive)
    .map(normalizeInlineAgentRun);
}

function metadataWithInlineStage(
  metadata: Record<string, unknown> | undefined,
  stage: string
): Record<string, unknown> {
  return { ...(metadata ?? {}), [INLINE_STAGE_METADATA_KEY]: stage };
}

function normalizeInlineAgentRun(run: AgentRun): AgentRun {
  return {
    ...run,
    current_stage: inlineRunStageFromRecord(run),
  };
}

async function updateInlineRunMetadataFallback(
  supabase: Awaited<ReturnType<typeof loadAgentRunRuntime>>["supabase"],
  runId: string,
  metadataPatch: Record<string, unknown>,
  fields: Record<string, unknown> = {}
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("agent_runs")
    .select("target_node_id,metadata")
    .eq("id", runId)
    .single();
  if (selectError) throw selectError;

  const metadata = isRecord(existing.metadata) ? existing.metadata : {};
  const { data, error } = await supabase
    .from("agent_runs")
    .update({
      ...fields,
      metadata: { ...metadata, ...metadataPatch },
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .select("id,target_node_id")
    .single();
  if (error) throw error;

  return String(data.target_node_id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function appendAgentRunEvent(
  runId: string,
  eventType: string,
  message: string | null,
  payload?: Record<string, unknown>
): Promise<void> {
  const { supabase } = await loadAgentRunRuntime();

  const { error } = await supabase.from("agent_run_events").insert({
    run_id: runId,
    event_type: eventType,
    message,
    payload: payload ?? {},
  });
  if (error) throw error;
}

export async function queueAwaitingRunsForConfirmation({
  nodeId,
  workspaceId,
  requesterActorId,
  confirmationPostId,
  agentActorIds = [],
}: QueueAwaitingRunsForConfirmationInput): Promise<0 | 1> {
  const {
    revalidatePath,
    revalidateAgentRuns,
    revalidateNodePosts,
    revalidateWorkspaceFeed,
    supabase,
  } = await loadAgentRunRuntime();

  const { data: runs, error: findError } = await supabase
    .from("agent_runs")
    .select("id, agent_actor_id, created_at")
    .eq("target_node_id", nodeId)
    .eq("workspace_id", workspaceId)
    .eq("requester_actor_id", requesterActorId)
    .eq("status", "awaiting_confirmation")
    .order("created_at", { ascending: false })
    .limit(10);
  if (findError) throw findError;

  const runId = selectConfirmableRunId(
    (runs ?? []) as ConfirmableRunCandidate[],
    agentActorIds
  );
  if (!runId) return 0;

  const { data: queuedRun, error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: "queued",
      confirmation_post_id: confirmationPostId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("target_node_id", nodeId)
    .eq("workspace_id", workspaceId)
    .eq("requester_actor_id", requesterActorId)
    .eq("status", "awaiting_confirmation")
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!queuedRun) return 0;

  await appendAgentRunEvent(queuedRun.id as string, "confirmed", "Run confirmed.", {
    confirmation_post_id: confirmationPostId,
  });

  revalidateAgentRuns(nodeId);
  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);

  return 1;
}
