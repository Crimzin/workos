import assert from "node:assert/strict";
import {
  priorForSourceKind,
  prioritizeCheapCandidates,
} from "./discovery.ts";
import type { ContextRouterCandidate } from "./types.ts";

function candidate(
  id: string,
  sourceKind: ContextRouterCandidate["sourceKind"],
  lexicalScore = 1
): ContextRouterCandidate {
  return {
    id,
    title: id,
    sourceApp: "workos",
    updatedAt: "2026-06-30T12:00:00.000Z",
    sourcePostId: null,
    sourceMessageId: null,
    snippet: id,
    lexicalScore,
    sourceKind,
    priorWeight: priorForSourceKind(sourceKind),
  };
}

assert.equal(priorForSourceKind("mention"), 8);
assert.equal(priorForSourceKind("account-memory"), 7);
assert.equal(priorForSourceKind("attached"), 6);
assert.equal(priorForSourceKind("linked"), 6);
assert.equal(priorForSourceKind("family"), 5);
assert.equal(priorForSourceKind("thread-sheet"), 4);
assert.equal(priorForSourceKind("imported"), 3);
assert.equal(priorForSourceKind("chunk"), 3);
assert.equal(priorForSourceKind("global"), 1);
assert.equal(priorForSourceKind(undefined), 0);

const prioritized = prioritizeCheapCandidates([
  candidate("global", "global", 10),
  candidate("family", "family"),
  candidate("attached", "attached"),
  candidate("mention", "mention"),
  candidate("account", "account-memory"),
]);

assert.deepEqual(
  prioritized.map((item) => item.id),
  ["mention", "account", "attached", "family", "global"]
);

const prioritizedImportedChats = prioritizeCheapCandidates([
  {
    ...candidate("short-finance-chat", "imported"),
    priorWeight: undefined,
    sourcePostCount: 5,
    sourceBodyChars: 8_000,
  },
  {
    ...candidate("career-and-finance-strategy", "imported"),
    priorWeight: undefined,
    sourcePostCount: 120,
    sourceBodyChars: 180_000,
  },
]);

assert.deepEqual(
  prioritizedImportedChats.map((item) => item.id),
  ["career-and-finance-strategy", "short-finance-chat"]
);
assert.ok(
  (prioritizedImportedChats[0].priorWeight ?? 0) >
    (prioritizedImportedChats[1].priorWeight ?? 0)
);
