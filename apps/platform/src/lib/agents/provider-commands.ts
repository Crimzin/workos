import path from "node:path";
import type { AgentProviderKey } from "../types";

export interface AgentExecutionPromptInput {
  agentName: string;
  providerKey: AgentProviderKey;
  workspaceTitle: string;
  breadcrumb: string;
  nodeTitle: string;
  userRequest: string;
  planBody: string;
  aidexStatus: string;
}

export interface AgentCommand {
  command: string;
  args: string[];
  stdin: string | null;
}

const MAX_OUTPUT_CHARS = 4000;

export function resolveAgentWorkspaceRoot(cwd = process.cwd()): string {
  if (path.basename(cwd) === "platform" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..");
  }

  return cwd;
}

export function buildAgentExecutionPrompt(
  input: AgentExecutionPromptInput
): string {
  const aidexLine =
    input.aidexStatus === "available"
      ? "Use AiDex for codebase orientation before making changes."
      : `AiDex status is ${input.aidexStatus}; if that blocks good execution, explain the impact clearly.`;

  return [
    `You are ${input.agentName}, invoked from WorkOS after the user confirmed a coding-agent plan.`,
    "",
    "WorkOS target:",
    `- Workspace: ${input.workspaceTitle}`,
    `- Node: ${input.breadcrumb || input.nodeTitle}`,
    "",
    "User request:",
    input.userRequest,
    "",
    "Confirmed plan:",
    input.planBody,
    "",
    "Execution standards:",
    "- Start by restating a short interpretation and plan in your own normal CLI style.",
    "- Follow AGENTS.md and the project standards already present in the repository.",
    "- Use configured methodology packs and repo operating procedures before implementation; for this repo that includes Superpowers when available.",
    `- ${aidexLine}`,
    "- Make focused code changes only for this request.",
    "- Run relevant verification before claiming completion.",
    "- Finish with a concise summary, changed files, and verification results.",
  ].join("\n");
}

export function buildCodexCommand(
  workspaceRoot: string,
  prompt: string
): AgentCommand {
  return {
    command: "codex",
    args: [
      "exec",
      "--cd",
      workspaceRoot,
      "--sandbox",
      "danger-full-access",
      "--ask-for-approval",
      "never",
      "--dangerously-bypass-approvals-and-sandbox",
      "-",
    ],
    stdin: prompt,
  };
}

export function buildClaudeCodeCommand(
  workspaceRoot: string,
  prompt: string
): AgentCommand {
  return {
    command: "claude",
    args: [
      "--print",
      "--permission-mode",
      "bypassPermissions",
      "--add-dir",
      workspaceRoot,
      prompt,
    ],
    stdin: null,
  };
}

export function summarizeProviderOutput(stdout: string, stderr: string): string {
  const text = (stdout.trim() || stderr.trim()).trim();
  return text.length <= MAX_OUTPUT_CHARS ? text : text.slice(0, MAX_OUTPUT_CHARS);
}

export function commandForProvider(
  providerKey: AgentProviderKey,
  workspaceRoot: string,
  prompt: string
): AgentCommand {
  if (providerKey === "claude_code") {
    return buildClaudeCodeCommand(workspaceRoot, prompt);
  }

  return buildCodexCommand(workspaceRoot, prompt);
}
