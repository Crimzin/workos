import type { AgentPlanningInput, AgentPlanningResult } from "./types";
import type { AgentProviderKey } from "../types";

const AIDEX_INSTALL_PROMPT =
  "This repo's AiDex index is not available. I can fall back to direct file search, but AiDex is strongly recommended for coding agents because it gives better repo search and session continuity. Want me to install and configure it for this repo?";

const AIDEX_STALE_PROMPT =
  "AiDex exists for this repo, but the index looks stale and should be refreshed before coding-agent work so repo search and session continuity reflect the current code.";

const AIDEX_DISABLED_PROMPT =
  "AiDex is disabled for this repo. Want me to enable it for this repo before coding-agent work?";

const PROVIDER_LABELS: Record<AgentProviderKey, string> = {
  inline_claude: "Claude inline replies",
  codex: "Codex",
  claude_code: "Claude Code",
};

function aidexLineForStatus(input: AgentPlanningInput): string {
  if (input.aidexStatus === "available") {
    return "- I will start by checking repo instructions and AiDex before broad file reads.";
  }
  if (input.aidexStatus === "stale") return `- ${AIDEX_STALE_PROMPT}`;
  if (input.aidexStatus === "disabled") return `- ${AIDEX_DISABLED_PROMPT}`;
  return `- ${AIDEX_INSTALL_PROMPT}`;
}

export function renderCodingAgentPlan(
  input: AgentPlanningInput
): AgentPlanningResult {
  const targetText = plainTextFromBody(input.targetPost.body ?? "").trim();
  const title = input.nodeContext.node.title;
  const aidexLine = aidexLineForStatus(input);

  const planBody = [
    targetText
      ? `I read this as: ${targetText}`
      : `I read this as a coding request on "${title}".`,
    `Context: "${title}".`,
    "",
    "My plan:",
    "- Confirm the goal from this thread and the card context.",
    aidexLine,
    "- Inspect the relevant source files before proposing edits.",
    "- Make the smallest safe change in an isolated branch/worktree once execution is enabled.",
    "- Verify with the narrowest meaningful checks before calling it done.",
    "",
    targetText
      ? `I will wait for your "go" before file edits.`
      : `I need one more sentence about the desired outcome before I can plan the work.`,
  ].join("\n");

  return {
    planBody,
    status: "awaiting_confirmation",
    metadata: {
      aidex_status: input.aidexStatus,
      provider_key: input.providerKey,
    },
  };
}

export function renderDisabledAgentProviderReply(
  agentName: string,
  providerKey: AgentProviderKey
): string {
  const providerLabel = PROVIDER_LABELS[providerKey] ?? agentName;

  return [
    `I can't respond as ${agentName} because the ${providerLabel} provider is disabled.`,
    "",
    "Enable it in Settings -> Agents, then send the request again.",
  ].join("\n");
}

function plainTextFromBody(body: string): string {
  if (!body) return "";
  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return body;
  }
  if (!Array.isArray(doc)) return body;

  return doc
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const content = (block as { content?: unknown }).content;
      if (!Array.isArray(content)) return "";
      return content
        .map((inline) => {
          if (!inline || typeof inline !== "object") return "";
          const item = inline as {
            type?: unknown;
            text?: unknown;
            props?: { name?: unknown };
          };
          if (item.type === "text" && typeof item.text === "string") {
            return item.text;
          }
          if (item.type === "mention") {
            const name = item.props?.name;
            return `@${typeof name === "string" ? name : "Unknown"}`;
          }
          return "";
        })
        .join("");
    })
    .join("\n")
    .trim();
}
