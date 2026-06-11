import assert from "node:assert/strict";
import { renderClaudePrompt } from "./claude-prompt.ts";
import type { NodeContext } from "./node-context";
import type { PostRecord } from "../posts";

function body(text: string): string {
  return JSON.stringify([
    {
      type: "paragraph",
      content: [{ type: "text", text, styles: {} }],
    },
  ]);
}

function post(id: string, text: string, createdAt: string): PostRecord {
  return {
    id,
    node_id: "active-card",
    actor_id: "will",
    post_type: "post",
    body: body(text),
    metadata: null,
    pinned: false,
    pinned_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    actor: { id: "will", name: "Will", kind: "human" },
  };
}

function postWithImage(
  id: string,
  text: string,
  imageUrl: string,
  createdAt: string
): PostRecord {
  return {
    ...post(id, text, createdAt),
    body: JSON.stringify([
      {
        type: "paragraph",
        content: [{ type: "text", text, styles: {} }],
      },
      {
        type: "image",
        props: {
          url: imageUrl,
          caption: "Reference screenshot",
          name: "reference.png",
        },
      },
    ]),
  };
}

const ctx: NodeContext = {
  node: {
    id: "active-card",
    type: "card",
    title: "AI Diagnostic 2.0: Contextual assessment",
    description: null,
  },
  workspaceTitle: "AI & Career Development",
  breadcrumb:
    "AI & Career Development / AI coaching business / AI Diagnostic 2.0: Contextual assessment",
  owner: null,
  members: [],
  fields: [],
  memory: { rationale: null, assumptions: [], decisions: [] },
  // getNodePosts returns newest-first.
  ownThread: [
    postWithImage(
      "target",
      "@Claude boop",
      "https://example.com/reference.png",
      "2026-05-19T02:14:09.000Z"
    ),
    post(
      "previous-mention",
      "@Claude what about the first diagnostic?",
      "2026-05-19T02:12:58.000Z"
    ),
  ],
  parentThread: {
    node: {
      id: "parent-stack",
      title: "AI coaching business",
      type: "stack",
    },
    posts: [
      post(
        "parent-context",
        "The first AI diagnostic scored fluency with a simple ladder.",
        "2026-05-19T02:13:30.000Z"
      ),
    ],
  },
  siblingThreads: [
    {
      node: {
        id: "sibling-card",
        title: "First AI diagnostic",
        type: "card",
      },
      posts: [
        post(
          "sibling-context",
          "@Claude summarize the first AI diagnostic.",
          "2026-05-19T02:13:45.000Z"
        ),
      ],
    },
  ],
  childThreads: [],
  links: [],
  mentionedNodes: [
    {
      mention: { id: "pricing-card", title: "Pricing rewrite", type: "card" },
      found: true,
      node: { id: "pricing-card", title: "Pricing rewrite", type: "card" },
      workspaceTitle: "Growth",
      breadcrumb: "Growth / Website / Pricing rewrite",
      owner: { id: "will", name: "Will", kind: "human" },
      members: [],
      fields: [{ name: "Status", rendered: "In progress" }],
      memory: {
        rationale: "Clarify packaging before launch.",
        assumptions: [
          { statement: "Users understand seat pricing.", status: "untested" },
        ],
        decisions: [
          { statement: "Lead with team plan.", body: null, status: "active" },
        ],
      },
      posts: [
        post(
          "pricing-post",
          "Use the short-form pricing table.",
          "2026-05-19T02:13:50.000Z"
        ),
      ],
    },
    {
      mention: { id: "missing-card", title: "Missing card", type: "card" },
      found: false,
      node: null,
      workspaceTitle: null,
      breadcrumb: null,
      owner: null,
      members: [],
      fields: [],
      memory: { rationale: null, assumptions: [], decisions: [] },
      posts: [],
    },
  ],
  omittedMentionedNodeCount: 2,
};

const prompt = renderClaudePrompt(ctx, { targetPostId: "target" });

assert.match(
  prompt.systemPrompt,
  /Only respond to the post explicitly marked "TARGET @MENTION TO ANSWER"/
);
assert.match(
  prompt.systemPrompt,
  /Do not turn ambiguous strategic, creative, planning, coaching, or "thought partner" requests into a complete finished artifact/
);

assert.ok(
  prompt.userMessage.indexOf('# Sibling card: "First AI diagnostic"') <
    prompt.userMessage.indexOf(
      '# Active thread on "AI Diagnostic 2.0: Contextual assessment"'
    )
);

assert.ok(
  prompt.userMessage.indexOf("# Mentioned Node Context") <
    prompt.userMessage.indexOf(
      '# Active thread on "AI Diagnostic 2.0: Contextual assessment"'
    )
);
assert.match(prompt.userMessage, /## Pricing rewrite \[card\]/);
assert.match(prompt.userMessage, /Path: Growth \/ Website \/ Pricing rewrite/);
assert.match(prompt.userMessage, /- Status: In progress/);
assert.match(prompt.userMessage, /Rationale: Clarify packaging before launch\./);
assert.match(prompt.userMessage, /- Assumption: Users understand seat pricing\. \(untested\)/);
assert.match(prompt.userMessage, /- Decision: Lead with team plan\. \(active\)/);
assert.match(prompt.userMessage, /Use the short-form pricing table\./);
assert.match(
  prompt.userMessage,
  /## Missing card \[card\]\nContext unavailable; this node may have been deleted or archived\./
);
assert.match(prompt.userMessage, /2 additional #node mentions omitted/);

assert.match(
  prompt.userMessage,
  />>> TARGET @MENTION TO ANSWER <<<\n\[Will · .*?\]\n@Claude boop/
);
assert.deepEqual(prompt.attachments, [
  {
    kind: "image",
    url: "https://example.com/reference.png",
    title: "reference.png",
    caption: "Reference screenshot",
    source: {
      postId: "target",
      section: 'Active thread on "AI Diagnostic 2.0: Contextual assessment"',
      authorName: "Will",
    },
  },
]);

assert.match(
  prompt.userMessage,
  /Respond only to the post marked "TARGET @MENTION TO ANSWER"\.$/
);

const promptWithStandards = renderClaudePrompt(ctx, {
  targetPostId: "target",
  standards: [
    {
      standard_key: "standard.output.pyramid_principle",
      category: "output",
      title: "Pyramid principle",
      instruction: "Lead with the answer, then support it.",
      mode: "visible_when_useful",
      enabled: true,
      position: 10,
      source: "default",
    },
  ],
});

assert.match(
  promptWithStandards.systemPrompt,
  /# BrainShare Inborn AI Standards/
);
assert.match(promptWithStandards.systemPrompt, /Response-mode protocol/);
assert.match(promptWithStandards.systemPrompt, /Pyramid principle/);
assert.match(
  promptWithStandards.systemPrompt,
  /Only respond to the post explicitly marked/
);
