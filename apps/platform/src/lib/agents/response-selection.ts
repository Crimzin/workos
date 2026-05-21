import type { MentionedAgent } from "./mention-detection";

export interface BuildRequestedAgentMentionsInput {
  requestAgentResponse: boolean;
  mentionedAgents: MentionedAgent[];
  selectedAgent?: MentionedAgent | null;
}

export function buildRequestedAgentMentions({
  requestAgentResponse,
  mentionedAgents,
  selectedAgent,
}: BuildRequestedAgentMentionsInput): MentionedAgent[] {
  if (!requestAgentResponse) return [];

  const source = mentionedAgents.length > 0
    ? mentionedAgents
    : selectedAgent
      ? [selectedAgent]
      : [];

  const deduped = new Map<string, MentionedAgent>();
  for (const agent of source) {
    if (!deduped.has(agent.id)) deduped.set(agent.id, agent);
  }
  return [...deduped.values()];
}
