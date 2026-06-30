# Context Router V2: Global Build-As-Needed Context Design

Status: proposed design  
Date: 2026-06-30  
Scope: WorkOS inline agent context assembly for solo productivity

## Product Goal

WorkOS should be world-class at handling context for solo AI productivity. The magic moment is a brand-new thread, with no formal attachments or links, receiving a coherent answer that incorporates relevant context from multiple prior WorkOS threads and imported Claude/ChatGPT chats.

The user should be able to ask naturally:

> Help me think through my financial planning situation.

or:

> I was working a script about 3 months ago to do ABC. I need to make a new version that instead does XYZ. Help?

and WorkOS should find the relevant context, distinguish durable facts from stale details, explain what it used, and avoid flooding the model prompt.

This is an evolution of the existing Context Router, not a new BrainShare side-system. The router becomes the owner of build-as-needed context discovery and budgeted assembly for inline agent calls.

## Non-Goals

- Do not build a separate standalone BrainShare product surface.
- Do not introduce a parallel router or competing context framework.
- Do not require users to formally attach, link, or tag context before a blank thread can be useful.
- Do not default to raw parent, child, sibling, or imported transcript replay.
- Do not resurrect the abandoned Starting Context strategy.
- Do not feature-flag or shadow-run this for the current solo-user phase. The system should be directly testable in normal WorkOS use.

## Current Substrate

V2 builds on existing WorkOS pieces:

- `context-router` resolves turns, ranks candidates, reranks, and builds compact context packs.
- `context_chunks` provides a cheap scan substrate for imported and eventually native source text.
- `thread_context_attachments` persists discovered context relationships, including source post/message ids, status, reason, and metadata.
- `context_pack` metadata already carries compact routed context: resolved query, relevance confidence, useful facts, reason, and snippet.
- Imported Claude/ChatGPT chats already materialize as WorkOS source nodes with message-level provenance.
- WorkOS topology already encodes meaningful context through family threads: parent, child, and sibling relationships.
- Node mentions already encode explicit user-authored context signals.

The main architectural leak is that some context is routed compactly while family threads and active history can still be rendered as broad raw chronology. V2 should unify those paths under one weighted assembly model.

## Core Principle

Always scan cheap signals. Conditionally include expensive context.

Conditional inclusion does not mean guessing without context. It means the router first looks at cheap representations: titles, paths, topology, explicit mentions, existing attachments, memory primitives, source metadata, timestamps, chunk snippets, prior context packs, and ignored/removed signals. Only after that cheap scan does it fetch or render heavier evidence.

## Mental Model

The router should behave like a weighted context graph traversal, not a flat search engine.

Priority order:

1. Active thread
2. Explicit `#` mentions in the target post
3. Recent `#` mentions in the active conversation
4. Older repeated or semantically matching `#` mentions
5. Family threads: parent, children, siblings
6. Existing attached or linked threads
7. Global WorkOS and imported-chat search

Family threads and hashtagged threads are privileged for discovery and ranking. They are not automatically privileged for raw prompt inclusion.

## Context Layers

### L0: Immediate Turn

Always rendered.

Includes:

- target post
- current WorkOS time
- active node title, type, workspace, and path
- selected model/provider metadata when relevant
- concise recent active-thread context
- agent instructions and current standards

Purpose: answer "what is the user asking right now?"

### L1: Known Durable Context

Always scanned and usually rendered if present.

Includes:

- memory primitives: rationale, decisions, assumptions
- active context packs
- field values
- linked node titles
- context-event history
- durable personal/work preferences when available

Purpose: answer "what durable facts should survive across chats?"

### L2: Weighted Context Graph Candidates

Always scanned cheaply, conditionally rendered compactly.

Candidate sources:

- explicit mentioned threads
- family threads
- attached or linked threads
- imported AI chats
- global native WorkOS threads
- context chunks
- recent source/message matches

Rendered as compact packs first:

- source title and relationship
- why included
- useful facts
- short snippet
- source post/message ids
- freshness/staleness cue
- confidence

Purpose: answer "what related context is likely relevant?"

### L3: Raw Evidence

Fetched only when justified by the turn and L2 evidence.

Examples:

- selected source post window
- specific transcript excerpt
- full quoted user-provided material
- image/file reference after provider fetchability checks
- raw sibling or parent thread excerpt

Purpose: answer "what exact evidence does the model need to inspect?"

L3 should be rare for ordinary advice, planning, continuation, and synthesis turns. It is appropriate for source-sensitive drafting, debugging, summarizing a named thread, quote-sensitive work, and user requests that explicitly ask to inspect full context.

## Router Flow

### 1. Turn Resolution

Resolve the current turn into:

- resolved query
- whether retrieval is needed
- whether the turn is a continuation or retry
- freshness sensitivity
- source-evidence sensitivity
- likely task type

Example task types:

- local reply
- retry or continue
- blank-thread context discovery
- financial or personal planning
- old project revival
- source-grounded drafting
- summarize or compare threads
- inspect a named thread
- code/script transformation

### 2. Cheap Candidate Discovery

Build a candidate pool without loading full raw histories.

Each candidate should carry:

- source id
- source kind: active, mention, family, attached, linked, imported, global
- relationship to active thread
- title/path
- source app
- updated/source timestamps
- existing context pack, if any
- memory primitive preview, if any
- best chunk or post preview
- ignored/removed status
- estimated render cost

Family and mention candidates enter this pool with high prior weight even when lexical match is modest. Global candidates need stronger evidence.

### 3. Scoring And Prioritization

Score candidates with a blended model:

- explicit mention strength
- family relationship strength
- existing attachment/link strength
- lexical or semantic match to resolved query
- temporal relevance
- source freshness
- prior usefulness
- memory primitive match
- user removal/ignore penalty
- source sensitivity
- estimated context cost

The router should prefer fewer, higher-confidence sources over broad recall.

### 4. Fidelity Decision

For each strong candidate, choose the lowest useful fidelity:

1. no inclusion, with omission reason
2. metadata only
3. compact context pack
4. compact pack plus snippet
5. selected post/chunk window
6. broader raw excerpt

Examples:

- Financial planning prompt: compact packs from relevant finance chats, with stale-fact caveats. Avoid raw full transcripts.
- Lulu script prompt: compact pack plus likely source snippets. Ask for the actual file or repo if WorkOS only has discussion history.
- Incident-style retry: inherit prior resolved query and include existing relevant packs. Avoid parent/sibling raw replay unless the retry explicitly depends on those sources.

### 5. Budgeted Assembly

Assemble a provider request under an explicit budget.

The budget should be layer-aware:

- L0 has guaranteed space.
- L1 has preferred space.
- L2 competes by score and cost.
- L3 requires explicit justification.

Budgeting should be visible in a manifest, not hidden in prompt-rendering side effects.

The initial experiment should target a large reduction from incident-level payloads. The exact token target can be tuned, but a normal turn should be nowhere near hundreds of thousands of stored characters.

### 6. Prompt Manifest

Every agent invocation should produce an internal manifest:

- resolved query
- task type
- context budget
- estimated prompt size
- included sources
- omitted sources
- inclusion reasons
- fidelity chosen per source
- attachment inclusion/omission reasons
- first-token latency once known
- total response time once known

This is the debugging and tuning surface. It can start as logs and become UI later.

### 7. Optional Persistence

Formal attachments happen after discovery, not before discovery.

If a source is useful, WorkOS may persist it as a `thread_context_attachment` with:

- `attached_by = automatic`
- reason
- source post/message id
- context pack metadata
- status controls for remove/ignore/allow

The user-facing model should be: WorkOS discovered relevant context, used it, and can now remember that relationship.

## Golden Tests

### A. Financial Planning Blank Thread

Prompt in a brand-new thread:

> Help me think through my financial planning situation.

Expected behavior:

- WorkOS finds relevant imported Claude financial planning chats with no formal thread links.
- The answer synthesizes across multiple relevant sources.
- The model distinguishes durable facts from stale balances, plans, or market/tax assumptions.
- The answer uses cautious language and asks clarifying questions where current facts are missing.
- Included sources have reasons and source handles.
- Irrelevant imported chats are omitted with internal reasons.

Failure modes:

- No context found despite relevant imports.
- Hallucinated financial facts.
- Stale facts treated as current.
- Massive raw transcript prompt.
- Answer gives high-stakes advice without caveats.

### B. Lulu Script Revival

Prompt in a brand-new thread:

> I was working a script about 3 months ago to do ABC. I need to make a new version that instead does XYZ. Help?

Expected behavior:

- WorkOS searches older relevant context around the approximate time window.
- WorkOS identifies likely script/project discussions from imported or native context.
- The answer summarizes what it found and frames the delta from ABC to XYZ.
- If actual source files are absent, the model says it found discussion/spec context but needs the file or repo to edit code.
- The router promotes source snippets only when useful.

Failure modes:

- Treating "about 3 months ago" as exact.
- Ignoring old but relevant context.
- Pretending to have source code when only conversation context exists.
- Pulling unrelated scripts because of weak keyword matches.

### C. Agent Latency Incident Guardrail

Scenario:

- A large card thread with huge active, parent, and sibling history.
- User says a retry/simple continuation prompt.

Expected behavior:

- The UI can show an immediate in-flight agent state.
- The router avoids raw family-thread replay by default.
- Existing attached packs and resolved retry query are reused.
- First-token latency improves materially because prompt size drops.
- The manifest shows which family threads were scanned, included, omitted, and why.

Failure modes:

- 900k-character source payloads for ordinary retry turns.
- Raw sibling/parent posts included because they are nearby but not actually needed.
- No distinction between first-token latency and total response time.

## Error Handling And Fallbacks

- If turn resolution fails, default to a conservative local reply plus cheap high-priority scan, not global raw inclusion.
- If candidate reranking fails, use deterministic weighted ranking and compact snippets only.
- If source fetching fails, include an omission note and continue.
- If an image or file URL is not provider-fetchable, include a text note rather than sending it as a remote attachment.
- If context is likely relevant but stale or incomplete, the model should say what it found and ask a freshness question.

## Debt Retirement

This design should make the context system simpler after V2, not more ornate.

Retire or rewrite:

- stale Starting Context references in active strategy/spec docs
- old automatic-context paths that only do lexical matching once V2 absorbs them
- default raw rendering of family threads
- prompt-renderer logic that treats neighborhood threads as a separate raw-context path
- tests that preserve over-inclusion rather than useful behavior

Keep and evolve:

- imported-chat materialization
- `thread_context_attachments`
- `context_chunks`
- `context_pack`
- Context Panel and context events
- BrainShare concepts as internal architecture, not user-facing product framing

Rule:

Every V2 responsibility should replace or absorb an older responsibility. If any old path remains temporarily, it needs a named reason and removal trigger.

## Acceptance Metrics

For each golden test, record:

- prompt character count and estimated tokens
- included source count
- omitted source count
- first-token latency
- total response time
- answer quality notes
- source correctness
- stale-context handling
- whether useful context relationships were persisted

The experiment succeeds when WorkOS can produce coherent context-aware answers in blank threads while keeping prompt size and first-token latency far below broad raw-history inclusion.

## Initial Experiment Defaults

These defaults are intentionally concrete so implementation can begin without another architecture fork. They can be tuned after the golden tests produce real manifests.

1. Budget targets:
   - ordinary blank-thread or continuation turns should aim for less than 25k rendered prompt characters outside the system prompt
   - source-heavy turns should aim for less than 80k rendered prompt characters outside the system prompt
   - any ordinary turn over 50k rendered prompt characters should produce a manifest warning
   - any source-heavy turn over 120k rendered prompt characters should require explicit L3 justification in the manifest
2. Prompt manifests start in server logs only. A UI surface can come later after the manifest shape proves useful.
3. `context_chunks` should be the first-class scan substrate for imported chats. Native WorkOS posts can use current post-preview scanning in V2 unless a golden test shows that native chunking is necessary.
4. Do not add embeddings in the first V2 pass. Use topology, lexical/trigram search, chunk previews, memory primitives, and LLM reranking first. Add embeddings only if the financial planning or Lulu tests fail because lexical/chunk retrieval misses semantically obvious context.
