import assert from "node:assert/strict";
import {
  buildAgentExecutionPrompt,
  buildClaudeCodeCommand,
  buildCodexCommand,
  resolveAgentWorkspaceRoot,
  summarizeProviderOutput,
  type AgentExecutionPromptInput,
} from "./provider-commands.ts";

const promptInput: AgentExecutionPromptInput = {
  agentName: "Codex",
  providerKey: "codex",
  workspaceTitle: "WorkOS",
  breadcrumb: "WorkOS / Agent Runtime",
  nodeTitle: "Agent Runtime",
  userRequest: "@Codex wire the worker",
  planBody: "1. Inspect\n2. Implement\n3. Verify",
  aidexStatus: "available",
};

const prompt = buildAgentExecutionPrompt(promptInput);

assert.match(prompt, /You are Codex, invoked from WorkOS/);
assert.match(prompt, /User request:\n@Codex wire the worker/);
assert.match(prompt, /Confirmed plan:\n1\. Inspect/);
assert.match(prompt, /Use AiDex/);
assert.match(prompt, /Follow AGENTS\.md/);
assert.match(prompt, /Superpowers/);

assert.deepEqual(buildCodexCommand("/repo", prompt), {
  command: "codex",
  args: [
    "exec",
    "--cd",
    "/repo",
    "--sandbox",
    "danger-full-access",
    "--ask-for-approval",
    "never",
    "--dangerously-bypass-approvals-and-sandbox",
    "-",
  ],
  stdin: prompt,
});

assert.deepEqual(buildClaudeCodeCommand("/repo", prompt), {
  command: "claude",
  args: [
    "--print",
    "--permission-mode",
    "bypassPermissions",
    "--add-dir",
    "/repo",
    prompt,
  ],
  stdin: null,
});

assert.equal(
  resolveAgentWorkspaceRoot("/repo/apps/platform"),
  "/repo"
);
assert.equal(resolveAgentWorkspaceRoot("/repo"), "/repo");

assert.equal(
  summarizeProviderOutput("short output", ""),
  "short output"
);
assert.equal(
  summarizeProviderOutput("", "stderr only"),
  "stderr only"
);
assert.equal(
  summarizeProviderOutput("x".repeat(5000), "").length,
  4000
);
