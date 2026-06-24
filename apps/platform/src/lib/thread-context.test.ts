import assert from "node:assert/strict";
import {
  buildContextEventMetadata,
  chooseAutomaticContextCandidates,
  contextEventSummary,
  isContextEventPost,
} from "./thread-context";
import type { ContextSearchCandidate } from "./context-search";

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

const automaticCandidates: ContextSearchCandidate[] = [
  {
    id: "campaign-reporting-script",
    title: "Campaign reporting script",
    path: "Imported chats / Campaign reporting script",
    type: "stack",
    href: "/n/campaign-reporting-script",
    sourceApp: "claude",
    updatedAt: "2026-06-21T12:00:00.000Z",
    bodyPreview:
      "We debugged the reporting SQL parser for campaign reporting exports.",
  },
  {
    id: "vacation-plan",
    title: "Vacation plan",
    path: "Imported chats / Vacation plan",
    type: "stack",
    href: "/n/vacation-plan",
    sourceApp: "chatgpt",
    updatedAt: "2026-06-22T12:00:00.000Z",
    bodyPreview: "Flights and hotels for August.",
  },
];

assert.deepEqual(
  chooseAutomaticContextCandidates({
    userText: "I want to keep working on the reporting SQL parser",
    candidates: automaticCandidates,
    limit: 1,
  }).map((candidate) => candidate.id),
  ["campaign-reporting-script"]
);

assert.deepEqual(
  chooseAutomaticContextCandidates({
    userText: "Tell Claude about the hotel options",
    candidates: automaticCandidates,
    limit: 5,
  }).map((candidate) => candidate.id),
  []
);

assert.deepEqual(
  chooseAutomaticContextCandidates({
    userText: "Can you help?",
    candidates: automaticCandidates,
    limit: 5,
  }),
  []
);
