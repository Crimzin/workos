import assert from "node:assert/strict";
import {
  buildContextEventMetadata,
  contextEventSummary,
  isContextEventPost,
} from "./thread-context";

const attachedMetadata = buildContextEventMetadata({
  action: "attached",
  sourceNodeId: "source-thread-1",
  sourceTitle: "Campaign reporting script",
  sourceApp: "claude",
  sourcePostId: "post-1",
  reason: "Useful implementation detail",
});

assert.deepEqual(attachedMetadata, {
  context_event: true,
  action: "attached",
  source_node_id: "source-thread-1",
  source_title: "Campaign reporting script",
  source_app: "claude",
  source_post_id: "post-1",
  reason: "Useful implementation detail",
});

assert.equal(
  contextEventSummary(attachedMetadata),
  "Added context from Claude: Campaign reporting script"
);

assert.equal(
  contextEventSummary({
    ...attachedMetadata,
    action: "removed",
    source_title: "Title",
  }),
  "Removed context from this thread: Title"
);

assert.equal(
  contextEventSummary({
    ...attachedMetadata,
    action: "ignored",
    source_title: "Title",
  }),
  "Ignored Claude going forward: Title"
);

assert.equal(
  contextEventSummary({
    ...attachedMetadata,
    action: "allowed",
    source_title: "Title",
  }),
  "Allowed Claude in suggestions: Title"
);

assert.equal(
  isContextEventPost({ post_type: "context_event", metadata: attachedMetadata }),
  true
);

assert.equal(
  isContextEventPost({ post_type: "post", metadata: attachedMetadata }),
  false
);
