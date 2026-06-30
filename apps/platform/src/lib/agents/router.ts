import { getAgentSettings } from "../agent-settings";
import type { CurrentActor } from "../actor";
import type { PostRecord } from "../posts";
import type { AgentProviderKey } from "../types";
import type { AgentModelSelection } from "./model-selection";
import { resolveAgentRoutes } from "./capabilities";
import type { ClaudePrompt } from "./claude-prompt";
import type { MentionedAgent } from "./mention-detection";
import {
  gatherMentionedNodeContextsFromBody,
  gatherNodeContext,
  type NodeContext,
} from "./node-context";
import {
  renderCodingAgentPlan,
  renderDisabledAgentProviderReply,
} from "./planning";
import { createStreamingAgentReply } from "./reply-poster";
import { createInlineAgentRun, createPlanningAgentRun } from "./runs";

export interface RouteAgentMentionsInput {
  mentions: MentionedAgent[];
  actor: CurrentActor;
  nodeId: string;
  workspaceId: string;
  targetPost: PostRecord;
  modelSelection?: AgentModelSelection | null;
  renderClaudePromptForContext: (ctx: NodeContext) => ClaudePrompt;
  scheduleInlineClaude: (
    agent: MentionedAgent,
    prompt: ClaudePrompt,
    modelSelection: AgentModelSelection | null,
    runId: string
  ) => void;
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

  const baseNodeContext = await gatherNodeContext(input.nodeId);
  if (!baseNodeContext) return;

  const mentionedContext = await gatherMentionedNodeContextsFromBody(
    input.targetPost.body
  );
  const nodeContext: NodeContext = {
    ...baseNodeContext,
    ...mentionedContext,
  };

  const aidexStatus =
    settings.tools.find((tool) => tool.tool_key === "aidex")?.status ??
    "missing";

  for (const route of routes) {
    if (route.kind === "disabled") {
      await createStreamingAgentReply(
        input.nodeId,
        input.workspaceId,
        route.mention.id,
        renderDisabledAgentProviderReply(route.mention.name, route.providerKey)
      );
      continue;
    }

    if (route.kind === "inline_chat") {
      const selectedModel =
        input.modelSelection?.providerKey === route.providerKey
          ? input.modelSelection
          : null;
      const run = await createInlineAgentRun({
        instanceId: input.actor.instance_id,
        workspaceId: input.workspaceId,
        targetNodeId: input.nodeId,
        triggerPostId: input.targetPost.id,
        requesterActorId: input.actor.id,
        agentActorId: route.mention.id,
        currentStage: "Understanding the request...",
        metadata: {
          model_selection: selectedModel,
        },
      });
      input.scheduleInlineClaude(
        route.mention,
        input.renderClaudePromptForContext(nodeContext),
        selectedModel,
        run.id
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
      metadata: {
        ...plan.metadata,
        model_selection:
          input.modelSelection?.providerKey === route.providerKey
            ? input.modelSelection
            : null,
      },
    });

    await createStreamingAgentReply(
      input.nodeId,
      input.workspaceId,
      route.mention.id,
      plan.planBody
    );
  }
}
