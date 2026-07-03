import assert from "node:assert/strict";
import {
  messageAnchorId,
  sourceAppFromMetadata,
  sourceAppLabel,
  sourceAppMark,
  sourceThreadHref,
} from "./post-source-links";

assert.equal(messageAnchorId("post-1"), "message-post-1");

assert.equal(sourceThreadHref("thread-1"), "/n/thread-1");
assert.equal(
  sourceThreadHref("thread-1", "post-1"),
  "/n/thread-1#message-post-1"
);

assert.equal(sourceAppLabel("claude"), "Claude");
assert.equal(sourceAppLabel("chatgpt"), "ChatGPT");
assert.equal(sourceAppLabel("workos"), "WorkOS");
assert.equal(sourceAppLabel("unknown"), "Unknown");
assert.equal(sourceAppLabel(null), "Unknown");
assert.equal(sourceAppLabel(undefined), "Unknown");

assert.equal(sourceAppMark("workos"), "W");
assert.equal(sourceAppMark("claude"), "C");
assert.equal(sourceAppMark("chatgpt"), "G");
assert.equal(sourceAppMark("unknown"), "?");
assert.equal(sourceAppMark(null), "?");
assert.equal(sourceAppMark(undefined), "?");

assert.equal(sourceAppFromMetadata("claude"), "claude");
assert.equal(sourceAppFromMetadata("chatgpt"), "chatgpt");
assert.equal(sourceAppFromMetadata("workos"), "workos");
assert.equal(sourceAppFromMetadata("unexpected"), "unknown");
assert.equal(sourceAppFromMetadata(null), "unknown");
