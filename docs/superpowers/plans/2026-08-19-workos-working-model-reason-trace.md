# WorkOS Working Model And Reason Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every WorkOS thread a readable live Working Model and every completed inline AI response an immutable, inspectable “Why this answer” trace with distinct global-correction and thread-local relevance controls.

**Architecture:** Extend `memory_primitives` into the WorkOS projection of typed claims, add append-only evidence/edge/trace tables plus retrieval overrides, and carry one Context Router V2 manifest from discovery through prompt execution into trace finalization. Server-side read helpers prepare panel view models; the existing resizable Context panel becomes a three-tab Working Model surface, while response actions select immutable answer traces without creating a second rail.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5 strict mode, Supabase/Postgres, Tailwind v4 design-token utilities, Node’s TypeScript test runner.

**Spec:** `docs/superpowers/specs/2026-08-19-workos-working-model-reason-trace-design.md`

## Global Constraints

- WorkOS is the only user-facing product name; never expose BrainShare, Swarm, Finiti, Episode, primitive, graph, embedding, reranker, or hidden chain-of-thought terminology.
- Keep one persistent, collapsible, resizable right panel; compose the new Working Model inside the existing `ContextPanel` shell.
- Per-response traces are immutable snapshots and may be `complete`, `partial`, or `failed`; never reconstruct a missing historical trace from current state.
- Conviction is a factor chain with cached numeric compatibility, exposed as `assert`, `flag`, or `ask` and labeled Strong, Needs a check, or Uncertain.
- Global wrongness creates supersession/retraction history; local irrelevance creates a reversible thread-scoped retrieval override.
- Preserve the recursive node model, Server Component read/client leaf split, named exports, one component per file, CSS design tokens, light/dark mode, keyboard access, and current Sources/Fields/child-thread functionality.
- V1 renders only `answer` traces; Focus, schedule, tool-choice, and workflow traces remain reserved.
- The user still receives the AI response if post-turn analysis or trace persistence fails.

---

### Task 1: Persist The Working-Model And Trace Contract

**Files:**
- Create: `apps/platform/supabase/migrations/0034_working_model_reason_traces.sql`
- Modify: `apps/platform/src/lib/types.ts`
- Test: `apps/platform/src/lib/working-model-migration.test.ts`

**Interfaces:**
- Produces: expanded `MemoryPrimitive`, `MemoryPrimitiveEvidence`, `MemoryPrimitiveEdge`, `ContextRetrievalOverride`, and `ReasonTraceRecord` TypeScript records; nullable `AgentRun.response_post_id`.
- Produces: SQL constraints for claim kinds/lifecycle/postures, evidence and edge relations, one active override per thread/target, one answer trace per response, and append-only trace/evidence guards.

- [ ] **Step 1: Write the failing migration contract test**

```ts
const sql = readFileSync(new URL("../../supabase/migrations/0034_working_model_reason_traces.sql", import.meta.url), "utf8");
assert.match(sql, /create table if not exists reason_traces/);
assert.match(sql, /response_post_id uuid references posts\(id\) on delete set null/);
assert.match(sql, /create unique index[^;]+context_retrieval_overrides[^;]+where cleared_at is null/s);
assert.match(sql, /raise exception 'reason traces are immutable'/i);
```

- [ ] **Step 2: Run the test and confirm it fails because migration `0034` does not exist**

Run: `cd apps/platform && node --experimental-strip-types src/lib/working-model-migration.test.ts`

- [ ] **Step 3: Add migration `0034`**

Alter `memory_primitives` without deleting legacy rows or the one-rationale index. Add all typed-claim columns from spec §10.1, evidence/edge/override/trace tables, indexes, checks, RLS, `response_post_id`, immutable triggers for evidence and traces, and `notify pgrst, 'reload schema'`.

- [ ] **Step 4: Expand shared TypeScript records**

Add exact unions for `MemoryPrimitiveType`, `MemoryPrimitiveLifecycle`, `ConvictionPosture`, `ConvictionFactor`, extraction mode, sensitivity, evidence relation, edge kind/status, override target/directive, trace status/kind, and `response_post_id`.

- [ ] **Step 5: Run the migration contract test and TypeScript**

Run: `cd apps/platform && node --experimental-strip-types src/lib/working-model-migration.test.ts && npx tsc --noEmit`

Expected: both commands pass; old rationale/assumption/decision code still narrows correctly.

### Task 2: Build Pure Conviction, Trace, Diff, And Provenance Helpers

**Files:**
- Create: `apps/platform/src/lib/conviction.ts`
- Create: `apps/platform/src/lib/conviction.test.ts`
- Create: `apps/platform/src/lib/reason-traces.ts`
- Create: `apps/platform/src/lib/reason-traces.test.ts`

**Interfaces:**
- Produces: `deriveConvictionPosture(factors): ConvictionPosture`, `postureLabel(posture): string`, and `diffClaimSnapshot(snapshot, live): ClaimSnapshotDiff | null`.
- Produces: versioned `AnswerReasonTraceSnapshotV1`, `buildAnswerReasonTraceSnapshot(input)`, `hashTraceContent(value)`, `buildAnswerAnchors(answer, claims)`, and `summarizeEvidenceProvenance(evidence)`.

- [ ] **Step 1: Write failing conviction tests**

Cover explicit human confirmation → `assert`, AI-only generation → never `assert`, unresolved contradiction/invalid dependency → `flag` or `ask`, and snapshot/live diffs for statement, lifecycle, posture, and supersession changes.

- [ ] **Step 2: Run the conviction test and verify missing exports fail**

Run: `cd apps/platform && node --experimental-strip-types src/lib/conviction.test.ts`

- [ ] **Step 3: Implement deterministic conviction and diff helpers**

Keep the formula internal. Return factor-driven plain-language posture, and compare immutable snapshot fields without mutating either input.

- [ ] **Step 4: Write failing trace helper tests**

Assert deterministic content hashes, no full raw source bodies in snapshots, complete/partial warning behavior, deterministic fallback anchors, compact grouped provenance such as `7 evidence references across 3 WorkOS threads and 2 Claude conversations`, and answer edit detection.

- [ ] **Step 5: Run the trace test and verify missing exports fail**

Run: `cd apps/platform && node --experimental-strip-types src/lib/reason-traces.test.ts`

- [ ] **Step 6: Implement the v1 snapshot builder and adapters**

The builder consumes only pre-generation claim snapshots, router manifest, short permission-safe evidence excerpts, final post body, runtime metadata, and association output. It records `structured_post_turn_association`, `deterministic_fallback`, or `unavailable` mapping kinds.

- [ ] **Step 7: Run both helper tests and TypeScript**

Run: `cd apps/platform && node --experimental-strip-types src/lib/conviction.test.ts && node --experimental-strip-types src/lib/reason-traces.test.ts && npx tsc --noEmit`

### Task 3: Prepare Live Working-Model And Historical Trace View Models

**Files:**
- Create: `apps/platform/src/lib/working-model.ts`
- Create: `apps/platform/src/lib/working-model.test.ts`
- Modify: `apps/platform/src/lib/memory-primitives.ts`
- Modify: `apps/platform/src/lib/cache.ts`
- Modify: `apps/platform/src/lib/thread-surface.ts`

**Interfaces:**
- Produces: `getThreadWorkingModel(threadId): Promise<ThreadWorkingModelView>`, `getThreadAnswerTraces(threadId): Promise<AnswerTraceSummary[]>`, and `getReasonTraceForPost(postId): Promise<ReasonTraceView | null>`.
- Produces: view groups `aim`, `decisions`, `ideas`, `assumptions_constraints`, `questions`, and `signals_standards`; each claim includes permission-filtered evidence groups, override state, and historical diff.
- Consumes: pure snapshot/diff/provenance helpers from Task 2.

- [ ] **Step 1: Write failing view-model tests**

Test grouping/order, removal of empty groups, legacy status normalization, compact source grouping, excluded-here state, inaccessible evidence redaction, and changed-since comparison.

- [ ] **Step 2: Run and observe missing helper failures**

Run: `cd apps/platform && node --experimental-strip-types src/lib/working-model.test.ts`

- [ ] **Step 3: Implement pure row-to-view-model assembly first**

Export the pure grouping and normalization functions used by tests; keep Supabase joins in server-only async wrappers.

- [ ] **Step 4: Add cached read helpers and cache tags**

Add tags for `working-model:${threadId}`, `reason-trace:${postId}`, `answer-traces:${threadId}`, and `claim:${claimId}` plus matching targeted revalidation functions.

- [ ] **Step 5: Load the prepared model and answer summaries in `getThreadSurface`**

Fetch in parallel with existing posts, fields, memory, runs, and attachments. Do not join evidence or diffs in client components.

- [ ] **Step 6: Run focused tests and TypeScript**

Run: `cd apps/platform && node --experimental-strip-types src/lib/working-model.test.ts && npx tsc --noEmit`

### Task 4: Carry One Manifest Through Retrieval, Prompting, Run Linkage, And Trace Finalization

**Files:**
- Modify: `apps/platform/src/lib/context-router/types.ts`
- Modify: `apps/platform/src/lib/context-router/manifest.ts`
- Modify: `apps/platform/src/lib/context-router/manifest.test.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Modify: `apps/platform/src/lib/agents/runs.ts`
- Modify: `apps/platform/src/lib/agents/runs.test.ts`
- Modify: `apps/platform/src/lib/thread-context-extractor.ts`
- Modify: `apps/platform/src/lib/thread-context-extractor.test.ts`

**Interfaces:**
- Produces: `mergeInlineRuntimeIntoManifest(routerManifest, prompt, modelSelection)` without replacing router decisions.
- Produces: `linkInlineAgentRunResponse(runId, responsePostId)` and `persistAnswerReasonTrace(input)`.
- Produces: post-turn result `{ sheetUpdate, answerAnchors, proposedClaims }`; invalid association output degrades to deterministic fallback or an explicit partial trace.

- [ ] **Step 1: Extend manifest tests to fail on the current replacement behavior**

Assert turn resolution, included/omitted sources, selected claim snapshots, dossier id/hash/version, applied overrides, prompt sizes, model, request id, and warnings coexist in one object.

- [ ] **Step 2: Implement manifest merging and retrieval override filtering**

Make automatic context discovery return its manifest on every path, including no-retrieval and thread-sheet-covered paths. Apply active `context_retrieval_overrides` before candidate selection and record each applied override.

- [ ] **Step 3: Add failing run-linkage tests and implement the link helper**

Update the run immediately after `createStreamingAgentReply` returns the first response post id; extend missing-column compatibility detection for `response_post_id`.

- [ ] **Step 4: Extend post-turn extraction tests**

The JSON contract returns dossier bands plus answer anchors and typed claim proposals. Validation keeps AI-only claims tentative and assigns no human authority merely because the assistant stated them.

- [ ] **Step 5: Finalize one immutable trace after the reply and post-turn pass**

Persist a complete trace when associations validate; otherwise persist a partial trace with retrieval, runtime, response hash, and an explicit warning. On insert failure append a structured `trace_failed` run event and leave the answer visible.

- [ ] **Step 6: Run router, extractor, run, and TypeScript checks**

Run: `cd apps/platform && node --experimental-strip-types src/lib/context-router/manifest.test.ts && node --experimental-strip-types src/lib/thread-context-extractor.test.ts && node --experimental-strip-types src/lib/agents/runs.test.ts && npx tsc --noEmit`

### Task 5: Evolve The Existing Right Rail Into Working Model / Answers / Sources

**Files:**
- Create: `apps/platform/src/components/thread/working-model-panel.tsx`
- Create: `apps/platform/src/components/thread/working-model-claim-card.tsx`
- Create: `apps/platform/src/components/thread/reason-trace-view.tsx`
- Create: `apps/platform/src/components/thread/evidence-group.tsx`
- Create: `apps/platform/src/components/thread/changed-state-notice.tsx`
- Create: `apps/platform/src/components/thread/working-model-panel.test.ts`
- Modify: `apps/platform/src/components/thread/context-panel.tsx`
- Modify: `apps/platform/src/components/thread/thread-surface.tsx`

**Interfaces:**
- `WorkingModelPanel` consumes only prepared `ThreadWorkingModelView`, trace summaries, selected post id, existing sources, and existing detail section nodes.
- The existing `ContextPanel` retains resize/collapse/storage behavior and delegates its body to the new tab/state controller.

- [ ] **Step 1: Write the failing structural/UI contract test**

Assert one Context panel, `Working model` title, Model/Answers/Sources tabs, no empty model groups, posture labels without naked decimals, progressive evidence disclosure, retained Fields/child threads, token-only colors, and banned-term absence.

- [ ] **Step 2: Run the test and confirm missing components fail**

Run: `cd apps/platform && node --experimental-strip-types src/components/thread/working-model-panel.test.ts`

- [ ] **Step 3: Build focused presentational components**

Claim cards show type, statement, Strong/Needs a check/Uncertain, changed/excluded states, natural-language factors, relationships, grouped evidence, and actions. Trace view leads with anchors, Rested on, retrieval reasons, confidence posture, compact provenance, then diagnostics.

- [ ] **Step 4: Compose the components inside `ContextPanel`**

Preserve sticky, scroll-contained, resize, collapse, local-storage, separator, and mobile breakpoint behavior. Sources owns the existing attachment cards; Fields and child threads remain compact secondary sections.

- [ ] **Step 5: Run structural tests and TypeScript**

Run: `cd apps/platform && node --experimental-strip-types src/components/thread/working-model-panel.test.ts && npx tsc --noEmit`

### Task 6: Add Accessible Response Trace Selection

**Files:**
- Modify: `apps/platform/src/components/post-item.tsx`
- Modify: `apps/platform/src/components/posts-tab-content.tsx`
- Modify: `apps/platform/src/components/thread/thread-surface.tsx`
- Modify: `apps/platform/src/components/posts-tab-content.test.ts`
- Modify: `apps/platform/src/components/thread/thread-layout.test.ts`

**Interfaces:**
- `PostItem` consumes `hasReasonTrace`, `selectedForReasonTrace`, and `onOpenReasonTrace(postId)`.
- Double-click and the labeled `Why this answer` button invoke the same callback; keyboard focus exposes the same button and selected state.

- [ ] **Step 1: Add failing interaction-source tests**

Assert agent response posts with traces render a named action, double-click uses the same handler, selected posts use restrained token-based styling, human posts do not expose the action, and back navigation returns to the live Model tab.

- [ ] **Step 2: Implement selection state at the shared thread surface boundary**

Keep post feed and panel selection synchronized without duplicating the rail. Use a shareable `?trace=<postId>` query parameter only if it does not disrupt existing node routing; otherwise keep stable local state for v1.

- [ ] **Step 3: Add the accessible response action**

Use a visible label/title, focus styles, and `aria-pressed` or selected-state semantics. Double-click is only a shortcut.

- [ ] **Step 4: Run post/layout tests and TypeScript**

Run: `cd apps/platform && node --experimental-strip-types src/components/posts-tab-content.test.ts && node --experimental-strip-types src/components/thread/thread-layout.test.ts && npx tsc --noEmit`

### Task 7: Implement Global Correction And Thread-Local Relevance Override

**Files:**
- Create: `apps/platform/src/lib/actions/working-model.ts`
- Create: `apps/platform/src/lib/actions/working-model.test.ts`
- Modify: `apps/platform/src/components/thread/working-model-claim-card.tsx`
- Modify: `apps/platform/src/components/thread/reason-trace-view.tsx`
- Modify: `apps/platform/src/lib/types.ts`

**Interfaces:**
- Produces: `correctWorkingModelClaim({ claimId, threadId, workspaceId, replacementStatement, reason })` and `excludeWorkingModelClaimHere({ claimId, threadId, workspaceId, reason })` plus `clearWorkingModelOverride({ overrideId, threadId, workspaceId })`.
- Global correction atomically appends correction evidence/event, retracts or supersedes the old claim, creates a replacement when supplied, links `revises`, and recomputes directly dependent postures.
- Local exclusion creates/clears only `context_retrieval_overrides`; it never changes global lifecycle or conviction.

- [ ] **Step 1: Write failing payload/semantic tests**

Test non-destructive supersession, explicit-human-correction evidence, conflict posture, downstream recomputation inputs, one-thread-only exclusion, duplicate-active override handling, and undo payloads.

- [ ] **Step 2: Implement pure mutation payload builders**

Validate concise nonempty replacement/reason text, preserve old statements, create explicit actor/timestamp metadata, and keep correction versus override payloads structurally separate.

- [ ] **Step 3: Implement server actions with targeted invalidation**

Use Supabase writes/RPC transaction support where atomicity matters; append `workos_events`; invalidate live model, claim detail, trace-diff, thread sheet, and current thread context tags as appropriate without invalidating unrelated threads.

- [ ] **Step 4: Wire correction, exclusion, and undo controls**

Use optimistic pending states and honest conflict/error copy. Disable nothing silently; retain the old trace and surface `Changed since this answer` after correction.

- [ ] **Step 5: Run action tests and TypeScript**

Run: `cd apps/platform && node --experimental-strip-types src/lib/actions/working-model.test.ts && npx tsc --noEmit`

### Task 8: Full Verification And Review

**Files:**
- Modify only files required by failures found below.

**Interfaces:**
- Consumes all previous task outputs; produces a passing, convention-compliant feature.

- [ ] **Step 1: Run all Platform TypeScript tests**

Run: `cd apps/platform && for test_file in $(rg --files src | rg '\\.test\\.ts$'); do node --experimental-strip-types "$test_file" || exit 1; done`

- [ ] **Step 2: Run static verification**

Run: `cd apps/platform && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 3: Inspect migration locally when Supabase is available**

Run: `cd apps/platform && npm run db:lint`

If local Supabase is not configured, record that limitation explicitly rather than claiming the SQL was applied.

- [ ] **Step 4: Review spec and repository conventions**

Confirm all immediate acceptance criteria, user-facing naming, append-only history, distinct correction semantics, exact manifest carry-through, token-only styling, keyboard access, one panel, one component per file, named exports, no new `any`, no new `console.log`, and no unrelated file edits.

- [ ] **Step 5: Inspect the final diff and working tree**

Run: `git diff --check && git status --short && git diff --stat`
