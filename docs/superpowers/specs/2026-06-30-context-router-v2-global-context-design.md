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
- Do not treat system-level memory as one giant unstructured custom-instructions blob dumped into every prompt.
- Do not confuse WorkOS system-level memory with provider system prompts. Provider system prompts are execution instructions; WorkOS system-level memory is user and work context selected by the router.
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

V2 should also add an explicit WorkOS account-level memory substrate. Today, durable context is either embedded in histories, imported chats, ad hoc instructions, or thread relationships. That is not good enough for blank-thread coherence because the router needs a cheap, structured representation of what WorkOS knows about the user and their recurring work before it searches every conversation.

## Core Principle

Always scan cheap signals. Conditionally include expensive context.

Conditional inclusion does not mean guessing without context. It means the router first looks at cheap representations: titles, paths, topology, explicit mentions, existing attachments, memory primitives, source metadata, timestamps, chunk snippets, prior context packs, and ignored/removed signals. Only after that cheap scan does it fetch or render heavier evidence.

## Mental Model

The router should behave like a weighted context graph traversal, not a flat search engine.

Priority order:

1. Active thread
2. Explicit `#` mentions in the target post
3. Existing attached or linked threads
4. Recent `#` mentions in the active conversation
5. Older repeated or semantically matching `#` mentions
6. Family threads: parent, children, siblings
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

Always scanned. Rendered selectively based on scope, relevance, sensitivity, and budget.

Includes:

- relevant account-level memory records
- the thread's local context sheet when available
- memory primitives: rationale, decisions, assumptions
- active context packs
- field values
- linked node titles
- context-event history

Purpose: answer "what durable context is already known before broader retrieval?"

### Account-Level Memory (System-Level Memory)

System-level memory in this spec means WorkOS account-level memory about the human and their work. It is not the provider system prompt, and it should not be stored or rendered as a single freeform "custom instructions" blob.

Purpose: give any WorkOS thread, including a totally blank thread, access to stable user and work context without requiring re-explanation or broad transcript replay.

It should contain structured memory records, each with:

- id
- category: identity, role, current project, standing goal, preference, communication style, writing voice, recurring constraint, tool/account context, relationship, correction, sensitive fact, or work standard
- statement: the compact memory claim
- scope: account by default, with future support for workspace, project, person, or domain scopes
- status: active, tentative, superseded, or retracted
- sensitivity label: normal, private, financial, medical, legal, credential-like, or other high-care domain
- confidence or conviction score
- source references: originating thread ids, post ids, imported message ids, or explicit user setting ids
- created, updated, and last-confirmed timestamps
- stale-after or review-after timestamp when the fact is likely to decay
- supersedes and superseded-by links

Good account-level memories:

- "Will is building WorkOS as the user-facing product; BrainShare, Swarm, and Finiti are internal architecture names."
- "Will prefers direct, architecture-first collaboration and wants implementation plans only after the design spec is solid."
- "When discussing personal finance, distinguish durable strategy from stale balances, tax assumptions, and market conditions."
- "Lulu is a data scientist and may ask for help reviving old scripts or analysis workflows."
- "Do not repeat advice the user has explicitly rejected; keep the correction with provenance."

Bad account-level memories:

- a full transcript excerpt
- a stale account balance with no timestamp
- a one-off preference that only applied to a single thread
- an AI-generated inference with no human signal
- broad private facts rendered into unrelated prompts

Account-level memory is built from four paths:

1. Explicit user settings or edits in a Memory/Context surface.
2. Explicit user statements in threads, imported chats, or profile setup.
3. Repeated high-confidence patterns across multiple threads.
4. Promotion from a thread context sheet when a fact has value beyond that thread.

Promotion from thread memory to account-level memory should be conservative. Strong candidates are user-authored, repeated, corrected by the user, or clearly durable across projects. Weak candidates stay in thread memory. Sensitive candidates can be stored with provenance but should require high relevance before prompt inclusion.

Updates should be temporal, not destructive. When a newer statement changes an older memory, WorkOS should supersede or retract the old record, preserve provenance, and make the current active statement cheap to retrieve.

Prompt use should follow a memory-kernel model:

- Always cheap-scan active account-level memory records.
- Always include a tiny globally applicable kernel when present: identity/role, product naming discipline, durable communication preferences, and standing corrections.
- Include task-relevant account memory when it materially improves the response.
- Omit unrelated or sensitive account memory even if it exists.
- Never dump all account-level memory into a provider prompt.
- Include source ids or memory ids in the manifest so the user can audit why memory affected an answer.

The user-facing view should be portable Markdown backed by structured records, not just a Markdown file. WorkOS should be able to render an "Account Context" packet with sections like About Me, Current Work, How I Work With AI, Writing Voice, Standing Preferences, Corrections, and Things To Handle Carefully. That packet should be exportable and readable by other AI tools, but the router should use the structured records for selective inclusion.

### Thread Context Sheet

Every active thread should maintain a local running context sheet. This is the WorkOS-native version of portable Markdown context for a single thread: editable and inspectable over time, but assembled and refreshed from structured work history rather than manually pasted into every chat.

This is distinct from account-level system memory. Account-level memory holds durable cross-thread user and work context. A thread context sheet holds only context that became relevant to this specific thread and should remain available for this thread until superseded.

The context sheet should contain three bands:

- thread long-term memory: durable facts, decisions, constraints, assumptions, source relationships, and caveats discovered during this thread that should remain valid until superseded
- short-term memory: recently useful sources, active related threads, unresolved questions, and context packs from prior turns
- active working memory: what this thread is doing right now, recent intent, current plan, and sources already loaded for the current task

The lookup order matters for efficiency and freshness inside a thread: active working memory first, then short-term memory, then thread long-term memory, then relevant account-level memory, then broader global retrieval. Globally applicable account memory can still be rendered alongside L0 because it behaves more like durable orientation than retrieved evidence.

The latest user turn still wins over all three thread bands and any account-level memory. When newer evidence contradicts sheet memory, WorkOS should use the fresher evidence and update or supersede the sheet after the reply.

The sheet should not become a huge hidden prompt. It is a compact, budget-aware manifest of what the thread currently believes is relevant. The full source trail remains recoverable by ids and citations.

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
- source kind: active, mention, family, attached, linked, imported, global, account-memory
- relationship to active thread
- title/path
- source app
- updated/source timestamps
- memory category and scope, for account-memory candidates
- existing context pack, if any
- memory primitive preview, if any
- best chunk or post preview
- ignored/removed status
- estimated render cost

Existing attachments, links, family threads, and mention candidates enter this pool with high prior weight even when lexical match is modest. Global candidates need stronger evidence.

### 3. Scoring And Prioritization

Score candidates with a blended model:

- explicit mention strength
- family relationship strength
- existing attachment/link strength
- expanded surface match to resolved query: synonyms, alternate spellings, singular/plural forms, tense/stem variants, abbreviations, and thematically similar words
- semantic match to resolved query
- temporal relevance
- source freshness
- prior usefulness
- memory primitive match
- user removal/ignore penalty
- source sensitivity
- estimated context cost

The router should prefer broad cheap discovery and budgeted diverse assembly over narrow literal precision. The system should search widely enough to find context scattered across many chats, then render only the useful parts at the lowest sufficient fidelity.

Do not equate "finance" and "finances" mismatches with acceptable misses. Literal lexical matching is only one weak signal. Retrieval should normalize and expand query terms before scoring, then let topology, memory, snippets, and reranking decide relevance.

The router should avoid broad raw inclusion, not broad recall.

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
- current stage label
- context budget
- estimated prompt size
- account-level memory records included, omitted, or suppressed as sensitive
- thread context sheet bands used
- included sources
- omitted sources
- inclusion reasons
- fidelity chosen per source
- attachment inclusion/omission reasons
- first-token latency once known
- total response time once known

This is the debugging and tuning surface. It can start as logs and become UI later.

### In-Flight Status

Inline agent replies should show a one-line status that reflects the stage WorkOS is actually in, not a generic spinner. The status can change whenever the process advances to a new step.

Example stages:

- Understanding the request...
- Checking account memory...
- Checking this thread's working memory...
- Searching related WorkOS threads...
- Searching imported chats...
- Ranking candidate context...
- Loading source snippets...
- Assembling a compact prompt...
- Waiting for Claude...
- Writing the reply...

The status text should be driven by real router/provider stages. It should not invent fake activity or animate through steps that did not happen.

### 7. Context Sheet And Attachment Persistence

Formal attachments happen after discovery, not before discovery.

If a source is useful, WorkOS should persist it as a `thread_context_attachment` with:

- `attached_by = automatic`
- reason
- source post/message id
- context pack metadata
- status controls for remove/ignore/allow

The user-facing model should be: WorkOS discovered relevant context, used it, and can now remember that relationship.

The thread context sheet should also be updated after each meaningful agent turn:

- promote newly useful sources into short-term memory
- preserve thread-durable facts in thread long-term memory when confidence is high
- keep active working memory current with the thread's immediate task
- demote or remove stale sources when the user removes, ignores, or contradicts them
- store enough source ids to make the sheet auditable without embedding raw source text

Account-level memory should be updated on a slower, stricter path:

- add explicit user-authored memory immediately when the user asks WorkOS to remember something
- queue candidate promotions from thread sheets when the fact appears durable beyond one thread
- require strong human signal, repeated evidence, or user confirmation before promoting inferred memories
- supersede stale memory records instead of overwriting them in place
- record why a memory was created, updated, suppressed, or retracted

Persistence is not optional. What is optional is whether a given source earns promotion into long-term memory, short-term memory, or only the transient manifest for the current call.

## Reasoning Architecture

LLM APIs do not provide the exact same private step-by-step thinking experience that users see inside Claude, Codex, or other first-party apps. WorkOS should not rely on hidden chain-of-thought access.

Instead, WorkOS should create its own explicit reasoning scaffold around the model calls:

- a turn resolver decides what kind of task this is
- a retrieval planner decides where to look first
- candidate discovery gathers cheap evidence
- a reranker/fidelity chooser decides what to include and at what depth
- the final answer prompt receives structured context plus source constraints
- the prompt manifest records the important decisions for debugging

The system can ask models for concise structured rationales such as "why included," "why omitted," "freshness risk," and "fidelity chosen." It should not ask for or expose hidden chain of thought. The practical goal is to get Claude/Codex-like stepwise behavior through orchestration, not through a single giant prompt.

## Golden Tests

### A. Financial Planning Blank Thread

Prompt in a brand-new thread:

> Help me think through my financial planning situation.

Expected behavior:

- WorkOS finds relevant imported Claude financial planning chats with no formal thread links.
- Relevant account-level memory is used only when helpful, such as durable financial-planning preferences or known caveats.
- The answer synthesizes across multiple relevant sources.
- The model distinguishes durable facts from stale balances, plans, or market/tax assumptions.
- The answer uses cautious language and asks clarifying questions where current facts are missing.
- Included sources have reasons and source handles.
- Irrelevant imported chats are omitted with internal reasons.
- Related terms such as "finance," "finances," "financial plan," "money," "budget," "retirement," "tax," and similar variants do not miss obvious candidate threads.

Failure modes:

- No context found despite relevant imports.
- Missing relevant "finances" context because the prompt used "finance," or similar literal-matching failures.
- Hallucinated financial facts.
- Stale facts treated as current.
- Massive raw transcript prompt.
- Unrelated private account memory rendered into the prompt.
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
- Follow-up turns reuse the thread's local context sheet instead of rediscovering the same old script context from scratch.
- Any relevant account-level memory, such as Lulu's role or recurring tool preferences, is included only if it helps disambiguate the request.

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
- The thread context sheet carries forward the resolved query and useful sources from prior turns.
- First-token latency improves materially because prompt size drops.
- The manifest shows which family threads were scanned, included, omitted, and why.

Failure modes:

- 900k-character source payloads for ordinary retry turns.
- Raw sibling/parent posts included because they are nearby but not actually needed.
- No distinction between first-token latency and total response time.

### D. Account-Level Memory Discipline

Scenario:

- The user starts a blank thread on a topic that overlaps with durable user preferences, active projects, and sensitive personal context.

Expected behavior:

- WorkOS includes the tiny globally applicable memory kernel.
- WorkOS includes only task-relevant account-level memories beyond that kernel.
- Sensitive memories are omitted unless the task makes them clearly relevant.
- The answer reflects durable preferences without sounding like it blindly pasted a profile.
- The manifest explains which account memories were included, omitted, or suppressed.
- If the user corrects a memory, WorkOS treats the correction as higher authority and queues a supersession.

Failure modes:

- Dumping the full account profile into every call.
- Failing to use an obviously relevant durable preference in a blank thread.
- Treating account-level memory as fresher than the current user turn.
- Losing provenance for why WorkOS believes a memory is true.

## Error Handling And Fallbacks

- If turn resolution fails, default to a conservative local reply plus cheap high-priority scan, not global raw inclusion.
- If candidate reranking fails, use deterministic weighted ranking and compact snippets only.
- If source fetching fails, include an omission note and continue.
- If an image or file URL is not provider-fetchable, include a text note rather than sending it as a remote attachment.
- If context is likely relevant but stale or incomplete, the model should say what it found and ask a freshness question.
- If the context sheet appears stale or contradicted by the user's latest turn, the latest user turn wins and the sheet should be corrected after the reply.
- If account-level memory conflicts with the latest user turn, the latest user turn wins and WorkOS should queue a memory supersession or retraction.
- If an account-level memory is sensitive and relevance is ambiguous, suppress it from the provider prompt and record the suppression in the manifest.

## Debt Retirement

This design should make the context system simpler after V2, not more ornate.

Retire or rewrite:

- stale Starting Context references in active strategy/spec docs
- old automatic-context paths that only do lexical matching once V2 absorbs them
- default raw rendering of family threads
- prompt-renderer logic that treats neighborhood threads as a separate raw-context path
- tests that preserve over-inclusion rather than useful behavior
- one-turn-only context routing that forces every query in a thread to rediscover the same sources from scratch
- any hidden global custom-instructions blob that grows without structure, provenance, status, or selective rendering

Keep and evolve:

- imported-chat materialization
- `thread_context_attachments`
- `context_chunks`
- `context_pack`
- Context Panel and context events
- per-thread context sheet state, once added
- account-level memory records and portable Markdown rendering, once added
- BrainShare concepts as internal architecture, not user-facing product framing

Rule:

Every V2 responsibility should replace or absorb an older responsibility. If any old path remains temporarily, it needs a named reason and removal trigger.

## Acceptance Metrics

For each golden test, record:

- prompt character count and estimated tokens
- whether budget targets were met, exceeded with warning, or exceeded with L3 justification
- included source count
- omitted source count
- first-token latency
- total response time
- answer quality notes
- source correctness
- stale-context handling
- context sheet reuse across follow-up turns
- account-level memory precision: relevant memories used, irrelevant memories omitted, sensitive memories suppressed
- whether useful context relationships were persisted

The experiment succeeds when WorkOS can produce coherent context-aware answers in blank threads while keeping prompt size and first-token latency far below broad raw-history inclusion.

## Initial Experiment Defaults

These defaults are intentionally concrete so implementation can begin without another architecture fork. They can be tuned after the golden tests produce real manifests.

1. Budget targets are calibration/evaluation targets, not hard truncation rules:
   - ordinary blank-thread or continuation turns should aim for less than 25k rendered prompt characters outside the system prompt
   - source-heavy turns should aim for less than 80k rendered prompt characters outside the system prompt
   - any ordinary turn over 50k rendered prompt characters should produce a manifest warning
   - any source-heavy turn over 120k rendered prompt characters should require explicit L3 justification in the manifest
   - budget pressure should first reduce fidelity, compress packs, or defer raw evidence; it should not silently drop high-value context needed for answer correctness
2. Prompt manifests start in server logs only. A UI surface can come later after the manifest shape proves useful.
3. `context_chunks` should be the first-class scan substrate for imported chats. Native WorkOS posts can use current post-preview scanning in V2 unless a golden test shows that native chunking is necessary.
4. Do not add embeddings in the first V2 pass. Use topology, lexical/trigram search, chunk previews, memory primitives, and LLM reranking first. Add embeddings only if the financial planning or Lulu tests fail because lexical/chunk retrieval misses semantically obvious context.
5. Add deterministic term expansion before candidate scoring. At minimum, normalize case, punctuation, possessives, common plural/singular variants, simple stemming, and high-signal synonyms or thematic terms suggested by the turn resolver.
6. Account-level memory starts as structured records plus a generated Markdown view. It should not start as a manually maintained monolithic Markdown prompt.
7. The first account-level memory kernel should be tiny: identity/role, product naming discipline, durable collaboration preferences, and standing corrections. Everything else must pass task relevance before inclusion.
8. Promotion from thread memory to account-level memory requires explicit user instruction, repeated evidence, or strong human-authored evidence. AI-only inference can suggest a memory but should not silently become durable account memory.
