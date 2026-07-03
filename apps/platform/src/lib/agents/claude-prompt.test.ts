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
    reactions: [],
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
  threadContextSheet: null,
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
  attachedContexts: [
    {
      node: {
        id: "attached-source",
        title: "Campaign reporting script",
        type: "stack",
      },
      posts: [
        post(
          "attached-context",
          "The campaign reporting SQL parser expects campaign_id aliases.",
          "2026-05-19T02:13:20.000Z"
        ),
      ],
    },
  ],
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

const prompt = renderClaudePrompt(ctx, {
  targetPostId: "target",
  now: new Date("2026-06-22T16:43:00.000Z"),
});

assert.match(
  prompt.systemPrompt,
  /Only respond to the post explicitly marked "TARGET @MENTION TO ANSWER"/
);
assert.match(
  prompt.systemPrompt,
  /Do not turn ambiguous strategic, creative, planning, coaching, or "thought partner" requests into a complete finished artifact/
);
assert.match(
  prompt.systemPrompt,
  /Current WorkOS time: Monday, June 22, 2026 at 12:43 PM America\/New_York\./
);
assert.match(
  prompt.systemPrompt,
  /Before using prior thread context, compare its timestamp to the current WorkOS time\./
);
assert.match(
  prompt.systemPrompt,
  /Ask a brief freshness question if the answer depends on whether it is still true\./
);

assert.ok(
  prompt.userMessage.indexOf('# Attached context: "Campaign reporting script"') <
    prompt.userMessage.indexOf(
      '# Active thread on "AI Diagnostic 2.0: Contextual assessment"'
    )
);

assert.match(
  prompt.userMessage,
  /The campaign reporting SQL parser expects campaign_id aliases\./
);
assert.doesNotMatch(
  prompt.userMessage,
  /The first AI diagnostic scored fluency with a simple ladder\./
);
assert.doesNotMatch(
  prompt.userMessage,
  /@Claude summarize the first AI diagnostic\./
);

const sheetPrompt = renderClaudePrompt(
  {
    ...ctx,
    threadContextSheet: {
      id: "sheet-1",
      instance_id: "instance-1",
      thread_id: "active-card",
      active_working: [
        {
          id: "aw",
          statement: "The current task is financial planning synthesis.",
          source_refs: [],
        },
      ],
      short_term: [],
      long_term: [],
      markdown: "",
      metadata: {},
      created_at: "2026-06-30T12:00:00.000Z",
      updated_at: "2026-06-30T12:00:00.000Z",
    },
  },
  { targetPostId: "target", now: new Date("2026-06-22T16:43:00.000Z") }
);
assert.match(sheetPrompt.userMessage, /# Thread Context Sheet/);
assert.match(sheetPrompt.userMessage, /financial planning synthesis/);

const compactContextPrompt = renderClaudePrompt(
  {
    ...ctx,
    attachedContexts: [
      {
        node: { id: "anthropic", title: "Danny @ Anthropic", type: "stack" },
        posts: [
          post(
            "anthropic-full-context",
            "This full attached thread post should not appear when a compact context pack exists.",
            "2026-05-19T02:13:20.000Z"
          ),
        ],
        contextPack: {
          router_version: "context-router-v1",
          resolved_query: "career advice Anthropic roles",
          source_role: "core",
          relevance_confidence: 0.91,
          reason: "Directly relevant to Anthropic process.",
          useful_facts: ["Danny discussed Anthropic product roles."],
          snippet: "Danny discussed Anthropic product roles and fit.",
          source_origin: "imported",
          source_app: "claude",
          source_provenance: "Claude import",
        },
      },
    ],
  },
  {
    targetPostId: "target",
    now: new Date("2026-06-22T16:43:00.000Z"),
  }
);

assert.match(
  compactContextPrompt.userMessage,
  /# Attached context: "Danny @ Anthropic"/
);
assert.match(compactContextPrompt.userMessage, /Relevance: 91%/);
assert.match(compactContextPrompt.userMessage, /Source role: core/);
assert.match(
  compactContextPrompt.userMessage,
  /Source provenance: Claude import/
);
assert.match(
  compactContextPrompt.userMessage,
  /Why included: Directly relevant to Anthropic process\./
);
assert.match(
  compactContextPrompt.userMessage,
  /Useful facts:\n- Danny discussed Anthropic product roles\./
);
assert.match(
  compactContextPrompt.userMessage,
  /Source snippet:\nDanny discussed Anthropic product roles and fit\./
);
assert.doesNotMatch(
  compactContextPrompt.userMessage,
  /This full attached thread post should not appear/
);

const broadFinancePrompt = renderClaudePrompt(
  {
    ...ctx,
    attachedContexts: [
      {
        node: {
          id: "finance",
          title: "Career and Finance Strategy",
          type: "stack",
        },
        posts: [],
        contextPack: {
          router_version: "context-router-v1",
          resolved_query:
            "comprehensive personal financial assessment across cash runway housing investments inheritance marriage prenup household obligations",
          source_role: "core",
          relevance_confidence: 0.97,
          reason: "Selected as core finance context by reranker.",
          useful_facts: ["Runway, housing, inheritance, and retirement were discussed."],
          snippet: "Financial planning context.",
        },
      },
      {
        node: {
          id: "prenup",
          title: "Evaluating a prenuptial agreement",
          type: "stack",
        },
        posts: [],
        contextPack: {
          router_version: "context-router-v1",
          resolved_query:
            "comprehensive personal financial assessment across cash runway housing investments inheritance marriage prenup household obligations",
          source_role: "supporting",
          relevance_confidence: 0.88,
          reason: "Household and legal obligation context.",
          useful_facts: [
            "Prenup planning may affect future spouse obligations and household financial planning.",
          ],
          snippet: "Prenup and household obligation context.",
        },
      },
      {
        node: {
          id: "credit",
          title: "Disputed T-Mobile collection account on credit report",
          type: "stack",
        },
        posts: [],
        contextPack: {
          router_version: "context-router-v1",
          resolved_query:
            "comprehensive personal financial assessment across cash runway housing investments inheritance marriage prenup household obligations",
          source_role: "watchlist",
          relevance_confidence: 0.74,
          reason: "Narrow credit/collections context.",
          useful_facts: ["A small credit-report dispute exists."],
          snippet: "Credit dispute context.",
        },
      },
    ],
  },
  {
    targetPostId: "target",
    now: new Date("2026-06-22T16:43:00.000Z"),
  }
);

assert.match(broadFinancePrompt.userMessage, /# Attached Context Guidance/);
assert.match(broadFinancePrompt.userMessage, /# Selected Source Fact Check/);
assert.match(
  broadFinancePrompt.userMessage,
  /marriage, prenup, household, and legal obligations/
);
assert.match(
  broadFinancePrompt.userMessage,
  /Evaluating a prenuptial agreement \(supporting, 88%\): Prenup planning may affect future spouse obligations and household financial planning\./
);
assert.match(
  broadFinancePrompt.userMessage,
  /Treat watchlist sources as background/
);
assert.match(broadFinancePrompt.userMessage, /Source role: watchlist/);

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
assert.match(
  prompt.userMessage,
  /- Assumption: Users understand seat pricing\. \(untested\)/
);
assert.match(prompt.userMessage, /- Decision: Lead with team plan\. \(active\)/);
assert.match(prompt.userMessage, /Use the short-form pricing table\./);
assert.match(
  prompt.userMessage,
  /## Missing card \[card\]\nContext unavailable; this node may have been deleted or archived\./
);
assert.match(prompt.userMessage, /2 additional #node mentions omitted/);

assert.match(
  prompt.userMessage,
  /\[Will · Monday, May 18, 2026 at 10:12 PM America\/New_York - 34d ago\]\n@Claude what about the first diagnostic\?/
);
assert.match(
  prompt.userMessage,
  />>> TARGET @MENTION TO ANSWER <<<\n\[Will · Monday, May 18, 2026 at 10:14 PM America\/New_York - 34d ago\]\n@Claude boop/
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

const familyBudgetPrompt = renderClaudePrompt(
  {
    ...ctx,
    parentThread: {
      node: { id: "parent-stack", title: "Big parent", type: "stack" },
      posts: [
        post(
          "parent-raw",
          "This giant raw parent payload should be omitted unless L3 is justified.",
          "2026-05-19T02:13:30.000Z"
        ),
      ],
      contextPack: {
        router_version: "context-router-v1",
        resolved_query: "context router v2",
        relevance_confidence: 0.8,
        reason: "Family thread was scanned and summarized.",
        useful_facts: ["Parent stack contains related architecture notes."],
        snippet: "Related architecture notes.",
      },
    },
    siblingThreads: [
      {
        node: { id: "sibling-card", title: "Sibling", type: "card" },
        posts: [
          post(
            "sibling-raw",
            "This giant raw sibling payload should be omitted.",
            "2026-05-19T02:13:45.000Z"
          ),
        ],
      },
    ],
  },
  { targetPostId: "target", now: new Date("2026-06-22T16:43:00.000Z") }
);

assert.match(
  familyBudgetPrompt.userMessage,
  /Family thread was scanned and summarized/
);
assert.match(
  familyBudgetPrompt.userMessage,
  /Parent stack contains related architecture notes/
);
assert.doesNotMatch(familyBudgetPrompt.userMessage, /giant raw parent payload/);
assert.doesNotMatch(familyBudgetPrompt.userMessage, /giant raw sibling payload/);

const gapPrompt = renderClaudePrompt(
  {
    ...ctx,
    ownThread: [
      post(
        "today",
        "@Claude what should we do now?",
        "2026-06-22T16:43:00.000Z"
      ),
      post("old", "I am exhausted tonight.", "2026-03-21T16:43:00.000Z"),
    ],
  },
  {
    targetPostId: "today",
    now: new Date("2026-06-22T16:43:00.000Z"),
  }
);

assert.match(gapPrompt.userMessage, /--- 93 days pass ---/);
assert.match(
  gapPrompt.userMessage,
  /I am exhausted tonight\.[\s\S]*--- 93 days pass ---[\s\S]*@Claude what should we do now\?/
);

const promptWithStandards = renderClaudePrompt(ctx, {
  targetPostId: "target",
  now: new Date("2026-06-22T16:43:00.000Z"),
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
