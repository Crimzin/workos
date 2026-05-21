import { getAgentSettings } from "../agent-settings";
import type { CurrentActor } from "../actor";
import type { PostRecord } from "../posts";
import type { AgentProviderKey } from "../types";
import { resolveAgentRoutes } from "./capabilities";
import type { ClaudePrompt } from "./claude-prompt";
import type { MentionedAgent } from "./mention-detection";
import { gatherNodeContext, type NodeContext } from "./node-context";
import { renderCodingAgentPlan } from "./planning";
import { createStreamingAgentReply } from "./reply-poster";
import { createPlanningAgentRun } from "./runs";

export interface RouteAgentMentionsInput {
  mentions: MentionedAgent[];
  actor: CurrentActor;
  nodeId: string;
  workspaceId: string;
  targetPost: PostRecord;
  renderClaudePromptForContext: (ctx: NodeContext) => ClaudePrompt;
  scheduleInlineClaude: (agent: MentionedAgent, prompt: ClaudePrompt) => void;
}

function enabledProviderKeysFromSettings(
  settings: Awaited<ReturnType<typeof getAgentSettings>>
): AgentProviderKey[] {
  return settings.providers
    .filter((provider) => provider.enabled)
    .map((provider) => provider.provider_key);
}

export async function routeAgentMentions(
  input: RouteAgentMentionsInput
): Promise<void> {
  const settings = await getAgentSettings(input.actor.instance_id);
  const routes = await resolveAgentRoutes(input.mentions, {
    enabledProviderKeys: enabledProviderKeysFromSettings(settings),
  });
  if (routes.length === 0) return;

  const nodeContext = await gatherNodeContext(input.nodeId);
  if (!nodeContext) return;

  const aidexStatus =
    settings.tools.find((tool) => tool.tool_key === "aidex")?.status ??
    "missing";

  for (const route of routes) {
    if (route.kind === "inline_chat") {
      input.scheduleInlineClaude(
        route.mention,
        input.renderClaudePromptForContext(nodeContext)
      );
      continue;
    }

    const plan = renderCodingAgentPlan({
      agentName: route.mention.name,
      providerKey: route.providerKey,
      nodeContext,
      targetPost: input.targetPost,
      aidexStatus,
    });

    await createPlanningAgentRun({
      instanceId: input.actor.instance_id,
      workspaceId: input.workspaceId,
      targetNodeId: input.nodeId,
      triggerPostId: input.targetPost.id,
      requesterActorId: input.actor.id,
      agentActorId: route.mention.id,
      providerKey: route.providerKey,
      planBody: plan.planBody,
      metadata: plan.metadata,
    });

    await createStreamingAgentReply(
      input.nodeId,
      input.workspaceId,
      route.mention.id,
      plan.planBody
    );
  }
}
