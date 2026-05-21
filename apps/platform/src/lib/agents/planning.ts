import { plainTextFromBody } from "./node-context";
import type { AgentPlanningInput, AgentPlanningResult } from "./types";

const AIDEX_INSTALL_PROMPT =
  "This repo's AiDex index is not available. I can fall back to direct file search, but AiDex is strongly recommended for coding agents because it gives better repo search and session continuity. Want me to install and configure it for this repo?";

const AIDEX_STALE_PROMPT =
  "AiDex exists for this repo, but the index looks stale. I recommend refreshing it before coding-agent work so repo search and session continuity reflect the current code.";

const AIDEX_DISABLED_PROMPT =
  "AiDex is disabled for this repo. Want me to enable it for this repo before coding-agent work?";

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
    `I read this as a coding request on "${title}".`,
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
