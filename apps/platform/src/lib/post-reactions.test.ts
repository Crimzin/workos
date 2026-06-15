import assert from "node:assert/strict";
import {
  groupPostReactions,
  isValidReactionEmoji,
  type RawPostReaction,
} from "./post-reactions";

const rows: RawPostReaction[] = [
  {
    id: "reaction-1",
    post_id: "post-1",
    actor_id: "actor-1",
    emoji: "👍",
    created_at: "2026-06-15T10:00:00.000Z",
    actor: { id: "actor-1", name: "Will", kind: "human" },
  },
  {
    id: "reaction-2",
    post_id: "post-1",
    actor_id: "actor-2",
    emoji: "👍",
    created_at: "2026-06-15T10:02:00.000Z",
    actor: { id: "actor-2", name: "Claude", kind: "agent" },
  },
  {
    id: "reaction-3",
    post_id: "post-1",
    actor_id: "actor-3",
    emoji: "✅",
    created_at: "2026-06-15T10:01:00.000Z",
    actor: { id: "actor-3", name: "Sam", kind: "human" },
  },
];

assert.deepEqual(groupPostReactions(rows, "actor-2"), [
  {
    emoji: "👍",
    count: 2,
    actorIds: ["actor-1", "actor-2"],
    actorNames: ["Will", "Claude"],
    reactedByCurrentActor: true,
  },
  {
    emoji: "✅",
    count: 1,
    actorIds: ["actor-3"],
    actorNames: ["Sam"],
    reactedByCurrentActor: false,
  },
]);

assert.equal(isValidReactionEmoji("👍"), true);
assert.equal(isValidReactionEmoji("✅"), true);
assert.equal(isValidReactionEmoji("not-an-emoji"), false);
assert.equal(isValidReactionEmoji(""), false);
