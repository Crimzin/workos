# Hash Node Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `#` node mentions in WorkOS posts and inject explicitly mentioned node context into agent prompts.

**Architecture:** Store node mentions as BlockNote inline content (`nodeMention`) inside the existing post body JSON. Add a pure extraction helper used by agent routing, a small API endpoint for editor search suggestions, and a light mentioned-node context slice rendered before the active thread in Claude prompts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, BlockNote, Supabase, Node assert tests run with `npx tsx`.

---

## File Map

- `apps/platform/src/lib/node-mentions.ts` — pure node mention types, BlockNote JSON extraction, candidate filtering/path rendering.
- `apps/platform/src/lib/node-mentions.test.ts` — parser and candidate filtering tests.
- `apps/platform/src/lib/nodes.ts` — Supabase-backed node mention candidate search.
- `apps/platform/src/app/api/nodes/mentions/route.ts` — client-facing endpoint for `#` picker suggestions.
- `apps/platform/src/components/post-editor.tsx` — `nodeMention` inline spec, `#` suggestion menu, node candidate fetch.
- `apps/platform/src/lib/blocknote-markdown.ts` — copy/export renders node mentions as `#Title`.
- `apps/platform/src/lib/agents/node-context.ts` — gather light context slices for node mentions from the target post.
- `apps/platform/src/lib/agents/claude-prompt.ts` — render mentioned-node context before the active thread.
- `apps/platform/src/lib/agents/claude-prompt.test.ts` — prompt rendering coverage for mentioned-node context and omitted-node note.
- `apps/platform/src/lib/agents/router.ts` — enrich `NodeContext` with target-post node mentions before routing.

## Task 1: Add Pure Node Mention Parser

**Files:**
- Create: `apps/platform/src/lib/node-mentions.ts`
- Create: `apps/platform/src/lib/node-mentions.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `apps/platform/src/lib/node-mentions.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildNodeMentionCandidates,
  findNodeMentions,
  limitNodeMentions,
  type NodeMentionSearchRow,
} from "./node-mentions";

const body = JSON.stringify([
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Use ", styles: {} },
      {
        type: "nodeMention",
        props: { id: "card-1", title: "Pricing rewrite", type: "card" },
      },
      { type: "text", text: " and ", styles: {} },
      {
        type: "nodeMention",
        props: { id: "stack-1", title: "Launch plan", nodeType: "stack" },
      },
    ],
  },
  {
    type: "bulletListItem",
    children: [
      {
        type: "paragraph",
        content: [
          {
            type: "nodeMention",
            props: { id: "card-1", title: "Pricing rewrite", type: "card" },
          },
        ],
      },
    ],
  },
]);

assert.deepEqual(findNodeMentions(body), [
  { id: "card-1", title: "Pricing rewrite", type: "card" },
  { id: "stack-1", title: "Launch plan", type: "stack" },
]);

assert.deepEqual(findNodeMentions("not json"), []);

const limited = limitNodeMentions(
  [
    { id: "1", title: "One", type: "card" },
    { id: "2", title: "Two", type: "card" },
    { id: "3", title: "Three", type: "card" },
  ],
  2
);
assert.deepEqual(limited.included.map((item) => item.id), ["1", "2"]);
assert.equal(limited.omittedCount, 1);

const rows: NodeMentionSearchRow[] = [
  { id: "workspace", title: "WorkOS", type: "workspace", parent_id: null },
  { id: "stack", title: "BrainShare", type: "stack", parent_id: "workspace" },
  { id: "card", title: "Context routing", type: "card", parent_id: "stack" },
  { id: "other", title: "Finance", type: "stack", parent_id: "workspace" },
];

assert.deepEqual(buildNodeMentionCandidates(rows, "context", 10), [
  {
    id: "card",
    title: "Context routing",
    type: "card",
    path: "WorkOS / BrainShare / Context routing",
  },
]);

assert.deepEqual(
  buildNodeMentionCandidates(rows, "", 2).map((candidate) => candidate.id),
  ["workspace", "stack"]
);
```

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npx tsx apps/platform/src/lib/node-mentions.test.ts`

Expected: FAIL because `apps/platform/src/lib/node-mentions.ts` does not exist.

- [ ] **Step 3: Implement the parser helper**

Create `apps/platform/src/lib/node-mentions.ts` with exported types/functions:

```ts
import type { NodeType } from "./types";

export interface NodeMentionRef {
  id: string;
  title: string;
  type: NodeType;
}

export interface NodeMentionSearchRow {
  id: string;
  title: string;
  type: NodeType;
  parent_id: string | null;
}

export interface NodeMentionCandidate extends NodeMentionRef {
  path: string;
}

export const MAX_MENTIONED_NODE_CONTEXTS = 5;
export const MENTIONED_NODE_POST_LIMIT = 10;

// Walk BlockNote JSON and return deduped node mentions in first-seen order.
export function findNodeMentions(bodyJson: string | null | undefined): NodeMentionRef[];

// Return first N mentions plus count omitted after the cap.
export function limitNodeMentions(
  mentions: NodeMentionRef[],
  limit?: number
): { included: NodeMentionRef[]; omittedCount: number };

// Build picker rows with breadcrumb paths, filtered by title/path text.
export function buildNodeMentionCandidates(
  rows: NodeMentionSearchRow[],
  query: string,
  limit: number
): NodeMentionCandidate[];
```

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `npx tsx apps/platform/src/lib/node-mentions.test.ts`

Expected: PASS.

## Task 2: Add Mentioned-Node Prompt Context

**Files:**
- Modify: `apps/platform/src/lib/agents/node-context.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`
- Modify: `apps/platform/src/lib/agents/router.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.test.ts`

- [ ] **Step 1: Write failing prompt assertions**

Extend `apps/platform/src/lib/agents/claude-prompt.test.ts` by creating a context with:

```ts
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
      assumptions: [{ statement: "Users understand seat pricing.", status: "untested" }],
      decisions: [{ statement: "Lead with team plan.", body: null, status: "active" }],
    },
    posts: [post("pricing-post", "Use the short-form pricing table.", "2026-05-19T02:13:50.000Z")],
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
```

Assert that the rendered prompt includes `# Mentioned Node Context`, the Pricing rewrite path, memory, recent thread text, an unavailable line for Missing card, and `2 additional #node mentions omitted`.

- [ ] **Step 2: Run prompt test and verify RED**

Run: `npx tsx apps/platform/src/lib/agents/claude-prompt.test.ts`

Expected: FAIL because `NodeContext` and `renderClaudePrompt` do not support mentioned nodes yet.

- [ ] **Step 3: Implement mentioned-node context types and renderer**

Add optional `mentionedNodes` and `omittedMentionedNodeCount` to `NodeContext`. Add `gatherMentionedNodeContextsFromBody(body)` that extracts target-post mentions, caps to 5, fetches each node's light context, and returns missing-node placeholders. Add prompt rendering section before the active thread.

- [ ] **Step 4: Enrich context in router**

In `routeAgentMentions`, after `gatherNodeContext(input.nodeId)`, call `gatherMentionedNodeContextsFromBody(input.targetPost.body)` and merge the returned fields into the `NodeContext` passed to both inline chat and coding plan rendering.

- [ ] **Step 5: Run prompt and parser tests**

Run:

```bash
npx tsx apps/platform/src/lib/node-mentions.test.ts
npx tsx apps/platform/src/lib/agents/claude-prompt.test.ts
```

Expected: both PASS.

## Task 3: Add Node Search API and Editor UI

**Files:**
- Modify: `apps/platform/src/lib/nodes.ts`
- Create: `apps/platform/src/app/api/nodes/mentions/route.ts`
- Modify: `apps/platform/src/components/post-editor.tsx`
- Modify: `apps/platform/src/lib/blocknote-markdown.ts`

- [ ] **Step 1: Write failing markdown assertion**

Extend `apps/platform/src/lib/blocknote-markdown.test.ts` with a paragraph containing `{ type: "nodeMention", props: { title: "Pricing rewrite" } }` and assert it renders as `#Pricing rewrite`.

- [ ] **Step 2: Run markdown test and verify RED**

Run: `npx tsx apps/platform/src/lib/blocknote-markdown.test.ts`

Expected: FAIL because `nodeMention` currently renders as empty text.

- [ ] **Step 3: Add search helper and API endpoint**

In `apps/platform/src/lib/nodes.ts`, add `searchNodeMentionCandidates(instanceId, query, limit)` that selects non-archived nodes in the instance and passes rows through `buildNodeMentionCandidates`.

Create `apps/platform/src/app/api/nodes/mentions/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/actor";
import { searchNodeMentionCandidates } from "@/lib/nodes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await getCurrentActor();
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const nodes = await searchNodeMentionCandidates(actor.instance_id, query, 12);
  return NextResponse.json({ nodes });
}
```

- [ ] **Step 4: Add `nodeMention` inline spec and `#` menu**

In `post-editor.tsx`, add a `NodeMentionSpec` to the schema. In editable mode, add a `SuggestionMenuController` with `triggerCharacter="#"` that fetches `/api/nodes/mentions?q=${encodeURIComponent(query)}` and inserts:

```ts
{
  type: "nodeMention",
  props: { id: node.id, title: node.title, type: node.type },
}
```

Render node mentions as compact clickable `#Title` tokens linking to `/n/<id>`.

- [ ] **Step 5: Update markdown conversion**

In `blocknote-markdown.ts`, render `inline.type === "nodeMention"` as `#${title}` using `inline.props.title`.

- [ ] **Step 6: Run parser and markdown tests**

Run:

```bash
npx tsx apps/platform/src/lib/node-mentions.test.ts
npx tsx apps/platform/src/lib/blocknote-markdown.test.ts
```

Expected: both PASS.

## Task 4: Verification

**Files:**
- All files touched above.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx tsx apps/platform/src/lib/node-mentions.test.ts
npx tsx apps/platform/src/lib/blocknote-markdown.test.ts
npx tsx apps/platform/src/lib/agents/claude-prompt.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run type/lint verification**

Run:

```bash
npm --workspace @workos/platform run lint
```

Expected: PASS or only pre-existing unrelated warnings/errors clearly reported.

- [ ] **Step 3: Review diff for scope**

Run:

```bash
git diff -- apps/platform/src/lib/node-mentions.ts apps/platform/src/lib/node-mentions.test.ts apps/platform/src/lib/nodes.ts apps/platform/src/app/api/nodes/mentions/route.ts apps/platform/src/components/post-editor.tsx apps/platform/src/lib/blocknote-markdown.ts apps/platform/src/lib/blocknote-markdown.test.ts apps/platform/src/lib/agents/node-context.ts apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts apps/platform/src/lib/agents/router.ts
```

Expected: only `#` node mention parser, picker, context, and prompt changes.
