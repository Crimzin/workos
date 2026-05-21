import type {
  AgentCapability,
  AgentProviderKey,
  AgentRun,
  AgentToolStatus,
} from "../types";
import type { MentionedAgent } from "./mention-detection";
import type { NodeContext } from "./node-context";
import type { PostRecord } from "../posts";

export type AgentRouteKind = "inline_chat" | "coding_plan";

export interface ResolvedAgentRoute {
  mention: MentionedAgent;
  providerKey: AgentProviderKey;
  capabilities: AgentCapability[];
  kind: AgentRouteKind;
}

export interface AgentRoutingInput {
  mentions: MentionedAgent[];
  resolvedRoutes: ResolvedAgentRoute[];
}

export interface AgentPlanningInput {
  agentName: string;
  providerKey: AgentProviderKey;
  nodeContext: NodeContext;
  targetPost: PostRecord;
  aidexStatus: AgentToolStatus;
}

export interface AgentPlanningResult {
  planBody: string;
  status: AgentRun["status"];
  metadata: Record<string, unknown>;
}
