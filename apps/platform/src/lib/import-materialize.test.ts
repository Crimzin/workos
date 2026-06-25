import assert from "node:assert/strict";
import {
  assertHasReadableImportedConversations,
  buildImportMaterializationPlan,
  buildImportNodeWritePlan,
  buildImportPostWriteRows,
  importedMessageMetadata,
  handoffPostMetadata,
} from "./import-materialize.ts";
import type { NormalizedImportedConversation } from "./import-sources.ts";

const conversation: NormalizedImportedConversation = {
  sourceApp: "claude",
  sourceConversationId: "claude-1",
  title: "Campaign reporting script",
  createdAt: "2026-06-21T10:00:00.000Z",
  updatedAt: "2026-06-21T10:10:00.000Z",
  messages: [
    {
      sourceMessageId: "m1",
      role: "human",
      authorName: "Human",
      text: "Let's fix parsing.",
      createdAt: "2026-06-21T10:00:00.000Z",
      sourceIndex: 0,
    },
    {
      sourceMessageId: "m2",
      role: "assistant",
      authorName: "Claude",
      text: "The delimiter is ambiguous.",
      createdAt: "2026-06-21T10:01:00.000Z",
      sourceIndex: 1,
    },
  ],
};

const plan = buildImportMaterializationPlan({
  instanceId: "instance-1",
  importSessionId: "session-1",
  conversations: [conversation],
  firstPosition: 100,
});

assert.equal(plan.nodes.length, 1);
assert.equal(plan.nodes[0].type, "stack");
assert.equal(plan.nodes[0].source_kind, "imported_ai_chat");
assert.equal(plan.nodes[0].source_app, "claude");
assert.equal(plan.nodes[0].title, "Campaign reporting script");
assert.equal(plan.posts.length, 2);
assert.equal(plan.posts[0].metadata.source_message_id, "m1");
assert.equal(plan.posts[1].metadata.source_role, "assistant");

assert.deepEqual(importedMessageMetadata(conversation, conversation.messages[0]), {
  imported_message: true,
  source_app: "claude",
  source_conversation_id: "claude-1",
  source_message_id: "m1",
  source_role: "human",
  source_author: "Human",
  source_index: 0,
  source_timestamp: "2026-06-21T10:00:00.000Z",
});

assert.equal(handoffPostMetadata("claude").import_handoff, true);

const existingNodeWrites = buildImportNodeWritePlan(plan.nodes, [
  {
    id: "existing-node-1",
    source_app: "claude",
    source_conversation_id: "claude-1",
  },
]);

assert.equal(existingNodeWrites.inserts.length, 0);
assert.equal(existingNodeWrites.updates.length, 1);
assert.equal(
  existingNodeWrites.nodeIdByClientKey.get("claude:claude-1"),
  "existing-node-1"
);
assert.deepEqual(Object.keys(existingNodeWrites.updates[0]).sort(), [
  "client_key",
  "id",
  "source_created_at",
  "source_hash",
  "source_title",
  "source_updated_at",
]);

const newNodeWrites = buildImportNodeWritePlan(plan.nodes, []);
assert.equal(newNodeWrites.inserts.length, 1);
assert.equal(newNodeWrites.updates.length, 0);
assert.equal(newNodeWrites.inserts[0].title, "Campaign reporting script");

const duplicateBatchNodeWrites = buildImportNodeWritePlan(
  [
    plan.nodes[0],
    {
      ...plan.nodes[0],
      title: "Duplicate should not win",
      position: 101,
    },
  ],
  []
);

assert.equal(duplicateBatchNodeWrites.inserts.length, 1);
assert.equal(
  duplicateBatchNodeWrites.inserts[0].title,
  "Campaign reporting script"
);

const postRows = buildImportPostWriteRows({
  posts: plan.posts,
  nodeIdByClientKey: new Map([["claude:claude-1", "node-1"]]),
  existingSourceMessageIdsByNodeId: new Map([["node-1", new Set(["m1"])]]),
});

assert.equal(postRows.length, 1);
assert.equal(postRows[0].node_id, "node-1");
assert.equal(postRows[0].metadata.source_message_id, "m2");

assert.throws(
  () => assertHasReadableImportedConversations([]),
  /No readable Claude or ChatGPT chats found\./
);
