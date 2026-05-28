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
  plan_body: string;
  metadata: Record<string, unknown>;
};

interface ConfirmableRunCandidate {
  id: string;
  agent_actor_id: string;
  created_at?: string;
}

const CONFIRMABLE_RUN_MAX_AGE_MS = 30 * 60 * 1000;

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
