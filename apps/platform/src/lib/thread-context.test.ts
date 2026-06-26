import assert from "node:assert/strict";
import {
  AUTOMATIC_CONTEXT_AUTO_ATTACH_LIMIT,
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
    userText: "@Claude continue working on the reporting SQL parser",
    candidates: automaticCandidates,
    limit: 1,
  }).map((candidate) => candidate.id),
  ["campaign-reporting-script"]
);

assert.deepEqual(
  chooseAutomaticContextCandidates({
    userText: "@Claude Code continue working on the reporting SQL parser",
    candidates: automaticCandidates,
    limit: 1,
  }).map((candidate) => candidate.id),
  ["campaign-reporting-script"]
);

assert.deepEqual(
  chooseAutomaticContextCandidates({
    userText: "@Claude Code continue working on the reporting SQL parser",
    candidates: [
      {
        id: "split-match",
        title: "Reporting script",
        path: "Imported chats / Reporting script",
        type: "stack",
        href: "/n/split-match",
        sourceApp: "claude",
        updatedAt: "2026-06-23T12:00:00.000Z",
        bodyPreview: "We debugged the SQL parser exports.",
      },
    ],
    limit: 1,
  }).map((candidate) => candidate.id),
  ["split-match"]
);

const [careerMatch] = chooseAutomaticContextCandidates({
  userText:
    "I need career advice. at this stage in my career, what sorts of roles do you think I should be looking at?",
  candidates: [
    {
      id: "career-strategy",
      title: "Career path: speaking talent vs. research passion",
      path: "Imported chats / Career path: speaking talent vs. research passion",
      type: "stack",
      href: "/n/career-strategy",
      sourceApp: "claude",
      sourcePostId: "post-career-role",
      sourceMessageId: "message-career-role",
      bodyPreview:
        "We compared AI product strategy roles, talent management, founder/operator paths, and the kind of career move that would fit your current stage.",
    },
    {
      id: "budget",
      title: "Personal finance review",
      path: "Imported chats / Personal finance review",
      type: "stack",
      href: "/n/budget",
      sourceApp: "claude",
      bodyPreview: "Rent, runway, and savings targets.",
    },
  ],
  limit: 1,
});

assert.equal(careerMatch.id, "career-strategy");
assert.equal(careerMatch.sourcePostId, "post-career-role");
assert.equal(careerMatch.sourceMessageId, "message-career-role");
assert.ok(careerMatch.matchedTokens.includes("career"));
assert.ok(careerMatch.matchedTokens.includes("roles"));

const manyRelevantCareerCandidates: ContextSearchCandidate[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `career-${index}`,
    title: `Career strategy ${index}`,
    path: `Imported chats / Career strategy ${index}`,
    type: "stack",
    href: `/n/career-${index}`,
    sourceApp: "claude",
    bodyPreview: "Career advice about role fit and next moves.",
  })
);

assert.equal(AUTOMATIC_CONTEXT_AUTO_ATTACH_LIMIT, 8);
assert.equal(
  chooseAutomaticContextCandidates({
    userText: "I need career advice about role fit",
    candidates: manyRelevantCareerCandidates,
    limit: AUTOMATIC_CONTEXT_AUTO_ATTACH_LIMIT,
  }).length,
  8
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
