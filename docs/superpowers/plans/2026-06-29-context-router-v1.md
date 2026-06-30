# Context Router V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace brittle automatic context attachment with an LLM-assisted Context Router that understands the current turn, reranks candidate imported chats, gates low-confidence matches, and sends compact cited context into the answer prompt.

**Architecture:** Keep deterministic WorkOS topology context intact, but route imported/automatic context through a new server-side `context-router` module. The router resolves user intent with a cheap model call, gathers broad candidates from existing imported chat posts, asks an LLM reranker to include/exclude candidates with source anchors, stores compact context packs on `thread_context_attachments.metadata`, and prompt rendering uses those packs instead of raw ten-post windows when available.

**Tech Stack:** Next.js server actions, TypeScript, Supabase, Anthropic SDK via existing `invokeClaude`, current `posts`/`nodes`/`thread_context_attachments` tables, Node `assert` tests run with `tsx`, ESLint, TypeScript.

---

## File Structure

- Create `apps/platform/src/lib/context-router/types.ts`  
  Shared router types: resolved turns, candidate snippets, rerank decisions, compact context packs.
- Create `apps/platform/src/lib/context-router/json.ts`  
  Strict JSON extraction and validation helpers for LLM responses.
- Create `apps/platform/src/lib/context-router/turn-resolver.ts`  
  Builds/parses the LLM-assisted turn resolution prompt. Runtime function accepts an injected model caller for tests.
- Create `apps/platform/src/lib/context-router/candidates.ts`  
  Builds broad candidates from existing node/post data and selects snippets around query matches.
- Create `apps/platform/src/lib/context-router/reranker.ts`  
  Builds/parses the LLM reranker prompt and applies confidence gating.
- Create `apps/platform/src/lib/context-router/router.ts`  
  Orchestrates resolver -> candidates -> reranker -> attachment decisions.
- Create tests beside the modules:
  - `apps/platform/src/lib/context-router/json.test.ts`
  - `apps/platform/src/lib/context-router/turn-resolver.test.ts`
  - `apps/platform/src/lib/context-router/candidates.test.ts`
  - `apps/platform/src/lib/context-router/reranker.test.ts`
  - `apps/platform/src/lib/context-router/router.test.ts`
- Modify `apps/platform/src/lib/actions/posts.ts`  
  Replace `attachAutomaticContextForPost` internals with `routeAutomaticContextForPost`.
- Modify `apps/platform/src/lib/actions/thread-context.ts`  
  Allow `attachThreadContext` to persist router metadata/context packs.
- Modify `apps/platform/src/lib/agents/node-context.ts`  
  Read attachment metadata and carry compact packs into prompt context.
- Modify `apps/platform/src/lib/agents/claude-prompt.ts`  
  Render compact context packs when present; otherwise preserve existing post-window behavior.
- Modify `apps/platform/src/lib/thread-context.ts` and `apps/platform/src/lib/thread-context.test.ts` only to remove now-obsolete automatic lexical candidate responsibilities after router tests cover them.

---

### Task 1: Router Types And JSON Parsing

**Files:**
- Create: `apps/platform/src/lib/context-router/types.ts`
- Create: `apps/platform/src/lib/context-router/json.ts`
- Test: `apps/platform/src/lib/context-router/json.test.ts`

- [ ] **Step 1: Write the failing JSON parser test**

```ts
import assert from "node:assert/strict";
import { parseLlmJsonObject } from "./json.ts";

assert.deepEqual(parseLlmJsonObject('{"ok":true}'), { ok: true });
assert.deepEqual(parseLlmJsonObject('Here:\n```json\n{"score":0.9}\n```'), {
  score: 0.9,
});
assert.throws(() => parseLlmJsonObject("not json"), /LLM response did not contain a JSON object/);
assert.throws(() => parseLlmJsonObject("[1,2,3]"), /LLM response JSON was not an object/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/json.test.ts
```

Expected: FAIL because `context-router/json.ts` does not exist.

- [ ] **Step 3: Add router types and JSON parser**

Create `apps/platform/src/lib/context-router/types.ts`:

```ts
import type { SourceApp } from "../types";

export interface ContextTurnResolution {
  originalText: string;
  resolvedQuery: string;
  shouldRetrieve: boolean;
  confidence: number;
  reason: string;
}

export interface ContextRouterCandidate {
  id: string;
  title: string;
  sourceApp: SourceApp;
  updatedAt: string | null;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  snippet: string;
  lexicalScore: number;
}

export interface ContextRerankDecision {
  candidateId: string;
  action: "include" | "exclude";
  confidence: number;
  reason: string;
  usefulFacts: string[];
  sourcePostId: string | null;
  sourceMessageId: string | null;
}

export interface ContextPack {
  router_version: "context-router-v1";
  resolved_query: string;
  relevance_confidence: number;
  reason: string;
  useful_facts: string[];
  snippet: string;
}
```

Create `apps/platform/src/lib/context-router/json.ts`:

```ts
export function parseLlmJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("LLM response JSON was not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes("not an object")) throw err;
    throw new Error("LLM response did not contain a JSON object");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/json.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/context-router/types.ts apps/platform/src/lib/context-router/json.ts apps/platform/src/lib/context-router/json.test.ts
git commit -m "feat(context): add router json helpers"
```

---

### Task 2: LLM-Assisted Turn Resolver

**Files:**
- Create: `apps/platform/src/lib/context-router/turn-resolver.ts`
- Test: `apps/platform/src/lib/context-router/turn-resolver.test.ts`

- [ ] **Step 1: Write the failing resolver test**

```ts
import assert from "node:assert/strict";
import {
  buildTurnResolverPrompt,
  parseTurnResolution,
  resolveContextTurn,
} from "./turn-resolver.ts";

const prompt = buildTurnResolverPrompt({
  currentText: "try yet again",
  previousUserTexts: [
    "I need career advice. at this stage in my career, what sorts of roles should I be looking at?",
  ],
  activeThreadTitle: "AI & Career Development",
});

assert.match(prompt.system, /Resolve the user's current turn/);
assert.match(prompt.user, /try yet again/);
assert.match(prompt.user, /career advice/);

assert.deepEqual(
  parseTurnResolution(
    '{"resolved_query":"career advice roles based on prior background","should_retrieve":true,"confidence":0.92,"reason":"Continuation of previous career question"}',
    "try yet again"
  ),
  {
    originalText: "try yet again",
    resolvedQuery: "career advice roles based on prior background",
    shouldRetrieve: true,
    confidence: 0.92,
    reason: "Continuation of previous career question",
  }
);

const resolved = await resolveContextTurn(
  {
    currentText: "keep going",
    previousUserTexts: ["Compare Anthropic and Reflection roles."],
    activeThreadTitle: "Career",
  },
  async () =>
    '{"resolved_query":"Compare Anthropic and Reflection roles.","should_retrieve":true,"confidence":0.88,"reason":"Continuation request"}'
);

assert.equal(resolved.resolvedQuery, "Compare Anthropic and Reflection roles.");
assert.equal(resolved.shouldRetrieve, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/turn-resolver.test.ts
```

Expected: FAIL because `turn-resolver.ts` does not exist.

- [ ] **Step 3: Implement resolver**

Create `apps/platform/src/lib/context-router/turn-resolver.ts`:

```ts
import { invokeClaude } from "../agents/claude";
import type { ContextTurnResolution } from "./types";
import { parseLlmJsonObject } from "./json";

const TURN_RESOLVER_MODEL = "claude-haiku-4-5";

export interface TurnResolverInput {
  currentText: string;
  previousUserTexts: string[];
  activeThreadTitle: string;
}

export interface TurnResolverPrompt {
  system: string;
  user: string;
}

export type TurnResolverCaller = (prompt: TurnResolverPrompt) => Promise<string>;

export function buildTurnResolverPrompt(input: TurnResolverInput): TurnResolverPrompt {
  return {
    system:
      "Resolve the user's current turn for context retrieval inside WorkOS. If the current turn is vague, infer the real retrieval query from the active thread and recent user turns. Return strict JSON only.",
    user: JSON.stringify({
      active_thread_title: input.activeThreadTitle,
      current_text: input.currentText,
      previous_user_texts: input.previousUserTexts,
      required_json_shape: {
        resolved_query: "string",
        should_retrieve: "boolean",
        confidence: "number 0..1",
        reason: "short string",
      },
    }),
  };
}

export function parseTurnResolution(
  text: string,
  originalText: string
): ContextTurnResolution {
  const data = parseLlmJsonObject(text);
  const resolvedQuery =
    typeof data.resolved_query === "string" && data.resolved_query.trim()
      ? data.resolved_query.trim()
      : originalText.trim();

  return {
    originalText,
    resolvedQuery,
    shouldRetrieve: data.should_retrieve !== false,
    confidence:
      typeof data.confidence === "number" && Number.isFinite(data.confidence)
        ? Math.max(0, Math.min(1, data.confidence))
        : 0.5,
    reason:
      typeof data.reason === "string" && data.reason.trim()
        ? data.reason.trim()
        : "Resolved by Context Router.",
  };
}

export async function resolveContextTurn(
  input: TurnResolverInput,
  caller: TurnResolverCaller = async (prompt) =>
    invokeClaude({
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      model: TURN_RESOLVER_MODEL,
      maxTokens: 600,
    })
): Promise<ContextTurnResolution> {
  const prompt = buildTurnResolverPrompt(input);
  const text = await caller(prompt);
  return parseTurnResolution(text, input.currentText);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/turn-resolver.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/context-router/turn-resolver.ts apps/platform/src/lib/context-router/turn-resolver.test.ts
git commit -m "feat(context): resolve vague turns with llm"
```

---

### Task 3: Candidate Snippet Generation From Existing Imported Posts

**Files:**
- Create: `apps/platform/src/lib/context-router/candidates.ts`
- Test: `apps/platform/src/lib/context-router/candidates.test.ts`

- [ ] **Step 1: Write the failing candidate test**

```ts
import assert from "node:assert/strict";
import {
  buildCandidateSnippet,
  rankCandidateSnippets,
} from "./candidates.ts";

const careerSnippet = buildCandidateSnippet({
  query: "career Anthropic role product growth",
  text:
    "We discussed Will's product growth background at Vega Factor and why Anthropic roles should be evaluated against frontier AI product leverage.",
  maxChars: 140,
});

assert.match(careerSnippet.snippet, /product growth/);
assert.ok(careerSnippet.lexicalScore > 0);

const ranked = rankCandidateSnippets("career Anthropic role", [
  {
    id: "cat",
    title: "Cat scratch",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "p1",
    sourceMessageId: "m1",
    snippet: "A cat scratched my girlfriend.",
    lexicalScore: 0,
  },
  {
    id: "anthropic",
    title: "Danny @ Anthropic",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "p2",
    sourceMessageId: "m2",
    snippet: "Danny discussed Anthropic roles and product strategy.",
    lexicalScore: 3,
  },
]);

assert.deepEqual(ranked.map((item) => item.id), ["anthropic"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/candidates.test.ts
```

Expected: FAIL because `candidates.ts` does not exist.

- [ ] **Step 3: Implement pure candidate helpers**

Create `apps/platform/src/lib/context-router/candidates.ts`:

```ts
import { normalizeSearchText, tokenizeSearchText } from "../context-search";
import type { SourceApp } from "../types";
import type { ContextRouterCandidate } from "./types";

export interface BuildCandidateSnippetInput {
  query: string;
  text: string;
  maxChars: number;
}

export function buildCandidateSnippet(
  input: BuildCandidateSnippetInput
): { snippet: string; lexicalScore: number } {
  const queryTokens = [...new Set(tokenizeSearchText(input.query))].filter(
    (token) => token.length >= 3
  );
  const normalizedText = normalizeSearchText(input.text);
  const matches = queryTokens.filter((token) => normalizedText.includes(token));
  const firstIndex = matches
    .map((token) => normalizedText.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const center = firstIndex ?? 0;
  const start = Math.max(0, center - Math.floor(input.maxChars / 3));
  const end = Math.min(input.text.length, start + input.maxChars);

  return {
    snippet: `${start > 0 ? "..." : ""}${input.text.slice(start, end)}${
      end < input.text.length ? "..." : ""
    }`,
    lexicalScore: matches.length,
  };
}

export function rankCandidateSnippets(
  query: string,
  candidates: ContextRouterCandidate[],
  limit = 40
): ContextRouterCandidate[] {
  void query;
  return candidates
    .filter((candidate) => candidate.lexicalScore > 0)
    .sort(
      (a, b) =>
        b.lexicalScore - a.lexicalScore ||
        Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "")
    )
    .slice(0, limit);
}

export function makeContextRouterCandidate(input: {
  id: string;
  title: string;
  sourceApp: SourceApp;
  updatedAt: string | null;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  text: string;
  query: string;
}): ContextRouterCandidate {
  const snippet = buildCandidateSnippet({
    query: input.query,
    text: input.text,
    maxChars: 700,
  });
  return {
    id: input.id,
    title: input.title,
    sourceApp: input.sourceApp,
    updatedAt: input.updatedAt,
    sourcePostId: input.sourcePostId,
    sourceMessageId: input.sourceMessageId,
    snippet: snippet.snippet,
    lexicalScore: snippet.lexicalScore,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/candidates.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/context-router/candidates.ts apps/platform/src/lib/context-router/candidates.test.ts
git commit -m "feat(context): build router candidate snippets"
```

---

### Task 4: LLM Reranker And Confidence Gate

**Files:**
- Create: `apps/platform/src/lib/context-router/reranker.ts`
- Test: `apps/platform/src/lib/context-router/reranker.test.ts`

- [ ] **Step 1: Write the failing reranker test**

```ts
import assert from "node:assert/strict";
import {
  buildRerankerPrompt,
  parseRerankResponse,
  selectIncludedContext,
} from "./reranker.ts";

const prompt = buildRerankerPrompt({
  resolvedQuery: "Compare Anthropic, Northslope, Tenex, and Reflection career opportunities.",
  candidates: [
    {
      id: "anthropic",
      title: "Danny @ Anthropic",
      sourceApp: "claude",
      updatedAt: null,
      sourcePostId: "p1",
      sourceMessageId: "m1",
      snippet: "Danny discussed Anthropic roles and product strategy.",
      lexicalScore: 3,
    },
    {
      id: "cat",
      title: "Cat scratch",
      sourceApp: "claude",
      updatedAt: null,
      sourcePostId: "p2",
      sourceMessageId: "m2",
      snippet: "A cat scratched my girlfriend.",
      lexicalScore: 1,
    },
  ],
});

assert.match(prompt.system, /rerank WorkOS context candidates/);
assert.match(prompt.user, /Danny @ Anthropic/);
assert.match(prompt.user, /Cat scratch/);

const decisions = parseRerankResponse(
  `{"decisions":[{"candidate_id":"anthropic","action":"include","confidence":0.91,"reason":"Directly about Anthropic career process","useful_facts":["Anthropic roles were discussed"],"source_post_id":"p1","source_message_id":"m1"},{"candidate_id":"cat","action":"exclude","confidence":0.97,"reason":"Personal medical topic unrelated to career comparison","useful_facts":[],"source_post_id":"p2","source_message_id":"m2"}]}`
);

assert.equal(decisions.length, 2);
assert.deepEqual(selectIncludedContext(decisions).map((item) => item.candidateId), [
  "anthropic",
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/reranker.test.ts
```

Expected: FAIL because `reranker.ts` does not exist.

- [ ] **Step 3: Implement reranker**

Create `apps/platform/src/lib/context-router/reranker.ts`:

```ts
import { invokeClaude } from "../agents/claude";
import { parseLlmJsonObject } from "./json";
import type { ContextRerankDecision, ContextRouterCandidate } from "./types";

const RERANKER_MODEL = "claude-haiku-4-5";
const MIN_INCLUDE_CONFIDENCE = 0.72;
const MAX_FINAL_CONTEXTS = 6;

export interface RerankerInput {
  resolvedQuery: string;
  candidates: ContextRouterCandidate[];
}

export interface RerankerPrompt {
  system: string;
  user: string;
}

export type RerankerCaller = (prompt: RerankerPrompt) => Promise<string>;

export function buildRerankerPrompt(input: RerankerInput): RerankerPrompt {
  return {
    system:
      "You rerank WorkOS context candidates. Include only sources that would materially improve the assistant answer. Exclude incidental keyword matches. Return strict JSON only.",
    user: JSON.stringify({
      resolved_query: input.resolvedQuery,
      candidates: input.candidates.map((candidate) => ({
        candidate_id: candidate.id,
        title: candidate.title,
        source_app: candidate.sourceApp,
        source_post_id: candidate.sourcePostId,
        source_message_id: candidate.sourceMessageId,
        snippet: candidate.snippet,
      })),
      required_json_shape: {
        decisions: [
          {
            candidate_id: "string",
            action: "include|exclude",
            confidence: "number 0..1",
            reason: "short string",
            useful_facts: ["strings"],
            source_post_id: "string|null",
            source_message_id: "string|null",
          },
        ],
      },
    }),
  };
}

export function parseRerankResponse(text: string): ContextRerankDecision[] {
  const data = parseLlmJsonObject(text);
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];

  return decisions.flatMap((item): ContextRerankDecision[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const candidateId = typeof row.candidate_id === "string" ? row.candidate_id : "";
    if (!candidateId) return [];
    const usefulFacts = Array.isArray(row.useful_facts)
      ? row.useful_facts.filter((fact): fact is string => typeof fact === "string")
      : [];
    return [
      {
        candidateId,
        action: row.action === "include" ? "include" : "exclude",
        confidence:
          typeof row.confidence === "number" && Number.isFinite(row.confidence)
            ? Math.max(0, Math.min(1, row.confidence))
            : 0,
        reason:
          typeof row.reason === "string" && row.reason.trim()
            ? row.reason.trim()
            : "Reranked by Context Router.",
        usefulFacts,
        sourcePostId: typeof row.source_post_id === "string" ? row.source_post_id : null,
        sourceMessageId:
          typeof row.source_message_id === "string" ? row.source_message_id : null,
      },
    ];
  });
}

export function selectIncludedContext(
  decisions: ContextRerankDecision[]
): ContextRerankDecision[] {
  return decisions
    .filter(
      (decision) =>
        decision.action === "include" &&
        decision.confidence >= MIN_INCLUDE_CONFIDENCE
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_FINAL_CONTEXTS);
}

export async function rerankContextCandidates(
  input: RerankerInput,
  caller: RerankerCaller = async (prompt) =>
    invokeClaude({
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      model: RERANKER_MODEL,
      maxTokens: 2000,
    })
): Promise<ContextRerankDecision[]> {
  if (input.candidates.length === 0) return [];
  const prompt = buildRerankerPrompt(input);
  return parseRerankResponse(await caller(prompt));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/reranker.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/context-router/reranker.ts apps/platform/src/lib/context-router/reranker.test.ts
git commit -m "feat(context): rerank automatic context with llm"
```

---

### Task 5: Router Orchestration Without Database Writes

**Files:**
- Create: `apps/platform/src/lib/context-router/router.ts`
- Test: `apps/platform/src/lib/context-router/router.test.ts`

- [ ] **Step 1: Write the failing orchestration test**

```ts
import assert from "node:assert/strict";
import { buildContextPacksForDecisions } from "./router.ts";
import type { ContextRouterCandidate, ContextRerankDecision } from "./types.ts";

const candidates: ContextRouterCandidate[] = [
  {
    id: "anthropic",
    title: "Danny @ Anthropic",
    sourceApp: "claude",
    updatedAt: null,
    sourcePostId: "p1",
    sourceMessageId: "m1",
    snippet: "Danny discussed Anthropic product roles.",
    lexicalScore: 3,
  },
];

const decisions: ContextRerankDecision[] = [
  {
    candidateId: "anthropic",
    action: "include",
    confidence: 0.91,
    reason: "Directly relevant to Anthropic process.",
    usefulFacts: ["Anthropic product roles were discussed."],
    sourcePostId: "p1",
    sourceMessageId: "m1",
  },
];

const packs = buildContextPacksForDecisions({
  resolvedQuery: "career advice Anthropic roles",
  candidates,
  decisions,
});

assert.equal(packs.length, 1);
assert.equal(packs[0].candidate.id, "anthropic");
assert.equal(packs[0].pack.router_version, "context-router-v1");
assert.equal(packs[0].pack.relevance_confidence, 0.91);
assert.deepEqual(packs[0].pack.useful_facts, [
  "Anthropic product roles were discussed.",
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/router.test.ts
```

Expected: FAIL because `router.ts` does not exist.

- [ ] **Step 3: Implement pure pack builder**

Create `apps/platform/src/lib/context-router/router.ts`:

```ts
import type {
  ContextPack,
  ContextRerankDecision,
  ContextRouterCandidate,
} from "./types";

export interface ContextPackDecision {
  candidate: ContextRouterCandidate;
  pack: ContextPack;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  reason: string;
}

export function buildContextPacksForDecisions(input: {
  resolvedQuery: string;
  candidates: ContextRouterCandidate[];
  decisions: ContextRerankDecision[];
}): ContextPackDecision[] {
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate])
  );

  return input.decisions.flatMap((decision): ContextPackDecision[] => {
    if (decision.action !== "include") return [];
    const candidate = candidateById.get(decision.candidateId);
    if (!candidate) return [];
    return [
      {
        candidate,
        sourcePostId: decision.sourcePostId ?? candidate.sourcePostId,
        sourceMessageId: decision.sourceMessageId ?? candidate.sourceMessageId,
        reason: `Relevant (${Math.round(decision.confidence * 100)}%): ${decision.reason}`,
        pack: {
          router_version: "context-router-v1",
          resolved_query: input.resolvedQuery,
          relevance_confidence: decision.confidence,
          reason: decision.reason,
          useful_facts: decision.usefulFacts,
          snippet: candidate.snippet,
        },
      },
    ];
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/router.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/context-router/router.ts apps/platform/src/lib/context-router/router.test.ts
git commit -m "feat(context): build compact router context packs"
```

---

### Task 6: Persist Router Context Packs On Attachments

**Files:**
- Modify: `apps/platform/src/lib/actions/thread-context.ts`
- Test: existing lint/typecheck plus `apps/platform/src/lib/thread-context.test.ts`

- [ ] **Step 1: Extend `AttachThreadContextInput`**

Modify `apps/platform/src/lib/actions/thread-context.ts`:

```ts
export interface AttachThreadContextInput {
  threadId: string;
  sourceNodeId: string;
  attachedBy: ContextAttachedBy;
  reason?: string | null;
  sourcePostId?: string | null;
  sourceMessageId?: string | null;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Persist metadata during upsert**

In the `upsert` payload inside `attachThreadContext`, add:

```ts
metadata: input.metadata ?? {},
```

Expected final upsert payload includes `metadata`, while existing callers that do not pass metadata continue storing `{}`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd apps/platform
npx tsc --noEmit
```

Expected: PASS with no output.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/lib/actions/thread-context.ts
git commit -m "feat(context): persist router metadata on attachments"
```

---

### Task 7: Wire Router Into Automatic Attach Flow

**Files:**
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Modify: `apps/platform/src/lib/context-router/router.ts`
- Test: `apps/platform/src/lib/context-router/router.test.ts`

- [ ] **Step 1: Add server orchestration signature**

In `apps/platform/src/lib/context-router/router.ts`, add this exported interface and function stub below the pure pack builder:

```ts
export interface RouteAutomaticContextInput {
  threadId: string;
  instanceId: string;
  activeThreadTitle: string;
  currentText: string;
  previousUserTexts: string[];
  candidates: ContextRouterCandidate[];
}

export async function routeAutomaticContext(input: RouteAutomaticContextInput) {
  const { resolveContextTurn } = await import("./turn-resolver");
  const { rerankContextCandidates, selectIncludedContext } = await import("./reranker");

  const turn = await resolveContextTurn({
    currentText: input.currentText,
    previousUserTexts: input.previousUserTexts,
    activeThreadTitle: input.activeThreadTitle,
  });
  if (!turn.shouldRetrieve || turn.confidence < 0.5) return [];

  const ranked = input.candidates
    .filter((candidate) => candidate.lexicalScore > 0)
    .sort(
      (a, b) =>
        b.lexicalScore - a.lexicalScore ||
        Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "")
    )
    .slice(0, 40);
  const decisions = selectIncludedContext(
    await rerankContextCandidates({
      resolvedQuery: turn.resolvedQuery,
      candidates: ranked,
    })
  );

  return buildContextPacksForDecisions({
    resolvedQuery: turn.resolvedQuery,
    candidates: ranked,
    decisions,
  });
}
```

- [ ] **Step 2: Replace attachment loop in `posts.ts`**

In `apps/platform/src/lib/actions/posts.ts`, keep the existing candidate DB reads for this task, but replace:

```ts
const bestMatches = chooseAutomaticContextCandidates({
  userText: input.contextQueryText,
  candidates,
  limit: AUTOMATIC_CONTEXT_AUTO_ATTACH_LIMIT,
});
if (bestMatches.length === 0) return;

for (const match of bestMatches) {
  await attachThreadContext({
    threadId: input.nodeId,
    sourceNodeId: match.id,
    attachedBy: "automatic",
    reason: `Matched ${match.matchedTokens.join(", ")}.`,
    sourcePostId: match.sourcePostId,
    sourceMessageId: match.sourceMessageId,
  });
}
```

with:

```ts
const { routeAutomaticContext } = await import("../context-router/router");
const { makeContextRouterCandidate } = await import("../context-router/candidates");
const decisions = await routeAutomaticContext({
  threadId: input.nodeId,
  instanceId: input.actorInstanceId,
  activeThreadTitle: "Active thread",
  currentText: input.currentText,
  previousUserTexts: [],
  candidates: candidates.map((candidate) =>
    makeContextRouterCandidate({
      id: candidate.id,
      title: candidate.title,
      sourceApp: normalizeSourceApp(candidate.sourceApp),
      updatedAt: candidate.updatedAt ?? null,
      sourcePostId: candidate.sourcePostId ?? null,
      sourceMessageId: candidate.sourceMessageId ?? null,
      text: candidate.bodyPreview ?? "",
      query: input.contextQueryText,
    })
  ),
});

for (const decision of decisions) {
  await attachThreadContext({
    threadId: input.nodeId,
    sourceNodeId: decision.candidate.id,
    attachedBy: "automatic",
    reason: decision.reason,
    sourcePostId: decision.sourcePostId,
    sourceMessageId: decision.sourceMessageId,
    metadata: { context_pack: decision.pack },
  });
}
```

- [ ] **Step 3: Fix active thread title and previous user text plumbing**

Change `attachAutomaticContextForPost` input in `apps/platform/src/lib/actions/posts.ts` to:

```ts
async function attachAutomaticContextForPost(input: {
  nodeId: string;
  actorInstanceId: string;
  contextQueryText: string;
  currentText: string;
  previousUserTexts: string[];
  activeThreadTitle: string;
}): Promise<void> {
```

Before the call site, fetch the active thread title using the existing Supabase client:

```ts
const { data: currentNodeForContext } = await supabase
  .from("nodes")
  .select("title")
  .eq("id", nodeId)
  .maybeSingle();
const activeThreadTitle =
  typeof currentNodeForContext?.title === "string" && currentNodeForContext.title.trim()
    ? currentNodeForContext.title
    : "Active thread";
```

At the call site, pass:

```ts
await attachAutomaticContextForPost({
  nodeId,
  actorInstanceId: actor.instance_id,
  contextQueryText,
  currentText: plainText,
  previousUserTexts,
  activeThreadTitle,
});
```

Then pass `currentText`, `previousUserTexts`, and `activeThreadTitle` through to `routeAutomaticContext`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/router.test.ts
npx tsx src/lib/thread-context.test.ts
npx tsc --noEmit
```

Expected: all commands PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/actions/posts.ts apps/platform/src/lib/context-router/router.ts
git commit -m "feat(context): route automatic attachments through llm"
```

---

### Task 8: Render Compact Context Packs In Claude Prompt

**Files:**
- Modify: `apps/platform/src/lib/agents/node-context.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`
- Test: `apps/platform/src/lib/agents/claude-prompt.test.ts`

- [ ] **Step 1: Add failing prompt test**

Append to `apps/platform/src/lib/agents/claude-prompt.test.ts`:

```ts
const compactContextPrompt = renderClaudePrompt({
  ...baseContext,
  attachedContexts: [
    {
      node: { id: "anthropic", title: "Danny @ Anthropic", type: "stack" },
      posts: [],
      contextPack: {
        router_version: "context-router-v1",
        resolved_query: "career advice Anthropic roles",
        relevance_confidence: 0.91,
        reason: "Directly relevant to Anthropic process.",
        useful_facts: ["Danny discussed Anthropic product roles."],
        snippet: "Danny discussed Anthropic product roles and fit.",
      },
    },
  ],
});

assert.match(compactContextPrompt.userMessage, /# Attached context: "Danny @ Anthropic"/);
assert.match(compactContextPrompt.userMessage, /Relevance: 91%/);
assert.match(compactContextPrompt.userMessage, /Danny discussed Anthropic product roles/);
assert.doesNotMatch(compactContextPrompt.userMessage, /Recent thread:/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform
npx tsx src/lib/agents/claude-prompt.test.ts
```

Expected: FAIL because `RelativeThread` has no `contextPack` field and prompt rendering ignores it.

- [ ] **Step 3: Extend context type**

In `apps/platform/src/lib/agents/node-context.ts`, import `ContextPack`:

```ts
import type { ContextPack } from "../context-router/types";
```

Change `RelativeThread`:

```ts
export interface RelativeThread {
  node: { id: string; title: string; type: string };
  posts: PostRecord[];
  contextPack?: ContextPack;
}
```

Update `ActiveContextAttachmentRow` to include:

```ts
metadata: Record<string, unknown> | null;
```

Update the Supabase select in `getAttachedContextThreads` to include `metadata`.

When pushing `sourceNodes`, include:

```ts
contextPack: contextPackFromMetadata(row.metadata),
```

Add helper:

```ts
function contextPackFromMetadata(
  metadata: Record<string, unknown> | null
): ContextPack | undefined {
  const pack = metadata?.context_pack;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return undefined;
  const row = pack as Record<string, unknown>;
  if (row.router_version !== "context-router-v1") return undefined;
  return {
    router_version: "context-router-v1",
    resolved_query: typeof row.resolved_query === "string" ? row.resolved_query : "",
    relevance_confidence:
      typeof row.relevance_confidence === "number" ? row.relevance_confidence : 0,
    reason: typeof row.reason === "string" ? row.reason : "",
    useful_facts: Array.isArray(row.useful_facts)
      ? row.useful_facts.filter((item): item is string => typeof item === "string")
      : [],
    snippet: typeof row.snippet === "string" ? row.snippet : "",
  };
}
```

- [ ] **Step 4: Render pack in Claude prompt**

In `apps/platform/src/lib/agents/claude-prompt.ts`, update `renderRelativeSection`:

```ts
function renderRelativeSection(
  heading: string,
  thread: RelativeThread,
  now: Date
): string {
  if (thread.contextPack) {
    const pack = thread.contextPack;
    return [
      heading,
      "",
      `Relevance: ${Math.round(pack.relevance_confidence * 100)}%`,
      `Why included: ${pack.reason}`,
      pack.useful_facts.length > 0
        ? `Useful facts:\n${pack.useful_facts.map((fact) => `- ${fact}`).join("\n")}`
        : null,
      pack.snippet ? `Source snippet:\n${pack.snippet}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trimEnd();
  }

  const lines: string[] = [heading, ``];
  lines.push(
    ...renderChronologicalPosts({
      posts: thread.posts,
      now,
      includeGapMarkers: true,
    })
  );
  return lines.join("\n").trimEnd();
}
```

- [ ] **Step 5: Run prompt test**

Run:

```bash
cd apps/platform
npx tsx src/lib/agents/claude-prompt.test.ts
```

Expected: PASS with no output.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/agents/node-context.ts apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts
git commit -m "feat(context): render compact context packs"
```

---

### Task 9: Add Context Chunk Index For Better Candidate Generation

**Files:**
- Create: `apps/platform/supabase/migrations/0029_context_router_chunks.sql`
- Create: `apps/platform/src/lib/context-router/chunks.ts`
- Create: `apps/platform/src/lib/context-router/chunks.test.ts`

- [ ] **Step 1: Create migration**

Create `apps/platform/supabase/migrations/0029_context_router_chunks.sql`:

```sql
create extension if not exists pg_trgm;

create table if not exists context_chunks (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  source_node_id uuid not null references nodes(id) on delete cascade,
  source_post_id uuid references posts(id) on delete cascade,
  source_message_id text,
  chunk_index integer not null,
  text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_node_id, source_message_id, chunk_index)
);

create index if not exists context_chunks_instance_created_idx
  on context_chunks(instance_id, created_at desc);

create index if not exists context_chunks_source_idx
  on context_chunks(source_node_id, chunk_index);

create index if not exists context_chunks_text_trgm_idx
  on context_chunks using gin (text gin_trgm_ops);

drop trigger if exists context_chunks_set_updated_at on context_chunks;
create trigger context_chunks_set_updated_at
  before update on context_chunks
  for each row execute function set_updated_at();

alter table context_chunks enable row level security;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Write chunking test**

Create `apps/platform/src/lib/context-router/chunks.test.ts`:

```ts
import assert from "node:assert/strict";
import { buildContextChunksForImportedPost } from "./chunks.ts";

const chunks = buildContextChunksForImportedPost({
  instanceId: "instance-1",
  sourceNodeId: "node-1",
  sourcePostId: "post-1",
  sourceMessageId: "message-1",
  text: "A ".repeat(900) + "Anthropic career role fit " + "B ".repeat(900),
});

assert.ok(chunks.length >= 2);
assert.equal(chunks[0].instance_id, "instance-1");
assert.equal(chunks[0].source_node_id, "node-1");
assert.equal(chunks[0].source_post_id, "post-1");
assert.equal(chunks[0].source_message_id, "message-1");
assert.equal(chunks[0].chunk_index, 0);
assert.ok(chunks.some((chunk) => chunk.text.includes("Anthropic career role fit")));
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/chunks.test.ts
```

Expected: FAIL because `chunks.ts` does not exist.

- [ ] **Step 4: Implement chunk builder**

Create `apps/platform/src/lib/context-router/chunks.ts`:

```ts
export interface ContextChunkInsert {
  instance_id: string;
  source_node_id: string;
  source_post_id: string;
  source_message_id: string | null;
  chunk_index: number;
  text: string;
  metadata: Record<string, unknown>;
}

export function buildContextChunksForImportedPost(input: {
  instanceId: string;
  sourceNodeId: string;
  sourcePostId: string;
  sourceMessageId: string | null;
  text: string;
}): ContextChunkInsert[] {
  const maxChars = 2_400;
  const overlapChars = 240;
  const chunks: ContextChunkInsert[] = [];

  for (let start = 0, index = 0; start < input.text.length; index++) {
    const end = Math.min(input.text.length, start + maxChars);
    const text = input.text.slice(start, end).trim();
    if (text.length > 0) {
      chunks.push({
        instance_id: input.instanceId,
        source_node_id: input.sourceNodeId,
        source_post_id: input.sourcePostId,
        source_message_id: input.sourceMessageId,
        chunk_index: index,
        text,
        metadata: {},
      });
    }
    if (end >= input.text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}
```

- [ ] **Step 5: Run chunk test**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/chunks.test.ts
```

Expected: PASS with no output.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/supabase/migrations/0029_context_router_chunks.sql apps/platform/src/lib/context-router/chunks.ts apps/platform/src/lib/context-router/chunks.test.ts
git commit -m "feat(context): add context chunk index"
```

---

### Task 10: Final Verification Against The Real Failure Mode

**Files:**
- No new files required unless prior tasks expose compile failures.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd apps/platform
npx tsx src/lib/context-router/json.test.ts
npx tsx src/lib/context-router/turn-resolver.test.ts
npx tsx src/lib/context-router/candidates.test.ts
npx tsx src/lib/context-router/reranker.test.ts
npx tsx src/lib/context-router/router.test.ts
npx tsx src/lib/context-router/chunks.test.ts
npx tsx src/lib/thread-context.test.ts
npx tsx src/lib/agents/claude-prompt.test.ts
```

Expected: every command exits `0` with no assertion output.

- [ ] **Step 2: Run lint and typecheck**

Run:

```bash
cd apps/platform
npm run lint -- src/lib/context-router src/lib/actions/posts.ts src/lib/actions/thread-context.ts src/lib/agents/node-context.ts src/lib/agents/claude-prompt.ts src/lib/thread-context.ts
npx tsc --noEmit
```

Expected: both commands exit `0`.

- [ ] **Step 3: Manual local test**

Start or reuse the local dev server:

```bash
cd apps/platform
npm run dev -- --port 3017
```

In WorkOS:

1. Open the career advice test thread.
2. Send `try yet again`.
3. Confirm context events no longer say `Matched try, yet`.
4. Confirm irrelevant contexts such as cat scratch, hives/cashew, casino games, or unrelated immigration chats are not attached.
5. Confirm attached events include relevance-style reasons.
6. Confirm the Claude answer references useful facts from the included context.

- [ ] **Step 4: Inspect prompt size**

Use server logs after the manual test. Expected shape:

```text
[1.11] context gathered (own=..., attached=..., ...)
[1.11] claude prompt rendered (system=..., user=...)
```

Acceptance target for the same career test:

- attached contexts: usually `2-6`
- user/context prompt: substantially below the previous `241275c` local log
- no full ten-post attached windows when `context_pack` exists

- [ ] **Step 5: Commit verification adjustments**

If no code changed during verification, skip this step. If code changed:

```bash
git add apps/platform/src/lib/context-router apps/platform/src/lib/actions/posts.ts apps/platform/src/lib/actions/thread-context.ts apps/platform/src/lib/agents/node-context.ts apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/thread-context.ts apps/platform/supabase/migrations/0029_context_router_chunks.sql
git commit -m "fix(context): verify router integration"
```

---

## Self-Review

- Spec coverage: The plan covers LLM turn understanding, broad candidate generation from existing posts, LLM rerank/gate, compact context packing, prompt rendering, and schema/pure helpers for a chunk index that can replace post-preview candidate generation in the next pass.
- Placeholder scan: The plan contains no unfinished placeholder markers or open-ended implementation instructions.
- Type consistency: `ContextTurnResolution`, `ContextRouterCandidate`, `ContextRerankDecision`, and `ContextPack` are defined once in Task 1 and reused consistently.
- Scope check: This is one coherent subsystem: replacing automatic imported-context attachment. Embeddings are intentionally not required in this v1 because the rerank/pack layer can improve quality immediately using existing imported posts and the new chunk index.
