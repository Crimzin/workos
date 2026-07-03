import type { PostRecord } from "@/lib/posts";
import type { AgentRun } from "@/lib/types";
import { providerKeyForResponderName } from "@/lib/agents/model-selection";

export const DEFAULT_INLINE_CLAUDE_STAGE = "Understanding the request...";

export type InlineClaudeActiveRun = Pick<
  AgentRun,
  "id" | "agent_actor_id" | "current_stage" | "updated_at"
>;

export interface LocalThinkingClaude {
  id: string;
  name: string;
  knownPostIds: Set<string>;
}

export interface InlineClaudeIndicatorRow {
  id: string;
  name: string;
  stage: string;
}

export interface BuildOptimisticUserPostInput {
  id: string;
  nodeId: string;
  actorId: string;
  actorName: string;
  body: string;
  now?: Date;
}

export function isLocalInlineClaudeResponder(name: string): boolean {
  return providerKeyForResponderName(name) === "inline_claude";
}

export function buildOptimisticUserPost(
  input: BuildOptimisticUserPostInput
): PostRecord {
  const now = input.now ?? new Date();
  const isoNow = now.toISOString();

  return {
    id: input.id,
    node_id: input.nodeId,
    actor_id: input.actorId,
    post_type: "post",
    body: input.body,
    metadata: null,
    pinned: false,
    pinned_at: null,
    created_at: isoNow,
    updated_at: isoNow,
    actor: { id: input.actorId, name: input.actorName, kind: "human" },
    reactions: [],
  };
}

export function getInlineClaudeIndicatorRows({
  activeRuns,
  localThinking,
  posts,
  actorNamesById = new Map<string, string>(),
}: {
  activeRuns: InlineClaudeActiveRun[];
  localThinking: LocalThinkingClaude[];
  posts: Pick<PostRecord, "id" | "actor_id" | "post_type">[];
  actorNamesById?: Map<string, string>;
}): InlineClaudeIndicatorRow[] {
  if (activeRuns.length > 0) {
    return activeRuns.map((run) => ({
      id: run.id,
      name: actorNamesById.get(run.agent_actor_id) ?? "Claude",
      stage: run.current_stage?.trim() || DEFAULT_INLINE_CLAUDE_STAGE,
    }));
  }

  return localThinking
    .filter(
      (c) =>
        !posts.some(
          (p) =>
            p.actor_id === c.id &&
            p.post_type === "post" &&
            !c.knownPostIds.has(p.id)
        )
    )
    .map((c) => ({
      id: `local-${c.id}`,
      name: c.name,
      stage: DEFAULT_INLINE_CLAUDE_STAGE,
    }));
}
