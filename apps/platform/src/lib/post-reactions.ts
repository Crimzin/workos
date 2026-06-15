export interface RawPostReaction {
  id: string;
  post_id: string;
  actor_id: string;
  emoji: string;
  created_at: string;
  actor:
    | { id: string; name: string; kind: string }
    | { id: string; name: string; kind: string }[]
    | null;
}

export interface PostReactionSummary {
  emoji: string;
  count: number;
  actorIds: string[];
  actorNames: string[];
  reactedByCurrentActor: boolean;
}

interface ReactionGroup {
  emoji: string;
  firstCreatedAt: string;
  actorIds: string[];
  actorNames: string[];
}

export function groupPostReactions(
  reactions: RawPostReaction[] | null | undefined,
  currentActorId: string | null = null
): PostReactionSummary[] {
  const groups = new Map<string, ReactionGroup>();

  for (const reaction of reactions ?? []) {
    const existing = groups.get(reaction.emoji);
    const actorName = reactionActorName(reaction);

    if (!existing) {
      groups.set(reaction.emoji, {
        emoji: reaction.emoji,
        firstCreatedAt: reaction.created_at,
        actorIds: [reaction.actor_id],
        actorNames: [actorName],
      });
      continue;
    }

    existing.actorIds.push(reaction.actor_id);
    existing.actorNames.push(actorName);
    if (reaction.created_at < existing.firstCreatedAt) {
      existing.firstCreatedAt = reaction.created_at;
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.firstCreatedAt.localeCompare(b.firstCreatedAt))
    .map((group) => ({
      emoji: group.emoji,
      count: group.actorIds.length,
      actorIds: group.actorIds,
      actorNames: group.actorNames,
      reactedByCurrentActor: currentActorId
        ? group.actorIds.includes(currentActorId)
        : false,
    }));
}

export function isValidReactionEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return false;
  return /\p{Extended_Pictographic}/u.test(trimmed);
}

function reactionActorName(reaction: RawPostReaction): string {
  if (Array.isArray(reaction.actor)) {
    return reaction.actor[0]?.name ?? "Unknown";
  }
  return reaction.actor?.name ?? "Unknown";
}
