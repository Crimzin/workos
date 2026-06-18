# WorkOS Unified Vision And Build Direction

Status: canonical strategic direction for the next build phase
Date: June 2026
Audience: Codex, Claude Code, and human collaborators building WorkOS

## 0. Read This First

We are no longer building four user-facing products.

We are building one product - WorkOS - with several internal capability layers:

- WorkOS is the product and surface the user sees.
- BrainShare is the invisible memory and context engine.
- Swarm is the invisible operational intelligence layer behind Focus.
- Finiti is the invisible workflow engine behind Workflows.

The user should not need to learn those internal names. They should experience one calm, powerful AI productivity tool that understands their work, keeps context flowing, helps them choose models, focuses their attention, and turns repeatable work into reusable workflows.

This document revises the earlier June 2026 vision with the context of what is already built in the repo. It should be treated as the source of truth for near-term direction. Older roadmap and context docs still contain valuable detail, but where they imply separate products, board-first WorkOS, BrainShare as a standalone product, or Swarm/Finiti as separate brands, this document supersedes them.

## 1. What Is Already True In The Codebase

Claude's original writeup was directionally right, but it undercounted how much substrate already exists. The next phase is not a greenfield build. We should reuse the current foundations.

### 1.1 WorkOS Platform Foundation

The Platform app already has a strong recursive work substrate:

- Next.js 15 App Router, TypeScript, React Server Components, Tailwind v4, Supabase, BlockNote, and dnd-kit.
- Recursive `nodes` model: workspaces, stacks, cards, and threads are type labels over one tree-shaped substrate.
- Board view with stack rows, field-driven columns, drag and drop, saved views, mirrors, links, global fields, owners, members, posts, and detail panels.
- BlockNote post threads with mentions, file/image upload, post export, reactions, and agent participation.
- Typed memory primitives in WorkOS: rationale, assumptions, and decisions, already exposed through a Memory surface.
- Planning signals: stack lifecycle and card priority, which are useful later for Focus/Swarm.
- Thread-primary route foundation: `/n/[id]` now defaults to a thread surface, with board preserved as `?view=board` for workspace nodes.
- Node path, sub-thread, resolution, search/tree, pinning, and summary-oriented design already exist or are represented in the thread-primary docs and migrations.

Strategic implication: WorkOS should not restart from a "Claude clone" blank slate. The current recursive node model is exactly the right substrate for nested threads, import clustering, Focus, and workflow runs.

### 1.2 Agent Runtime And Model Foundation

The app already has the beginnings of the multi-model, agent-as-actor surface:

- Inline `@Claude` participation in post threads.
- Agent-agnostic node context gathering through `gatherNodeContext`.
- Provider/model selection in the composer.
- Settings for agent providers and default models.
- Provider-neutral agent runtime work, including Codex/Claude Code direction, agent run records, and execution policy concepts.
- AI standards/settings surfaces that can become part of broader model and workflow governance.

Strategic implication: the "one place to use whatever model you want" promise has a real base. The next work is not to prove model routing exists; it is to make setup and usage non-engineer friendly, especially API-key onboarding and defaults.

### 1.3 BrainShare Foundation

The BrainShare service is more than a concept:

- FastAPI service scaffolding exists.
- Conversation ingestion endpoints and CLI/API paths exist for AI conversations.
- Episode and primitive contracts preserve source, tool, location, actor, message indices, raw content hashes, and provenance metadata.
- Claude/ChatGPT conversation extraction and synthesis have a working shape.
- Conviction is represented and should continue to trace to human signal, not AI generation.
- Conversation synthesis can produce briefs, topics, why-chain-like structures, and primitive candidates.
- WorkOS memory primitives can be pushed into BrainShare.
- Context assembly endpoint work exists for "your AI never forgets" style payloads.

Strategic implication: the import/cold-start "boom" should build on BrainShare's ingestion and synthesis work. The hard part is not inventing memory from scratch; it is productizing a reliable import pipeline that turns messy exports into useful WorkOS threads.

### 1.4 Existing Strategic Tension

Older docs describe a three-product or ecosystem strategy:

- BrainShare as a context-first entry product.
- Swarm as a chief-of-staff wedge in existing tools.
- WorkOS as a team work-management destination.
- A dual-entry GTM: Swarm wedge plus WorkOS destination.
- Agent marketplace and humans/agents as architectural peers.

Those ideas are not wrong, but they are too much for the immediate product. The new direction chooses a tighter initial wedge:

- One user-facing product.
- Non-engineer AI productivity user.
- Thread-first WorkOS experience.
- AI conversation imports as the cold-start moment.
- BrainShare/Swarm/Finiti hidden under plain surfaces: Threads, Focus, Workflows.

Strategic implication: keep the deeper ecosystem architecture in the substrate, but stop leading with it. The immediate product needs adoption, clarity, and a first-run gasp.

## 2. Strategic Thesis

### 2.1 The User

The initial user is a non-engineer knowledge worker who wants serious AI leverage but does not want to become an AI systems engineer.

The beachhead should be the high-intent version of that user:

- They already use Claude, ChatGPT, or both for meaningful work.
- They have valuable context trapped across many chats.
- They feel the pain of context loss and model juggling.
- They are willing to set up API keys if the product handholds them.
- They repeat similar work patterns often enough that workflows matter.

This includes AI-forward founders, operators, consultants, creators, chiefs of staff, marketers, investors, recruiters, and strategy/product people. The broader "normie" user is the long-term expansion path, but v1 should target people who already feel the problem sharply.

### 2.2 The Pain Stack

The product should solve these pains in this order:

1. Context walls: every new AI chat starts stupid.
2. Messy AI history: the user's best thinking is buried in old conversations.
3. Model choice and subscription sprawl: users do not know which model to use or how to control cost.
4. Self-management overhead: users lose track of what matters, what is open, and what to do next.
5. Workflow reconstruction: users repeat valuable processes but rebuild them from scratch each time.

The first pain is the entry point. The others become more valuable after WorkOS has the user's context.

### 2.3 Why This Can Win

This does not win by being "a memory API" or "a workflow builder" or "an agent platform." Those are crowded and too abstract.

It wins as a cohesive product with taste:

- It makes import feel magical.
- It makes thread context inheritance feel obvious.
- It makes model choice feel easy.
- It makes Focus feel quiet and useful.
- It makes Workflows feel guided rather than technical.
- It avoids overwhelming users with graph, agent, automation, or database concepts.

The defensibility is not one feature. It is the integration of context, structure, taste, and repeated use.

## 3. Product Promise

A successful user should be able to say:

1. "I dropped in my old AI chats, picked what mattered, and WorkOS reorganized them into something clean."
2. "I do not copy-paste context between AI chats anymore."
3. "I can use the right model from one place without managing a pile of subscriptions."
4. "I know what to pay attention to because WorkOS surfaces the right open loops."
5. "I turned a repeatable process into a workflow once, and now WorkOS guides me through it."
6. "It feels calm. I knew what to do right away."

If a near-term feature does not support one of those sentences, it is probably out of scope.

## 4. The Unified Product Model

### 4.1 WorkOS: The Surface

WorkOS is the only product name the user sees.

The product should feel chat-first and thread-first, with boards/tables/feeds as alternate views over the same work. A thread is not just a message list. It is a durable unit of work with:

- conversation,
- context,
- child threads,
- decisions,
- assumptions,
- artifacts,
- fields,
- links,
- summaries,
- provenance,
- workflow runs.

The recursive node model already supports this. The UI should keep translating nodes into human language: thread, sub-thread, path, summary, related work, source.

### 4.2 BrainShare: Invisible Context Engine

BrainShare powers context continuity. It should:

- ingest AI conversations and other sources as Episodes,
- preserve provenance,
- extract durable primitives,
- synthesize Starting Context briefs,
- assemble context for model calls,
- keep thread context current,
- detect context gaps and stale decisions.

The user should not see "BrainShare" as a product or UI brand. They may see plain-language affordances such as:

- Context
- Sources
- Memory
- Why this?
- Correct this
- Forget this
- Show source

BrainShare can have inspectable surfaces for trust, but not branded surfaces that add product complexity.

### 4.3 Swarm: Invisible Operational Intelligence

Swarm powers Focus.

BrainShare knows what is true, stale, missing, or contradicted. Swarm decides what deserves attention.

The boundary:

- BrainShare: "This decision was made last week and depends on this assumption."
- Swarm/Focus: "This thread needs attention now because the decision has not turned into action and it sits on your critical path."

Swarm v1 should not be an autonomous boss or nagging assistant. It should produce a sparse, ranked, reasoned list of threads needing attention. Fewer, higher-confidence items are better than a busy feed.

### 4.4 Finiti: Invisible Workflow Engine

Finiti powers Workflows.

A workflow is a reusable way of working, created through guided interview and executed as a guided thread or set of sub-threads.

The safest product model is:

- a successful thread can become a workflow template,
- a workflow run is a thread,
- workflow steps produce reviewable artifacts or decision points,
- cruise-control execution pauses at human judgment points,
- auto execution is optional,
- manual execution remains available for careful work.

The user should see "Workflows," not "Finiti."

## 5. Core Mechanic: Nested Threads As Context Management

Nested threads are not a UI flourish. They are the core mechanic.

Thread topology should do useful context work:

- A child thread inherits relevant parent context.
- A parent thread inherits resolved child summaries.
- Siblings can be included when useful.
- Linked threads can be referenced explicitly.
- Resolved threads compress into summaries without deleting source context.
- Imported AI history becomes a thread tree rather than a flat archive.

This lets WorkOS avoid the two common failures:

- dumping too much context into every model call,
- forcing the user to manually explain what matters every time.

The product should make this feel natural, not technical. The user should experience "it knows where I am," not "the graph selected neighboring context by topology."

## 6. Build Direction

### 6.1 First Priority: Import And Cold Start - "The Boom"

The immediate gating build is a frictionless import flow for Claude and ChatGPT conversation exports.

The user action:

1. Drop in a Claude and/or ChatGPT export.
2. Review topic clusters and choose what to bring in.
3. Land in a generated WorkOS thread structure with Starting Context posts.

The product outcome:

- The messy archive becomes a clean set of threads.
- The user sees summaries, decisions, open questions, assumptions, and suggested next moves.
- Raw source remains available for provenance.
- The model can use imported context immediately.
- The user does not stare at a replay of old chats.

This should use BrainShare's scoping and synthesis concepts, but the v1 UX should stay simple:

- top-level topic clusters,
- default include,
- easy exclude,
- excluded means fully out for v1,
- no three-tier extraction UI yet,
- no overwhelming checklist,
- no visible graph language.

### 6.2 Then: Polish The Core

After import produces the first gasp, make the core usage loop slick:

- Thread surface should be the default mental model.
- Board view should remain useful but secondary.
- Multi-model setup should be non-engineer friendly.
- API-key onboarding should explain cost and steps without sounding like a developer console.
- Context inheritance should be visible enough to build trust.
- Memory correction and source inspection should be easy.
- Mobile should feel like a real product, not a desktop app squeezed down.

### 6.3 Then: Focus

Convert Feed into Focus.

Focus should be an intelligent ranked view of existing threads, not a new object type and not a chronological activity stream.

Each Focus item should include:

- thread title,
- one-line reason,
- current open loop,
- suggested next move,
- confidence/posture,
- click-through into the relevant thread position.

Focus should use existing signals first:

- stack lifecycle,
- card priority,
- unresolved sub-threads,
- open questions,
- stale decisions,
- decisions without actions,
- usage/attention drift,
- due dates or fields where available.

It should start sparse and quiet. Wrong nudges are more damaging than missing nudges.

### 6.4 Then: Workflows

Workflows v1 should include:

- create-via-interview,
- workflow library,
- workflow execution as guided thread runs,
- cruise-control default,
- auto mode for lower-risk repeatable steps,
- manual mode for high-control users.

The workflow interview should validate:

- recurrence,
- job-to-be-done,
- user and skill level,
- success criteria,
- trigger,
- ideal expert process,
- review points,
- input/output contracts,
- guardrails,
- red-team cases.

Do not build a generic automation canvas in v1.

## 7. Immediate Technical Orientation For The Boom

The import flow should be planned as an integration across both apps.

### 7.1 BrainShare Responsibilities

BrainShare should own:

- parsing Claude/ChatGPT exports into source-preserving Episodes,
- chunking conversations,
- generating topic clusters,
- synthesizing conversation and topic briefs,
- extracting candidate decisions, assumptions, questions, actions, goals, standards, and signals,
- preserving provenance and supporting message indices,
- exposing a clean API payload for WorkOS import review and creation.

### 7.2 WorkOS Responsibilities

WorkOS should own:

- upload/review UX,
- cluster include/exclude interstitial,
- generated thread tree preview,
- creation of nodes/threads/posts/memory primitives,
- Starting Context post rendering,
- source/citation access,
- first-run navigation after import,
- later correction/governance UI.

### 7.3 Shared Contract

The import contract should produce:

- import job id,
- source metadata,
- topic clusters,
- proposed thread tree,
- per-thread Starting Context,
- candidate primitives,
- provenance/source references,
- confidence/conviction/posture,
- excluded cluster list,
- creation result mapping BrainShare ids to WorkOS node/post/primitive ids.

The contract is more important than perfect UI polish in the first pass. Once the contract is stable, the "boom" can be tuned against real exports.

## 8. Strategic Non-Goals For This Phase

Do not build:

- a standalone BrainShare product,
- a standalone Swarm bot,
- a standalone Finiti app,
- an agent marketplace,
- enterprise admin/RBAC beyond what import privacy requires,
- full Slack/Discord/Google Drive ingestion before AI export import works,
- autonomous agents that do the user's work without review,
- a generic workflow DAG builder,
- a complex three-tier attention UI during the first import pass,
- a public memory API as the primary surface.

These may become important later, but they are not the route to first adoption.

## 9. Documentation And Repo Reconciliation Needed

The repo still contains useful but conflicting older framing. After this document lands, reconcile the following:

- `CLAUDE.md`: update "What This Project Is" from board/work-management-first to thread-first unified WorkOS.
- `AGENTS.md`: keep agent roles, but add that user-facing BrainShare/Swarm/Finiti branding is deprecated.
- `ai-ecosystem-roadmap-v1.2.md`: add a new top-level decision entry that import/cold-start is the next canonical priority.
- `workos-competitor-context.md`: preserve competitive analysis, but mark dual-entry/team-marketplace strategy as later optional expansion, not v1 direction.
- BrainShare context docs: keep internal architecture, but annotate that BrainShare is now under-the-hood for the WorkOS product.
- Existing specs/plans: thread-primary docs are aligned and should be treated as foundational.

This reconciliation should happen before heavy implementation so future agents stop reviving older assumptions.

## 10. Near-Term Tactical Sequence

The next tactical plan should be:

1. Canonicalize strategy docs.
2. Audit current BrainShare import/synthesis endpoints against the "boom" contract.
3. Audit current WorkOS thread/node/post/memory primitives for import creation needs.
4. Design the import data contract.
5. Build a local-file import spike using a real Claude/ChatGPT export.
6. Generate topic clusters.
7. Render a minimal include/exclude review surface.
8. Create WorkOS threads and Starting Context posts from included clusters.
9. Verify imported threads can provide context to inline agents/model calls.
10. Tune against the founder's actual exports.

The first implementation target should be end-to-end and real. Functionality matters more than polish in the first pass.

## 11. Acceptance Criteria For The Next Phase

By the end of the import/cold-start phase:

- A user can upload or provide a Claude/ChatGPT export.
- WorkOS detects sensible top-level topic clusters.
- The user can exclude clusters before import.
- Included clusters generate a navigable thread tree.
- Each generated thread has a Starting Context post with summary, decisions, open questions, assumptions/constraints, and pick-up-here prompt.
- Source provenance is retained and inspectable.
- Imported context can be used by a model call in the resulting thread.
- The user does not need to copy-paste old chat context manually.
- The flow is good enough to test with a real non-engineer user without apologizing for the concept.

The emotional acceptance criterion is simple: the user should feel that WorkOS understood their AI history and turned it into a place where work can continue.
