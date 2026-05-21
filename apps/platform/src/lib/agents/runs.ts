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
  await appendAgentRunEvent(run.id, "plan_posted", "Agent posted a plan.", {
    trigger_post_id: input.triggerPostId,
  });

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
}: QueueAwaitingRunsForConfirmationInput): Promise<0 | 1> {
  const {
    revalidatePath,
    revalidateAgentRuns,
    revalidateNodePosts,
    revalidateWorkspaceFeed,
    supabase,
  } = await loadAgentRunRuntime();

  const { data: run, error: findError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("target_node_id", nodeId)
    .eq("workspace_id", workspaceId)
    .eq("requester_actor_id", requesterActorId)
    .eq("status", "awaiting_confirmation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (!run) return 0;

  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: "queued",
      confirmation_post_id: confirmationPostId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", (run as AgentRun).id)
    .eq("status", "awaiting_confirmation");
  if (updateError) throw updateError;

  await appendAgentRunEvent((run as AgentRun).id, "confirmed", "Run confirmed.", {
    confirmation_post_id: confirmationPostId,
  });

  revalidateAgentRuns(nodeId);
  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${workspaceId}`);

  return 1;
}
