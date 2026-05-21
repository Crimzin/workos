# Thread-Primary WorkOS Design

Date: 2026-05-21
Status: Draft for review

## Purpose

WorkOS should move from a board-primary interface to a thread-primary interface. Boards, tables, and similar views remain useful, but they become alternate ways to look at work rather than the main mental model.

The goal is to make WorkOS feel like a calm, AI-native place where work unfolds through conversation, sub-threads, summaries, and structured artifacts. The interface should preserve the power of the recursive data model without exposing technical language or making the product feel like a developer tool.

## Core Insight

The underlying system is an infinite recursive tree of work objects. A board freezes one altitude of that tree and makes workspace, stack, and card feel like fixed categories. The new interface should let the user move fluidly through the tree while keeping the experience human and conversational.

The product principle:

> A card is not a small thing. It is a piece of work seen from far away.

Workspace, stack, and card are best understood as view interpretations, not permanent object identities. When looking from one point in the work tree, a node may appear as a workspace-like container, its children may appear as stack-like groups, and their children may appear as card-like items. When opened directly, any of those same items can become a full work surface with conversation, fields, sub-threads, artifacts, and resolution history.

## Product Model

### Important Threads

The left sidebar shows important threads. It is not the complete hierarchy and should not try to represent every nested item.

A thread may appear in the sidebar because it is:

- pinned by the user,
- promoted from within work,
- part of a saved navigation structure,
- or later suggested because it has durable importance.

The sidebar answers: "Where can I go quickly?"

### Path

The page header shows the user's path through work.

Example:

```text
General > Bugs & Feature Requests > Scope Design > Pricing
```

The path answers: "Where am I right now?"

Clicking a path segment changes focus to that part of the work. This is the primary way to move up and down through the recursive structure.

### Main Surface

The main surface shows the selected thread. It is the primary working area.

By default, it should feel calm and conversational. It should not look like a permanent mind-map canvas. The structure of related sub-threads should become more visible when the user hovers, selects, or focuses a piece of work.

This should build from the detail side panel WorkOS already has. The redesign should adapt that proven surface into the main page area rather than inventing an unrelated interaction model. Existing panel concepts such as posts, fields, tabs, cards, related work, mirrors, links, and memory primitives should be treated as source material for the new full-page thread surface.

The main surface answers: "What is unfolding here?"

### Sub-Threads

Any meaningful unit inside the main surface can start a sub-thread:

- a message,
- an artifact block,
- a data field,
- a decision,
- a highlighted phrase,
- or a work item.

Sub-threads are contextual. They do not automatically appear in the sidebar. They become sidebar threads only if they are pinned, promoted, or otherwise made durable.

If a sub-thread is not promoted by the user, the AI collaborator may still suggest saving or pinning it when it appears important to the user's current goal. This should be adaptive rather than rule-heavy. If more project-specific judgment is needed, it can be added to the inborn agent knowledge layer as part of this work.

Example:

1. The user is working in a client engagement scope thread.
2. Pricing comes up as a separate concern.
3. The user starts a pricing sub-thread from that moment.
4. Pricing gets its own focused thread with messages, fields, decisions, assumptions, and AI work.
5. When resolved, pricing folds back into the scope thread as a linked summary.

## Resolution Model

Resolving a sub-thread compresses it back into its parent. It does not delete it, flatten it, or turn its summary into the sole source of truth.

Resolved sub-threads create linked summary blocks in the parent thread. These summaries should be readable in place and should clearly state the outcome, relevant assumptions, and next actions where applicable.

The source of truth remains the sub-thread.

This supports:

- provenance,
- reopening,
- superseding,
- AI regeneration of summaries,
- BrainShare traceability,
- and later inspection of how a conclusion was reached.

The parent inherits the conclusion, not the whole discussion.

### Summary Actions

A resolved summary should support actions such as:

- view source,
- reopen,
- supersede,
- copy into an artifact,
- extract into parent content,
- pin or promote the source thread.

"Extract into parent" is an explicit escape hatch for moments where the user wants polished canonical prose in the parent. It should not be the default resolution behavior.

## Main Surface UI Grammar

The threaded nature of work should be subtle at rest and expressive on attention.

At rest:

- messages and artifacts read mostly like a calm work chat,
- related sub-threads are shown with small glyphs or counters,
- resolved summaries appear as quiet linked blocks,
- unresolved sub-threads can appear as compact blocks with a title, timestamp, and "unresolved" label.

On hover or selection:

- related sub-thread affordances become clearer,
- local connection lines or mini structure previews can appear,
- the user can see title, status, owner, last activity, and key fields for a sub-thread,
- related summaries and source items can highlight together.

On focus:

- clicking a sub-thread navigates into that thread,
- the main surface becomes the selected sub-thread,
- the header path updates to show location and context,
- the sidebar remains stable,
- no separate origin card is needed in the content body.

On resolution:

- the sub-thread collapses into a linked summary in the parent,
- the summary should feel satisfying but not flashy,
- the source sub-thread remains traceable from the summary, path, search, and related-work affordances.

Color should be used strategically. It can indicate attention, status, unresolved work, human/agent participation, and source relationships, but the base surface should stay quiet. Color should help the user notice what changed or what needs attention, not turn the thread into a dense diagram.

## Alternate Views

Boards, tables, feeds, and calendars remain valuable. They are ways of viewing work, not necessarily just views of one thread's immediate sub-threads.

The default board can still use the current path model: one current thread, child groupings, and grandchild work items. But saved views should be flexible enough to include work from different parts of the tree when that reflects the user's real workflow. A board, table, or feed may therefore be a curated set, a query, a mirrored set, or a path-based view.

Examples:

- Board: good for status, ownership, and movement.
- Table: good for field editing and comparison.
- Feed: good for cross-thread activity and attention.
- Thread: default surface for thinking, deciding, discussing, and collaborating with AI.

The user should not have to turn an idea into a card before it can be discussed. Discussion and structure should emerge together.

This flexibility should be introduced carefully. The product should avoid becoming a generic Notion-style database builder. The simplest default should remain: open a thread, view the work around it, and switch views when a board/table/feed helps.

## Finding Work And Seeing The Tree

Users must never feel like work disappeared because it is not pinned in the sidebar.

WorkOS needs a way to see and recover the broader tree:

- search across all threads and related work,
- a tree explorer or outline mode for the current area,
- recent and active threads,
- unresolved sub-threads,
- saved/pinned threads,
- linked summaries with source access,
- migrated board work preserved with clear paths.

The sidebar is for important threads, not exhaustive navigation. Search and tree/outline views provide confidence that everything still exists and can be found.

Migration from the current board-first WorkOS must preserve existing work in a way that feels obvious. Existing workspaces, stacks, cards, mirrors, links, fields, posts, and board views should remain discoverable after the redesign.

## Workflow Creation And Finiti

This redesign should stay compatible with Finiti, the future workflow creation tool.

The guiding idea: workflow creation should feel like turning a successful thread into a reusable way of working.

Possible future model:

- A thread can contain a repeated workflow.
- A thread can become a workflow template.
- A thread can be an instance/run of a workflow.
- A workflow can produce sub-threads, artifacts, actions, decisions, and summaries.
- A workflow run can fold outcomes back into the thread where it was started.

User-facing language should stay simple:

- Use this workflow
- Save as workflow
- Run again
- Start from template
- Show progress
- Update workflow

The average knowledge worker should not need to understand nodes, schemas, or automation graphs to use it. They should be able to describe what they want, refine it conversationally, and then reuse it.

Finiti may eventually deserve a dedicated builder view inside WorkOS, but it should not require a completely separate mental model. The safest direction is to treat workflow builder as another view over threads and structured steps, while workflow runs remain ordinary threads the user can inspect, discuss, resolve, and summarize.

This is only directional. The current redesign should avoid design debt by keeping threads, artifacts, actions, fields, and summaries composable enough that workflows can later sit on top of them.

## Language Rules

The architecture may use precise internal language, but the UI must stay human.

Internal language may include:

- node,
- parent and child,
- recursive tree,
- projection,
- linked summary,
- resolution state,
- source object.

User-facing language should prefer:

- thread,
- sub-thread,
- path,
- summary,
- resolved,
- reopened,
- pinned,
- related work,
- source.

Avoid exposing these terms in the UI:

- node,
- edge,
- graph,
- recursive,
- altitude,
- projection,
- topology,
- primitive,
- entity,
- branch-node.

Acceptable UI actions might include:

- Start sub-thread
- Open thread
- Resolve
- View source
- Show where this came from
- Fold back into summary
- Reopen
- Pin
- Save as thread

Avoid UI actions like:

- Create child node
- Change projection
- Resolve branch-node
- Promote altitude anchor
- Inspect topology

This design is for a productivity tool for people working and building with AI, not a technical graph editor.

## Relationship To Current WorkOS

The current recursive node model remains the foundation. This redesign should not require abandoning global data fields, actors, posts, links, mirrors, or board/table views.

Important existing concepts that still apply:

- all work objects share the same base structure,
- fields are global to the instance,
- actors can be humans or agents,
- posts remain the conversation substrate,
- links and mirrors preserve cross-context relationships,
- board/table views continue to render useful slices of work.

The main shift is product emphasis: the thread surface becomes the primary way to work, while boards and tables become alternate views.

## Decisions From Review

Current decisions from the first review pass:

- Use "thread" as the broad user-facing noun. It scales up and down better than separate terms for pages, spaces, cards, and work items.
- Use "sub-thread" for nested conversational work.
- An unresolved sub-thread can initially appear as a compact block with a title, timestamp, and "unresolved" label.
- Resolved summaries should follow the pricing example: outcome, key assumptions, and next actions where useful, with source access preserved.
- If the user does not explicitly pin or save a sub-thread, the AI collaborator may adaptively suggest doing so based on its understanding of the user's goal.
- When an artifact tied to a resolved sub-thread is edited, the first-pass behavior is to update the timestamp and preserve source traceability.
- Existing board mechanics, including mirrors and related ways of viewing the same work in multiple contexts, should be preserved by default.

## Open Questions

1. How should the unresolved sub-thread block look in final visual design?
2. How much summary content should appear in a resolved block before the user opens the source thread?
3. How should artifact blocks behave when they are edited after a related sub-thread has resolved? A reasonable first pass is to update the displayed timestamp and preserve source traceability.
4. How much flexibility should mixed-altitude board/table/feed views allow before the product starts feeling too much like a generic database builder?
5. What is the smallest Finiti-compatible workflow model that keeps future workflow creation dirt simple without over-building it now?

## Non-Goals For The First Design Pass

- Replacing every existing board/table interaction.
- Designing a full infinite canvas.
- Exposing graph terminology to users.
- Making the sidebar a complete tree browser.
- Finalizing every edge-case label and microcopy string.
- Implementing BrainShare-specific extraction behavior.

## Design Direction

The recommended direction is:

Thread-primary WorkOS with calm sub-thread affordances, linked resolution summaries, stable sidebar threads, path-based navigation, and board/table/feed views as flexible ways of viewing work.

The experience should feel like work is unfolding in a living, traceable conversation. Finished threads leave useful summaries behind without losing where they came from.
