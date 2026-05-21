# Thread-Primary WorkOS Design

Date: 2026-05-21
Status: Draft for review

## Purpose

WorkOS should move from a board-primary interface to a thread-primary interface. Boards, tables, and similar views remain useful, but they become alternate ways to look at work rather than the main mental model.

The goal is to make WorkOS feel like a calm, AI-native place where work unfolds through conversation, follow-ups, summaries, and structured artifacts. The interface should preserve the power of the recursive data model without exposing technical language or making the product feel like a developer tool.

## Core Insight

The underlying system is an infinite recursive tree of work objects. A board freezes one altitude of that tree and makes workspace, stack, and card feel like fixed categories. The new interface should let the user move fluidly through the tree while keeping the experience human and conversational.

The product principle:

> A card is not a small thing. It is a piece of work seen from far away.

Workspace, stack, and card are best understood as view interpretations, not permanent object identities. When looking from one point in the work tree, a node may appear as a workspace-like container, its children may appear as stack-like groups, and their children may appear as card-like items. When opened directly, any of those same items can become a full work surface with conversation, fields, follow-ups, artifacts, and resolution history.

## Product Model

### Important Places

The left sidebar shows important places. It is not the complete hierarchy and should not try to represent every nested item.

A place may appear in the sidebar because it is:

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

The main surface shows the selected place or thread. It is the primary working area.

By default, it should feel calm and conversational. It should not look like a permanent mind-map canvas. The structure of related follow-ups should become more visible when the user hovers, selects, or focuses a piece of work.

The main surface answers: "What is unfolding here?"

### Follow-Ups

Any meaningful unit inside the main surface can start a follow-up thread:

- a message,
- an artifact block,
- a data field,
- a decision,
- a highlighted phrase,
- or a work item.

Follow-ups are contextual. They do not automatically appear in the sidebar. They become sidebar places only if they are pinned, promoted, or otherwise made durable.

Example:

1. The user is working in a client engagement scope thread.
2. Pricing comes up as a separate concern.
3. The user starts a pricing follow-up from that moment.
4. Pricing gets its own focused thread with messages, fields, decisions, assumptions, and AI work.
5. When resolved, pricing folds back into the scope thread as a linked summary.

## Resolution Model

Resolving a follow-up compresses it back into its parent. It does not delete it, flatten it, or turn its summary into the sole source of truth.

Resolved follow-ups create linked summary blocks in the parent thread. These summaries should be readable in place and should clearly state the outcome, relevant assumptions, and next actions where applicable.

The source of truth remains the follow-up thread.

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
- related follow-ups are shown with small glyphs or counters,
- resolved summaries appear as quiet linked blocks,
- unresolved follow-ups have a small open-loop marker.

On hover or selection:

- related follow-up affordances become clearer,
- local connection lines or mini structure previews can appear,
- the user can see title, status, owner, last activity, and key fields for a follow-up,
- related summaries and source items can highlight together.

On focus:

- clicking a follow-up navigates into that thread,
- the main surface becomes the selected follow-up,
- the header path updates to show location and context,
- the sidebar remains stable,
- no separate origin card is needed in the content body.

On resolution:

- the follow-up collapses into a linked summary in the parent,
- the summary should feel satisfying but not flashy,
- the source follow-up remains traceable from the summary, path, search, and related-work affordances.

## Alternate Views

Boards, tables, feeds, and calendars remain valuable, but they are projections of the current place's related work.

Examples:

- Board: good for status, ownership, and movement.
- Table: good for field editing and comparison.
- Feed: good for cross-place activity and attention.
- Thread: default surface for thinking, deciding, discussing, and collaborating with AI.

The user should not have to turn an idea into a card before it can be discussed. Discussion and structure should emerge together.

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

- place,
- thread,
- follow-up,
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

- Start follow-up
- Open thread
- Resolve
- View source
- Show where this came from
- Fold back into summary
- Reopen
- Pin
- Save as place

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

## Open Questions

1. What is the exact user-facing name for a promoted sidebar item: place, space, page, thread, area, or something else?
2. Should "follow-up" be the main UI term for subthreads, or should it vary by context?
3. What is the minimum visible affordance for an unresolved follow-up at rest?
4. How much summary content should appear in a resolved block before the user opens the source thread?
5. When should a follow-up be suggested for promotion into the sidebar?
6. How should artifact blocks behave when they are edited after a related follow-up has resolved?
7. Which current board interactions remain first-class in the thread-primary UI, and which move into alternate views?

## Non-Goals For The First Design Pass

- Replacing every existing board/table interaction.
- Designing a full infinite canvas.
- Exposing graph terminology to users.
- Making the sidebar a complete tree browser.
- Finalizing all user-facing names.
- Implementing BrainShare-specific extraction behavior.

## Design Direction

The recommended direction is:

Thread-primary WorkOS with calm follow-up affordances, linked resolution summaries, stable sidebar places, path-based navigation, and board/table views as secondary projections.

The experience should feel like work is unfolding in a living, traceable conversation. Finished threads leave useful summaries behind without losing where they came from.
