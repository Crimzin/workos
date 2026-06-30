import assert from "node:assert/strict";
import { buildContextChunksForImportedPost } from "./chunks.ts";

const boundaryPhrase = "Anthropic career role fit";
const chunks = buildContextChunksForImportedPost({
  instanceId: "instance-1",
  sourceNodeId: "node-1",
  sourcePostId: "post-1",
  sourceMessageId: "message-1",
  text: "A".repeat(2_390) + boundaryPhrase + "B".repeat(900),
});

assert.ok(chunks.length >= 2);
assert.equal(chunks[0].instance_id, "instance-1");
assert.equal(chunks[0].source_node_id, "node-1");
assert.equal(chunks[0].source_post_id, "post-1");
assert.equal(chunks[0].source_message_id, "message-1");
assert.equal(chunks[0].chunk_index, 0);
assert.equal(chunks[0].text.includes(boundaryPhrase), false);
assert.ok(chunks.slice(1).some((chunk) => chunk.text.includes(boundaryPhrase)));
