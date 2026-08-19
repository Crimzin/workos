import assert from "node:assert/strict";
import {
  assertValidImportConversationBatch,
  buildImportConversationBatches,
  classifyImportConversations,
  serializedImportConversationBatchBytes,
} from "./import-batches.ts";
import type { NormalizedImportedConversation } from "./import-sources.ts";

function conversation(
  sourceConversationId: string,
  updatedAt: string | null,
  textLength = 24
): NormalizedImportedConversation {
  return {
    sourceApp: "claude",
    sourceConversationId,
    title: sourceConversationId,
    createdAt: "2026-06-21T10:00:00.000Z",
    updatedAt,
    messages: [
      {
        sourceMessageId: `${sourceConversationId}-message`,
        role: "human",
        authorName: "Human",
        text: "x".repeat(textLength),
        createdAt: "2026-06-21T10:01:00.000Z",
        sourceIndex: 0,
      },
    ],
  };
}

const unchanged = conversation("unchanged", "2026-06-21T10:20:00.000Z");
const updated = conversation("updated", "2026-06-22T10:20:00.000Z");
const fresh = conversation("fresh", "2026-06-23T10:20:00.000Z");
const missingTimestamp = conversation("missing-time", null);

const classification = classifyImportConversations(
  [unchanged, updated, fresh, missingTimestamp],
  [
    {
      sourceApp: "claude",
      sourceConversationId: "unchanged",
      sourceUpdatedAt: "2026-06-21T10:20:00+00:00",
    },
    {
      sourceApp: "claude",
      sourceConversationId: "updated",
      sourceUpdatedAt: "2026-06-21T10:20:00+00:00",
    },
    {
      sourceApp: "claude",
      sourceConversationId: "missing-time",
      sourceUpdatedAt: null,
    },
  ]
);

assert.deepEqual(
  classification.unchanged.map((item) => item.sourceConversationId),
  ["unchanged"]
);
assert.deepEqual(
  classification.updated.map((item) => item.sourceConversationId),
  ["updated", "missing-time"]
);
assert.deepEqual(
  classification.fresh.map((item) => item.sourceConversationId),
  ["fresh"]
);
assert.deepEqual(
  classification.pending.map((item) => item.sourceConversationId),
  ["updated", "fresh", "missing-time"]
);

const batchLimit = 1_300_000;
const batches = buildImportConversationBatches(
  [
    conversation("batch-a", null, 600_000),
    conversation("batch-b", null, 600_000),
    conversation("batch-c", null, 600_000),
  ],
  batchLimit
);

assert.deepEqual(
  batches.map((batch) => batch.length),
  [2, 1]
);
assert.deepEqual(
  batches.flat().map((item) => item.sourceConversationId),
  ["batch-a", "batch-b", "batch-c"]
);
assert.ok(
  batches.every(
    (batch) => serializedImportConversationBatchBytes(batch) <= batchLimit
  )
);

assert.throws(
  () =>
    buildImportConversationBatches(
      [conversation("oversized", null, 1_400_000)],
      batchLimit
    ),
  /too large/i
);

assert.doesNotThrow(() => assertValidImportConversationBatch([fresh]));
assert.throws(
  () =>
    assertValidImportConversationBatch([
      {
        ...fresh,
        messages: [{ ...fresh.messages[0], text: 42 }],
      },
    ]),
  /invalid imported conversation batch/i
);
