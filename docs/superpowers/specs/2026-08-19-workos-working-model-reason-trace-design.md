# WorkOS Working Model And Reason Trace Design

Status: approved architecture, ready for implementation planning
Date: 2026-08-19
Audience: Platform, Data, Context, product, and design build threads
Immediate scope: thread-level Working Model and per-response "Why this answer"

## 0. Read This First

This feature is not a better source list.

WorkOS already shows when prior threads are attached as context. The user wants
to inspect the **model WorkOS formed from that context** and understand how that
model affected a particular response:

```text
source evidence
  -> extracted idea, decision, goal, assumption, constraint, question, or signal
  -> current conviction posture
  -> retrieval decision
  -> answer
```

The intended reaction is:

> Oh, THAT is why WorkOS said what it said. It was resting on these pieces of
> information, and I can see exactly where the chain went wrong.

The approved experience has two linked surfaces:

1. A persistent thread-level **Working Model** panel that shows the beliefs and
   open questions currently in play.
2. An immutable response-level **Why this answer** view, opened from an AI
   response, that reconstructs the model and retrieval state used for that
   response.

Provenance appears elegantly at the final evidence layer. It must not dominate
the default UI with a long list of chat names.

This spec is the architecture input for a separate implementation plan. It does
not authorize building future Focus, schedule, workflow, or tool-choice traces
in the first slice.

## 1. Relationship To Product Doctrine

Read this with:

- `docs/strategy/workos-opinionated-operating-partner-doctrine.md`

WorkOS intends to be opinionated and proactive. That raises the cost of a wrong
internal model. Traceability is therefore not a debugging accessory; it is the
trust and correction plane that lets the product make stronger recommendations
without becoming a black box.

The immediate feature explains AI thread responses. The contract must also be
capable of explaining, later:

- why a priority appeared in Focus;
- why WorkOS challenged a stated priority;
- why one next move was recommended over another;
- why a calendar block was proposed;
- why a model, agent, or external tool was selected.

Those later surfaces reuse the contract. They are out of scope for this build.

## 2. Goals And Non-Goals

### 2.1 Goals

- Make the thread's current working beliefs legible without requiring the user
  to understand graphs, embeddings, routers, or internal architecture names.
- Show typed extraction primitives such as goals, decisions, ideas,
  assumptions, constraints, questions, standards, and signals.
- Make conviction explainable as a factor/reason chain, not a mysterious score.
- Tie every completed inline AI response to an immutable snapshot of the model,
  retrieval decisions, and evidence available for that response.
- Let the user diagnose whether an error came from extraction, belief state,
  conviction, retrieval, or answer formation.
- Distinguish a globally wrong belief from context that is only irrelevant in
  the current thread.
- Preserve history when the user corrects the model.
- Keep provenance available without making source names the primary visual
  hierarchy.
- Generalize the data contract enough for future recommendation traces.

### 2.2 Non-Goals

- Exposing hidden chain-of-thought, private model reasoning tokens, or a claim of
  exact token-level causality.
- Replacing the existing source attachment controls.
- Building a full visual knowledge graph editor.
- Showing every stored memory item in the thread panel by default.
- Treating a scalar confidence number as the source of truth.
- Building Focus priority traces, tool-choice traces, workflow traces, or
  calendar recommendation traces in v1.
- Replacing Graphiti or recreating a graph engine in Postgres.
- Replaying every omitted retrieval candidate in the default UI.
- Automatically deleting prior beliefs or rewriting prior answer traces after a
  correction.
- Exposing BrainShare, Swarm, Finiti, Episode, primitive, node, edge, embedding,
  or reranker as ordinary user-facing terminology.

## 3. Approved Product Mental Model

### 3.1 At Rest: The Working Model

The right-side thread panel is titled **Working model**. At rest it answers:

- What is WorkOS trying to help accomplish here?
- What has been decided?
- What ideas are still proposals rather than decisions?
- What assumptions and constraints are load-bearing?
- What questions remain unresolved?
- What new signals might change the work?

The panel shows only the claims currently in play for this thread, ordered by
their role in current work rather than by extraction time. A deeper all-memory
view may show older, superseded, or merely related claims.

### 3.2 On A Response: Why This Answer

Activating an AI response switches the same panel into an immutable **Why this
answer** view. Double-click is the fast gesture, but it cannot be the only
entry point. The response hover menu and keyboard-focus actions must include a
named "Why this answer" control.

The view should lead with:

1. the answer's main stance or key claims;
2. the small set of Working Model items it rested on;
3. why those items were treated as assert, flag, or ask;
4. why they were retrieved for this turn;
5. the underlying evidence and source details on expansion.

The panel has a clear way back to the live Working Model. Answer traces do not
mutate when the live model changes.

### 3.3 Provenance Without A Wall Of Chat Names

Default provenance is summarized, for example:

> 7 evidence references across 3 WorkOS threads and 2 Claude conversations

Expanding a belief reveals its supporting and contradicting evidence, grouped
by source application and thread. Expanding one evidence item reveals the exact
thread/message/post and available excerpt.

Sources are therefore the last step in a progressive disclosure chain, not the
first thing the user has to parse.

### 3.4 Correction Semantics

Two corrections have deliberately different effects.

**This belief is wrong** is global. It creates a new correction signal,
supersedes or retracts the belief, updates affected relationships, and
recomputes downstream conviction. The prior belief and prior answer trace remain
visible as history.

**Not relevant here** is thread-local. It creates a retrieval override for the
current thread. It does not delete the belief or lower its global conviction.

This distinction is central. A system that conflates truth correction with
local relevance will either repeat errors everywhere or forget useful context
too aggressively.

## 4. The Dual Representation

WorkOS should not reduce a person's context to a bag of atomic claims. Atomic
memory alone becomes lossy, brittle, and unpleasant to inspect. A prose-only
memory document, however, is hard to update, score, retrieve, and trace.

The approved architecture keeps both representations.

### 4.1 Readable Context Dossier

Each account, domain, project, and thread can have a readable Markdown dossier.
For the immediate thread scope, the existing `thread_context_sheets.markdown`
and its long-term, short-term, and active-working bands are the foundation.

The dossier provides narrative coherence:

- the current purpose and situation;
- how the current work got here;
- the active approach;
- important decisions and caveats;
- unresolved questions;
- what to pick up next.

It is the representation a human can read end to end and export to another AI.

### 4.2 Typed Working Model Claims

Typed claims provide addressable semantics:

- kind;
- concise statement and optional explanation;
- lifecycle and temporal validity;
- scope;
- conviction posture and factor chain;
- evidence references;
- relationships to other claims and work;
- supersession and correction history.

Typed claims are indexes over meaning in the dossier and source evidence. They
are not a substitute for either.

### 4.3 Synchronization Rule

The dossier and typed claims are projections of the same context state:

- extraction may propose both a dossier update and claim changes;
- accepted claim changes regenerate affected dossier sections;
- a user edit to a structured dossier section produces claim updates or a
  correction event;
- freeform prose that cannot be safely mapped remains readable context and is
  marked as unstructured until later extraction;
- every trace records the dossier version/hash and the exact claim snapshots it
  used.

The implementation must not create two independently editable sources of truth
that silently diverge.

## 5. Current Repository Substrate

The feature should extend these existing pieces.

### 5.1 WorkOS Data

- `memory_primitives` stores node-scoped `rationale`, `assumption`, and
  `decision` records with statement, body, status, cached numeric conviction,
  metadata, and one primary source reference.
- `account_memory_records` stores durable cross-thread memory with category,
  scope, status, sensitivity, source refs, cached conviction, supersession, and
  staleness metadata.
- `thread_context_sheets` stores long-term, short-term, and active-working JSON
  bands plus readable Markdown.
- `thread_context_attachments` stores source relationships and current
  active/removed/ignored status.
- `context_chunks` provides compact searchable source windows.
- `agent_runs` stores the trigger post, target thread, provider, status,
  current stage, prompt manifest, and model/runtime metadata.
- `workos_events` stores append-only product events.
- `focus_sessions`, `focus_messages`, `focus_items`, and
  `focus_item_threads` provide the later recommendation subject types that the
  generalized trace contract should be able to support.

### 5.2 Context Assembly

- `ContextPack` records why a source was included, useful facts, source role,
  relevance confidence, provenance, and source message id.
- `ContextPromptManifest` records resolved query, task type, prompt budget,
  included and omitted sources, account-memory decisions, thread-sheet bands,
  warnings, and timings.
- `routeAutomaticContextV2` produces routing decisions and this manifest.
- the inline reply path creates an `agent_run`, streams a response post,
  completes the run, and then extracts a post-turn thread-sheet update.

### 5.3 Current UI

- `apps/platform/src/components/thread/context-panel.tsx` is already a
  persistent, collapsible, resizable right panel.
- It currently leads with attached sources and then shows Memory, Fields, and
  child threads.
- `apps/platform/src/components/post-item.tsx` already owns post hover actions
  and can provide the response-level trace entry point.
- `SourceChip` already provides consistent provenance labels.

### 5.4 Gaps To Close

- The router manifest from automatic context discovery is currently logged in
  the posts flow and is not carried into the final inline prompt manifest.
- The fallback inline prompt manifest mostly records provider/model and prompt
  size information, not the full source-selection decisions.
- `agent_runs` links to the triggering user post but not the generated response
  post.
- `memory_primitives` supports only three types, one primary source, and a stored
  number; it does not represent the full belief/evidence/conviction chain.
- The current panel shows attached source threads before it shows the model
  formed from them.
- No immutable response-level trace record exists.
- No primitive-level thread-local relevance override exists.
- The post-turn thread-sheet extractor updates context but does not return an
  answer-to-belief mapping.

## 6. Canonical Trace Model

### 6.1 Five Layers

The system should preserve five distinct layers.

#### 1. Evidence

Immutable or source-addressable observations: a user message, imported AI
message, document span, calendar event, meeting excerpt, tool result, or
explicit correction.

#### 2. Extraction

The event that proposed a typed claim from one or more evidence items. It
records the extractor, schema version, explicit/inferred status, relevant text
spans, and human signal.

#### 3. Working Claim

The current addressable model item: goal, decision, idea, assumption,
constraint, question, standard, signal, context update, or compatibility
rationale.

#### 4. Conviction And Retrieval

Conviction summarizes the present support/contradiction chain into a behavior
posture. Retrieval records why the claim or source was included, omitted,
demoted, or blocked for this turn.

#### 5. Output Trace

An immutable snapshot that links an answer or future recommendation to the
request, claim snapshots, conviction factors, retrieval decisions, evidence
references, and model/tool metadata available at generation time.

### 6.2 Honest Epistemic Boundary

The trace is **system observability**, not hidden model thought.

WorkOS can state truthfully that:

- a source or claim was selected and rendered to the model;
- a source or claim was omitted, suppressed, or overridden;
- a belief had a given evidence chain and posture at generation time;
- a post-response structured pass associated answer anchors with selected
  beliefs;
- a model and tool were used with a given prompt manifest.

It cannot state with certainty that a particular retrieved item caused a token
or sentence merely because it was present. UI copy should use "rested on,"
"was informed by," "was included because," and "was associated with," not
"the model thought" or "this caused the model to say."

## 7. Working Claim Contract

### 7.1 Kinds

The WorkOS projection should support:

| Internal kind | User-facing label | Meaning |
| --- | --- | --- |
| `goal` | Goal | A desired outcome or direction |
| `decision` | Decision | A direction adopted through human signal |
| `idea` | Idea | A proposal or possibility not yet adopted |
| `assumption` | Assumption | A belief the work depends on that may be wrong |
| `constraint` | Constraint | A boundary the plan must currently respect |
| `question` | Open question | An unresolved question that affects the work |
| `standard` | Standard | A durable quality or operating requirement |
| `signal` | Signal | An observation or pattern that may change judgment |
| `context_update` | Update | A relevant change in current state |
| `rationale` | Rationale | Compatibility type for existing records; prefer relationships and explanation fields for new extraction |

Actors remain in `actors`. Actions and work items remain WorkOS nodes or Focus
items rather than becoming a second task system inside memory.

### 7.2 Required Semantics

Each claim needs:

- stable id and instance/thread or domain scope;
- kind;
- concise statement;
- optional body/explanation;
- lifecycle: `tentative`, `active`, `superseded`, `retracted`, or `resolved`;
- validity interval and last-confirmed timestamp;
- sensitivity label;
- extraction mode: explicit, inferred, synthesized, or user-authored;
- cached conviction score for ordering/debugging;
- behavior posture: `assert`, `flag`, or `ask`;
- conviction factor snapshot and recomputation version;
- zero or more evidence records;
- zero or more typed relationships;
- supersession pointers;
- creator and update attribution;
- external graph/episode ids when projected from the Context service.

### 7.3 Relationships

V1 must be able to express:

- `depends_on`;
- `supports`;
- `contradicts`;
- `serves_goal`;
- `answers`;
- `derived_from`;
- `qualifies`;
- `revises`.

Supersession is a first-class lifecycle relationship, not a destructive update.
All relationships carry validity timestamps and status.

## 8. Conviction

### 8.1 Source Of Truth

Conviction is derived from the current reasoning/evidence chain. The numeric
score is a cache for sorting, diagnostics, and experiments. It is never the
canonical truth.

The user-facing behavior is:

- **Assert:** strong enough for WorkOS to state or act on directly.
- **Flag:** materially useful but contains a gap, conflict, or staleness that
  should be named.
- **Ask:** too speculative or weakly grounded to present as settled.

Do not display naked decimal scores in the default panel. A diagnostics detail
may show a percentage or score alongside the factor explanation.

### 8.2 Factor Chain

At minimum, conviction considers:

- **Explicitness:** explicit human statement versus inference.
- **Authority:** whether a human with relevant domain authority confirmed it.
- **Recency:** when the claim or its evidence was last observed or reinforced.
- **Reinforcement:** repeated references, adoption, or action.
- **Contradiction:** unresolved evidence or claims pointing the other way.
- **Assumption validity:** status of claims this claim depends on.
- **Specificity / hard-to-vary quality:** whether the rationale is specific,
  testable, and interconnected rather than generic.
- **Scope fit:** whether the evidence is about this person, project, domain, and
  time horizon.
- **Source integrity:** source availability, permissions, and extraction
  quality.

Each factor should store a code, direction, human-readable explanation,
supporting refs, and optional normalized contribution. The system should be
able to explain the posture without revealing the scoring formula.

### 8.3 Human Signal Rule

AI content may supply a useful idea, synthesis, or wording. It does not supply
authority for a user's decision or goal. Conviction that an AI-produced claim
was adopted must trace to human confirmation, correction, behavior, or other
human-authored evidence weighted by relevant authority.

Silence is not strong confirmation. In an open-world system, absence of
contradiction is not proof.

### 8.4 Recompute Triggers

Recompute a claim and affected downstream claims when:

- supporting or contradicting evidence is added;
- an upstream assumption changes status;
- a human confirms or rejects the claim;
- the claim is superseded or retracted;
- a scope or authority relationship changes;
- a meaningful freshness boundary is crossed;
- a user correction is accepted;
- repeated retrieval/use provides reinforcement.

The trace of an old answer retains the old conviction snapshot. The live model
shows the recomputed state.

## 9. Reason Trace Contract

### 9.1 One Contract, Several Subject Types

The trace header is generalized around a subject:

```text
trace kind -> subject -> thread/scope -> immutable snapshot
```

Supported/reserved trace kinds:

- `answer` — implemented now;
- `priority_recommendation` — reserved;
- `next_move_recommendation` — reserved;
- `schedule_recommendation` — reserved;
- `tool_selection` — reserved;
- `workflow_step` — reserved.

The first implementation accepts and renders only `answer`.

### 9.2 Snapshot Schema

The persisted JSON contract should be versioned and typed in TypeScript. The
following is the required shape, not exact syntax:

```json
{
  "schema_version": 1,
  "trace_kind": "answer",
  "generated_at": "2026-08-19T14:00:00Z",
  "subject": {
    "type": "post",
    "id": "response-post-id",
    "thread_id": "thread-id",
    "content_hash": "sha256:..."
  },
  "request": {
    "trigger_post_id": "user-post-id",
    "resolved_query": "...",
    "task_type": "...",
    "turn_resolution": {
      "should_retrieve": true,
      "confidence": 0.91,
      "reason": "..."
    }
  },
  "answer": {
    "summary": "...",
    "anchors": [
      {
        "id": "answer-anchor-1",
        "statement": "...",
        "belief_refs": ["primitive-id"],
        "evidence_refs": ["evidence-ref-id"],
        "mapping_kind": "structured_post_turn_association"
      }
    ]
  },
  "working_model": {
    "thread_sheet_id": "sheet-id",
    "thread_sheet_updated_at": "...",
    "thread_sheet_hash": "sha256:...",
    "claims": [
      {
        "id": "primitive-id",
        "kind": "decision",
        "statement": "...",
        "status": "active",
        "posture": "assert",
        "cached_score": 0.88,
        "factors": [
          {
            "code": "explicit_human_confirmation",
            "direction": "supports",
            "explanation": "Explicitly approved by the user.",
            "evidence_refs": ["evidence-ref-id"]
          }
        ]
      }
    ]
  },
  "retrieval": {
    "budget_chars": 18000,
    "estimated_prompt_chars": 12400,
    "included": [
      {
        "ref_type": "primitive",
        "ref_id": "primitive-id",
        "role": "core",
        "reason": "...",
        "fidelity": "compact_pack_with_snippet"
      }
    ],
    "omitted": [
      {
        "ref_type": "context_source",
        "ref_id": "node-id",
        "reason_code": "below_relevance_threshold",
        "reason": "..."
      }
    ],
    "overrides_applied": ["override-id"],
    "warnings": []
  },
  "evidence": [
    {
      "id": "evidence-ref-id",
      "relation": "supports",
      "source_app": "claude",
      "source_kind": "imported_ai_message",
      "source_node_id": "node-id",
      "source_post_id": null,
      "source_message_id": "message-id",
      "source_label": "...",
      "excerpt": "...",
      "observed_at": "...",
      "actor_id": "actor-id",
      "human_signal": "explicit_approval"
    }
  ],
  "runtime": {
    "agent_run_id": "run-id",
    "provider_key": "inline_claude",
    "model_key": "...",
    "request_id": "...",
    "router_version": "context-router-v2",
    "extractor_version": "..."
  },
  "warnings": []
}
```

### 9.3 Snapshot Rules

- A completed answer trace is append-only and immutable.
- Store references and short excerpts, not unnecessary copies of raw sensitive
  source content.
- Snapshot all claim statements, status, posture, and factors needed to render
  the historical trace even if the live claim later changes.
- Record included and diagnostically useful omitted context. It is not necessary
  to snapshot every candidate from a large global scan.
- Hash the final response content and dossier version so later edits can be
  detected.
- Record whether answer-anchor mappings came from a structured post-turn pass,
  deterministic fallback, or are unavailable.
- If the trace is incomplete, persist an immutable `partial` trace with explicit
  warnings rather than inventing a clean chain.

### 9.4 Changed Since This Answer

When viewing an old trace, compare its claim snapshots with the live Working
Model. If any referenced claim is superseded, retracted, materially edited, or
has a different posture, display:

> Changed since this answer

Expanding the notice shows the old state, current state, change time, and
correction/supersession reason. The old trace itself remains unchanged.

## 10. Proposed Data Model

The implementation plan should inspect the latest migration number before
writing SQL. At the time of this design, the next migration would be `0034`.

### 10.1 Extend `memory_primitives`

Keep the table as the WorkOS projection of thread/node-scoped typed claims. Add
support for the kinds in Section 7 and fields equivalent to:

- `extraction_mode`;
- `conviction_posture`;
- `conviction_factors jsonb`;
- `conviction_version`;
- `valid_from`, `valid_to`, `last_confirmed_at`;
- `sensitivity_label`;
- `supersedes_primitive_id`, `superseded_by_primitive_id`;
- `schema_version`.

Keep the existing `conviction` numeric column as a cached compatibility value.
Document it and name it in application types as cached conviction; do not allow
new logic to treat it as the only input.

Do not remove existing rationale records or the one-rationale-per-node index in
the first migration.

### 10.2 Add `memory_primitive_evidence`

This table maps many evidence items to one claim and preserves how each item
affects it. It needs:

- `instance_id`, `memory_primitive_id`;
- relation: `extracted_from`, `supports`, `contradicts`, `qualifies`,
  `reinforces`, or `corrects`;
- source kind and provider-neutral source identifiers;
- optional WorkOS node/post/message/chunk ids;
- short excerpt or span coordinates;
- actor and observed time;
- human-signal classification and authority snapshot;
- metadata and created time.

Evidence rows are append-only. Source content may become inaccessible or be
deleted; the row should retain enough non-sensitive metadata to explain that a
reference existed while respecting current permissions.

### 10.3 Add `memory_primitive_edges`

This table stores claim-to-claim relationships:

- `from_primitive_id`, `to_primitive_id`;
- relationship kind from Section 7.3;
- status and validity interval;
- derivation/evidence metadata;
- created and updated attribution.

The Context service may hold a richer Graphiti graph. This table is the minimal
WorkOS projection required for rendering and propagation; it is not a replacement
graph engine.

### 10.4 Add `context_retrieval_overrides`

This table records local relevance corrections:

- instance and thread scope;
- target type: `memory_primitive`, `account_memory`, or `context_source`;
- target id;
- directive: `exclude` in v1, with `demote` reserved;
- user reason;
- creator and timestamps;
- `cleared_at` for reversible removal.

Only active overrides affect routing. A unique partial index should prevent
duplicate active overrides for the same thread and target.

Existing `thread_context_attachments.status` remains the source-attachment
control plane. The router should reconcile attachment status and explicit
retrieval overrides into one decision manifest.

### 10.5 Add `reason_traces`

Suggested columns:

- `id`;
- `instance_id`;
- `thread_id`;
- `trace_kind`;
- `subject_type` and `subject_id`;
- `agent_run_id` when applicable;
- `status`: `complete`, `partial`, or `failed`;
- `schema_version`;
- `snapshot jsonb`;
- `created_at`.

For answer traces, enforce one trace per response post and trace kind. Rows are
immutable after insertion. Corrections create new claim/evidence/override rows;
they do not update reason traces.

### 10.6 Extend `agent_runs`

Add `response_post_id uuid references posts(id) on delete set null` and an index.
The inline response path must populate it as soon as the streaming post exists.
The trigger post, response post, run, prompt manifest, and answer trace then form
a durable chain.

### 10.7 Ownership Across Apps

The system of record is divided by object, not by brand:

- WorkOS Postgres is authoritative for nodes, posts, attachments, thread
  dossiers, user corrections, retrieval overrides, run linkage, and reason
  traces.
- The Context service and Graphiti are authoritative for provider-neutral raw
  Episodes, extracted graph relationships, and conviction inputs when that
  service is enabled.
- `memory_primitives` and its evidence/edge tables are the WorkOS materialized
  projection needed for low-latency product use.
- A correction created in WorkOS must be representable as an immutable
  correction Episode and replayable into the Context service. Until that sync
  exists, local correction events must retain enough metadata to replay later.

Avoid two services silently treating the same mutable claim as canonical.

## 11. Capture And Read Flow

### 11.1 Before Generation

1. Resolve the user turn.
2. Load active thread dossier bands and relevant account memory.
3. Load current Working Model claims and active thread retrieval overrides.
4. Discover and rank context candidates.
5. Build one unified `ContextPromptManifest` containing:
   - selected claims and claim versions;
   - selected source packs;
   - omitted diagnostic candidates;
   - suppressed sensitive records;
   - applied overrides;
   - thread dossier bands and version;
   - warnings and timings.
6. Render the provider prompt from the same selected objects represented in the
   manifest. The manifest and prompt must not be assembled through divergent
   code paths.
7. Create the inline `agent_run` with the in-progress manifest.

The current automatic-context discovery helper should return or persist its
manifest instead of only logging it. The later fallback
`buildInlineClaudePromptManifest` should merge runtime/model details into the
router manifest rather than replacing it with counts.

### 11.2 During And After Generation

1. Stream the AI response as today.
2. When the response post is created, set `agent_runs.response_post_id`.
3. Finalize response content and runtime usage metadata.
4. Run one structured post-turn analysis that returns:
   - concise answer anchors;
   - associations from anchors to selected claims/evidence;
   - proposed thread-dossier updates;
   - proposed claim/evidence/relationship updates.
5. Validate the structured output. AI-generated updates stay tentative unless
   human signal or deterministic source rules justify a stronger lifecycle.
6. Persist accepted thread-model updates.
7. Build the immutable reason trace from the pre-generation manifest, claim
   snapshots, final answer hash, structured associations, evidence references,
   and runtime metadata.
8. Insert the trace once and revalidate the post/panel queries.

The post-turn analysis may extend the existing
`extractThreadContextSheetPostTurnUpdate` path so the system does not pay for
two competing extraction calls.

### 11.3 Failure Policy

The user should still receive the answer if trace finalization fails.

- Provider failure: keep the existing visible failure response and run failure
  event; no normal answer trace is required.
- Router manifest incomplete: produce a partial trace with warnings.
- Post-turn association failure: produce a partial trace that still shows the
  prompt manifest, selected beliefs, runtime, and evidence. State that answer
  mapping is unavailable.
- Trace insert failure: log a structured run event and show "Trace unavailable"
  for that response. Do not fabricate it from the current live model later.
- Dossier update failure: the trace uses the pre-generation dossier snapshot and
  remains valid; retry the model update separately.

## 12. Correction And Propagation Flows

### 12.1 This Belief Is Wrong

1. User activates the correction on a live claim or claim snapshot.
2. UI asks for a concise replacement/correction when needed.
3. Server writes an append-only `workos_events` correction event and an evidence
   row classified as explicit human correction.
4. Create the replacement claim or mark the original retracted; link
   supersession pointers.
5. Recompute the replacement, original, and downstream dependent claims.
6. Regenerate affected dossier sections.
7. Invalidate context and Working Model caches.
8. Future retrieval uses the corrected state.
9. Prior traces show "Changed since this answer" and link to the correction.

Do not mutate the old statement in place when the meaning changes materially.
A typo or formatting-only edit may be an in-place edit with audit metadata.

### 12.2 Not Relevant Here

1. User activates the action from a live claim or answer trace.
2. Server creates a thread-scoped active retrieval override.
3. Router excludes that target for future turns in the thread and records the
   override in manifests.
4. Global claim status and conviction do not change.
5. The panel indicates that the item is excluded in this thread and allows undo.

### 12.3 Correction Conflicts

If a new correction conflicts with a newer correction or concurrent edit:

- do not last-write-wins silently;
- preserve both events;
- mark the affected claim `flag` or `ask`;
- present the current conflict in the Working Model;
- ask the user to resolve the smallest meaningful statement.

## 13. UI Information Architecture

### 13.1 Panel Shell

Evolve the existing `ContextPanel` instead of creating a second right rail.

Header:

- eyebrow: `Context`;
- title: `Working model`;
- existing collapse and resize controls.

Primary tabs:

- **Model** — current beliefs in play;
- **Answers** — recent response traces and selection history;
- **Sources** — grouped source summary and existing attachment controls.

Fields and child threads remain accessible as compact thread-detail sections or
a secondary area; the implementation plan should preserve their current
functionality while preventing them from competing with the Working Model's
primary hierarchy.

### 13.2 Model Tab

Lead with at most a few current items in each relevant group:

- Aim;
- Decisions;
- Ideas;
- Assumptions and constraints;
- Open questions;
- Signals.

Each row shows:

- type icon/label;
- concise statement;
- assert/flag/ask posture in plain language;
- optional "changed" or "excluded here" state;
- expand affordance.

Expanded detail shows:

- explanation/body;
- conviction factors in natural language;
- linked claims;
- evidence count and grouped provenance;
- correction actions.

Do not show empty groups. Do not lead with raw scores.

### 13.3 Why This Answer State

The selected response state shows:

- back control and response timestamp;
- answer summary or anchors;
- "Rested on" claim cards, ordered by answer relevance;
- "Why these were in play" retrieval reasons;
- "Confidence posture" factor explanation;
- compact evidence/source summary;
- expandable diagnostics containing omitted candidates, warnings, model/tool,
  and prompt-manifest details;
- correction actions on the relevant claim or retrieval decision;
- "Changed since this answer" diff when applicable.

The default view should usually fit in a few cards. Deep debugging is available
without becoming the first impression.

### 13.4 Response Interaction

For an AI post with a trace:

- double-click opens `Why this answer`;
- hover/QUAM action has the labeled command;
- keyboard users can focus the post and invoke the same command;
- selected post receives a restrained visual state;
- a shareable query parameter may identify the selected trace/post if it fits
  existing routing conventions.

For an AI post without a trace, the command may be disabled or open an honest
empty state. Human posts do not need the action.

### 13.5 User-Facing Language

Use:

- Working model;
- Goal, Decision, Idea, Assumption, Constraint, Open question, Standard, Signal;
- Strong / Needs a check / Uncertain, or equivalent plain posture labels;
- Why this answer;
- Why this was included;
- Evidence;
- Changed since this answer;
- This belief is wrong;
- Not relevant here.

Avoid:

- primitive;
- Episode;
- graph node/edge;
- embedding similarity;
- reranker;
- BrainShare;
- chain-of-thought;
- "the AI thought."

## 14. Query And Service Boundaries

Suggested Platform modules:

- `src/lib/working-model.ts` — load and assemble live thread model projections;
- `src/lib/conviction.ts` — pure posture/factor evaluation and diffs;
- `src/lib/reason-traces.ts` — types, snapshot builder, read helpers, and diff;
- `src/lib/actions/working-model.ts` — global correction and local override
  actions;
- `src/components/thread/working-model-panel.tsx` — shell/state controller;
- one component per claim card, trace view, evidence group, and changed-state
  notice following repository conventions.

The implementation plan should decide whether to rename `ContextPanel` in place
or compose the new surface inside it. It must not leave two competing panels.

Read queries should return prepared view models, not require client components
to join claims, evidence, edges, and traces. Use server components for initial
data and client components only for panel state, expansion, and actions.

Cache tags should exist for:

- live Working Model by thread;
- reason trace by subject post;
- answer-trace list by thread;
- claim detail;
- existing context attachments and thread sheets.

Global correction invalidates affected model, trace-diff, Focus-context, and
thread-sheet reads. Local override invalidates the current thread's model and
context assembly without invalidating unrelated threads.

## 15. Privacy, Permissions, And Sensitive Context

- Every evidence reference is permission-checked at read time.
- A trace may retain a source id and non-sensitive label after access changes,
  but must not retain or display excerpts the current viewer cannot access.
- Sensitive account memories follow existing sensitivity labels and router
  suppression rules.
- The snapshot records that sensitive context was suppressed without revealing
  the suppressed statement.
- Cross-domain evidence is only shown or used when scope policy allows it.
- Exported traces omit inaccessible evidence and state that items were redacted.
- Correction and override actions record actor and timestamp.
- Trace rows are append-only; administrative deletion follows account/data
  deletion policy, not ordinary UI editing.

## 16. Edge Cases And Error States

### Deleted Or Missing Source

Show the retained label/type and "Source no longer available." Do not remove the
historical relationship from an old trace.

### Response Edited After Generation

Compare the response body hash with the trace. Show "Response edited after this
trace" and do not imply that the trace covers the edited text.

### No Typed Claims Used

Show the request, source packs, thread dossier bands, and runtime facts. State
that the answer used contextual material but no structured Working Model claims
were associated.

### No Retrieval Needed

Show that WorkOS answered from the current turn and immediate thread context.
Do not manufacture a belief chain.

### Stale Live Model

The answer trace remains valid historically. The live panel may show a stale
warning and offer refresh/re-extraction.

### Large Evidence Set

Summarize counts and group by source app/thread. Paginate or virtualize the deep
list. Do not render hundreds of evidence rows by default.

### Conflicting Evidence

Show supporting and contradicting evidence separately. Conviction posture
should become `flag` or `ask` unless a clear supersession/authority rule resolves
the conflict.

### Trace Schema Upgrade

Readers dispatch by `schema_version`. Old immutable snapshots remain readable
through adapters. Do not rewrite all old snapshots for ordinary schema changes.

## 17. Testing Strategy

### 17.1 Migration Tests

- new tables, checks, indexes, FKs, and RLS are present;
- trace immutability is enforced;
- one active local override per thread/target is enforced;
- answer trace uniqueness is enforced;
- old memory primitive rows remain valid;
- response-post linkage is nullable for existing runs.

### 17.2 Unit Tests

- conviction posture derives deterministically from factor inputs;
- human confirmation increases support; AI generation alone does not create
  human authority;
- contradictions and invalid upstream assumptions affect dependent posture;
- reason snapshot builder is deterministic and strips excess sensitive content;
- live-vs-snapshot diff detects supersession, retraction, statement changes, and
  posture changes;
- global correction creates supersession rather than destructive replacement;
- local override affects retrieval only in its thread;
- source grouping produces compact provenance summaries.

### 17.3 Integration Tests

- trigger post -> agent run -> response post -> reason trace linkage;
- router manifest is the same manifest persisted with the run and represented
  in the trace;
- included and omitted sources survive trace construction;
- post-turn analysis creates answer anchors and proposed model updates;
- association failure creates a truthful partial trace;
- correcting a belief changes future retrieval and produces "Changed since"
  on old traces;
- "Not relevant here" excludes the claim in one thread and not another;
- deleted/inaccessible source does not break historical trace rendering;
- edited response triggers hash mismatch warning.

### 17.4 UI Tests

- panel remains collapsible, resizable, sticky, and scroll-contained;
- Model tab shows only nonempty relevant groups;
- double-click and labeled accessible action open the same trace;
- answer selection and back navigation are stable;
- evidence is progressively disclosed;
- grouped provenance avoids a default wall of titles;
- correction and undo states are clear;
- light and dark modes use design tokens;
- no internal architecture terminology appears.

### 17.5 Golden Scenarios

1. **Wrong extraction:** brainstorming was extracted as a decision. User marks it
   wrong; it becomes retracted/superseded and future answers stop asserting it.
2. **Wrong conviction:** an AI suggestion has high semantic quality but no human
   adoption. The system displays it as an Idea and asks rather than asserts.
3. **Wrong retrieval:** a true financial fact is irrelevant to a product-design
   thread. User selects "Not relevant here"; other finance threads retain it.
4. **New contradiction:** an old answer rested on a decision that was later
   reversed. The historical trace shows the old state plus "Changed since this
   answer."
5. **Missing trace detail:** post-turn association fails. The answer remains;
   the panel shows the retrieval manifest and an explicit partial warning.
6. **Provenance depth:** the model view initially shows a decision and evidence
   count, then expands to grouped apps/threads, then to an exact imported
   message.

## 18. Rollout Phases

### Phase 1: Capture And Linkage

- unify the context manifest through the inline reply path;
- link response posts to agent runs;
- persist immutable answer traces, initially read through diagnostics/tests;
- build partial-trace failure behavior;
- do not yet change the visible context panel substantially.

Exit condition: every new successful inline AI response has a queryable trace or
an explicit trace failure event.

### Phase 2: Read-Only Working Model And Why This Answer

- evolve the right panel into Working Model;
- render current typed claims and grouped sources;
- add response activation and trace rendering;
- show live-vs-snapshot changes;
- keep correction actions disabled or clearly marked until writes are ready.

Exit condition: the user can inspect a real response and identify which model
claims, retrieval choices, and evidence were involved.

### Phase 3: Corrections And Propagation

- add global belief correction;
- add thread-local relevance override and undo;
- add conviction recomputation and dependent-claim propagation;
- regenerate dossier sections;
- verify old traces remain immutable.

Exit condition: the user can repair extraction, belief, conviction, and
retrieval errors and observe future answers change appropriately.

### Phase 4: Context Service Synchronization

- synchronize WorkOS correction events into provider-neutral Context Episodes;
- project Graphiti relationships and conviction inputs back into WorkOS;
- add replay/reconciliation tooling;
- preserve WorkOS behavior when the external service is unavailable.

This phase may begin earlier if service integration is already stable, but the
visible product must not be blocked on a perfect graph backend.

### Reserved Future: Recommendation Traces

Reuse `reason_traces` and the panel primitives for Focus priority, next-move,
schedule, tool-selection, and workflow-step subjects. Add only the subject-
specific ranking inputs and UI framing. Do not create separate provenance or
confidence systems.

## 19. Acceptance Criteria

The immediate feature is complete when:

- the thread has one persistent Working Model panel rather than a new competing
  side surface;
- the panel leads with goals, decisions, ideas, assumptions, constraints,
  questions, standards, and signals currently in play;
- an AI response can open a `Why this answer` view through double-click and a
  labeled accessible action;
- every new successful inline response links to its run and immutable trace, or
  has an explicit trace failure state;
- the trace shows answer anchors, relevant claim snapshots, conviction factors,
  retrieval reasons, runtime, and progressively disclosed evidence;
- provenance is summarized before individual source/thread names are shown;
- the UI never claims to expose hidden chain-of-thought or exact token causality;
- later claim changes produce a `Changed since this answer` diff without
  rewriting history;
- `This belief is wrong` creates a global correction/supersession and affects
  future context;
- `Not relevant here` creates a reversible thread-local retrieval override;
- correction and override behavior is covered by integration tests;
- current Context panel capabilities, light/dark mode, and accessibility are
  preserved;
- user-facing copy follows WorkOS naming discipline.

## 20. Decisions Future Threads Must Not Reopen Casually

- This is a model-and-reasoning inspection feature, not another provenance list.
- The architecture is dossier plus typed claims, not atom-only memory.
- Conviction is a derived factor chain with a cached score, not a stored score
  as truth.
- AI content does not create human authority.
- Per-response traces are immutable snapshots.
- Old traces are compared with the live model; they are never rewritten.
- Global wrongness and local irrelevance are separate corrections.
- Double-click is a shortcut, not the only accessible interaction.
- Provenance is progressively disclosed at the evidence layer.
- The feature exposes observable orchestration and structured rationale, not
  hidden chain-of-thought.
- V1 explains thread answers only, while the contract remains reusable for
  future WorkOS recommendations.

## 21. New-Thread Handoff Prompt

For an implementation-planning thread, provide this spec and say:

> Create a detailed implementation plan for the phased WorkOS Working Model and
> Reason Trace feature. Start with Phase 1 capture/linkage and Phase 2 read-only
> UI. Inspect the current repository before naming files or SQL. Preserve the
> existing recursive node model, Context panel behavior, Context Router V2,
> thread sheets, source chips, agent run flow, design tokens, named exports, and
> user-facing naming discipline. Do not build future Focus/tool traces. Identify
> tests before implementation tasks and keep global corrections separate from
> thread-local retrieval overrides.

For a product/design thread, provide Sections 0-3, 13, and 19-20 plus the product
doctrine. For a Data/Context thread, provide Sections 4-12 and 15-18 plus the
current migrations and Context service specs.
