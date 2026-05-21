import { spawn } from "node:child_process";
import { revalidatePath } from "next/cache";
import {
  revalidateAgentRuns,
  revalidateNodePosts,
  revalidateWorkspaceFeed,
} from "../cache";
import { supabase } from "../supabase";
import type { AgentRun } from "../types";
import { plainTextFromBody } from "./node-context";
import {
  buildAgentExecutionPrompt,
  commandForProvider,
  resolveAgentWorkspaceRoot,
  summarizeProviderOutput,
  type AgentCommand,
} from "./provider-commands";
import { postAgentReply } from "./reply-poster";
import { appendAgentRunEvent } from "./runs";

interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface AgentRunClaim extends AgentRun {
  agent?: { name: string } | null;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function runCommand(command: AgentCommand): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: resolveAgentWorkspaceRoot(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    });

    if (command.stdin) {
      child.stdin.end(command.stdin);
    } else {
      child.stdin.end();
    }
  });
}

async function claimNextQueuedRun(): Promise<AgentRunClaim | null> {
  const { data: candidates, error: findError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  if (findError) throw findError;

  const candidate = candidates?.[0] as AgentRun | undefined;
  if (!candidate) return null;

  const { data: claimed, error: updateError } = await supabase
    .from("agent_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!claimed) return null;

  return claimed as AgentRunClaim;
}

async function loadAgentName(agentActorId: string): Promise<string> {
  const { data, error } = await supabase
    .from("actors")
    .select("name")
    .eq("id", agentActorId)
    .single();
  if (error) throw error;

  return (data?.name as string | undefined) ?? "Agent";
}

async function loadTriggerPostBody(postId: string): Promise<string> {
  const { data, error } = await supabase
    .from("posts")
    .select("body")
    .eq("id", postId)
    .single();
  if (error) throw error;

  return typeof data?.body === "string" ? data.body : "";
}

async function updateRunStatus(
  run: AgentRun,
  status: AgentRun["status"],
  fields: Partial<Pick<AgentRun, "summary" | "error">> = {}
): Promise<void> {
  const { error } = await supabase
    .from("agent_runs")
    .update({
      status,
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  if (error) throw error;

  revalidateAgentRuns(run.target_node_id);
  revalidateNodePosts(run.target_node_id);
  revalidateWorkspaceFeed(run.workspace_id);
  revalidatePath(`/n/${run.workspace_id}`);
}

export async function processNextQueuedAgentRun(): Promise<AgentRun | null> {
  const run = await claimNextQueuedRun();
  if (!run) return null;

  await appendAgentRunEvent(run.id, "started", "Worker started the run.");

  try {
    const [agentName, triggerPost] = await Promise.all([
      loadAgentName(run.agent_actor_id),
      loadTriggerPostBody(run.trigger_post_id),
    ]);

    const prompt = buildAgentExecutionPrompt({
      agentName,
      providerKey: run.provider_key,
      workspaceTitle: "WorkOS",
      breadcrumb: `Node ${run.target_node_id}`,
      nodeTitle: `Node ${run.target_node_id}`,
      userRequest: plainTextFromBody(triggerPost),
      planBody: run.plan_body ?? "",
      aidexStatus:
        typeof run.metadata?.aidex_status === "string"
          ? run.metadata.aidex_status
          : "missing",
    });
    const workspaceRoot = resolveAgentWorkspaceRoot();
    const command = commandForProvider(run.provider_key, workspaceRoot, prompt);

    await appendAgentRunEvent(run.id, "provider_started", null, {
      command: command.command,
      args: command.args.filter((arg) => arg !== prompt),
    });

    const output = await runCommand(command);
    const summary = summarizeProviderOutput(output.stdout, output.stderr);

    if (output.exitCode === 0) {
      await postAgentReply(
        run.target_node_id,
        run.workspace_id,
        run.agent_actor_id,
        summary || "Run completed."
      );
      await appendAgentRunEvent(run.id, "completed", "Provider completed.", {
        exit_code: output.exitCode,
      });
      await updateRunStatus(run, "completed", { summary });
    } else {
      const error = summary || `Provider exited with code ${output.exitCode}.`;
      await postAgentReply(
        run.target_node_id,
        run.workspace_id,
        run.agent_actor_id,
        `I tried to run this, but the provider failed:\n\n${error}`
      );
      await appendAgentRunEvent(run.id, "failed", error, {
        exit_code: output.exitCode,
      });
      await updateRunStatus(run, "failed", { error });
    }

    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendAgentRunEvent(run.id, "failed", message);
    await updateRunStatus(run, "failed", { error: message });
    return run;
  }
}
