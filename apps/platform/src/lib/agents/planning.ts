import { plainTextFromBody } from "./node-context";
import type { AgentPlanningInput, AgentPlanningResult } from "./types";

const AIDEX_INSTALL_PROMPT =
  "This repo's AiDex index is not available. I can fall back to direct file search, but AiDex is strongly recommended for coding agents because it gives better repo search and session continuity. Want me to install and configure it for this repo?";

export function renderCodingAgentPlan(
  input: AgentPlanningInput
): AgentPlanningResult {
  const targetText = plainTextFromBody(input.targetPost.body ?? "").trim();
  const title = input.nodeContext.node.title;
  const aidexLine =
    input.aidexStatus === "available"
      ? "- I will start by checking repo instructions and AiDex before broad file reads."
      : `- ${AIDEX_INSTALL_PROMPT}`;

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
