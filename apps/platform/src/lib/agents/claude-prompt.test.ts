import assert from "node:assert/strict";
import { renderClaudePrompt } from "./claude-prompt";
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
    post("target", "@Claude boop", "2026-05-19T02:14:09.000Z"),
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
};

const prompt = renderClaudePrompt(ctx, { targetPostId: "target" });

assert.match(
  prompt.systemPrompt,
  /Only respond to the post explicitly marked "TARGET @MENTION TO ANSWER"/
);

assert.ok(
  prompt.userMessage.indexOf('# Sibling card: "First AI diagnostic"') <
    prompt.userMessage.indexOf(
      '# Active thread on "AI Diagnostic 2.0: Contextual assessment"'
    )
);

assert.match(
  prompt.userMessage,
  />>> TARGET @MENTION TO ANSWER <<<\n\[Will · .*?\]\n@Claude boop/
);

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
assert.match(promptWithStandards.systemPrompt, /Pyramid principle/);
assert.match(
  promptWithStandards.systemPrompt,
  /Only respond to the post explicitly marked/
);
