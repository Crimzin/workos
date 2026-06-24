# Import And Continuation Design

Status: approved direction for the next WorkOS v1 build slice
Date: 2026-06-24

## Summary

WorkOS should pivot the import/cold-start build away from a mandatory map review and toward import-and-continuation.

The v1 promise is:

> Import Claude and ChatGPT, start working, and WorkOS remembers where you left off with visible provenance.

Imported Claude and ChatGPT conversations become normal WorkOS threads. They live in a historical Imported Chats section in the left rail, but they can be opened, continued, searched, mentioned with `#`, attached as context, ignored in suggestions, archived, hidden, or deleted.

The system should not ask the user to review a generated map of their AI history before they can work. Structure and memory should accrue over time as imported context becomes relevant to real work.

## Goals

- Break the context wall for non-engineer AI users.
- Let users import Claude and ChatGPT exports in one first-run import session.
- Preserve full source transcripts and provenance.
- Make imported chats feel like old WorkOS chats, not archive documents.
- Let users continue an imported chat directly.
- Let users start a new thread and have WorkOS automatically retrieve relevant prior context.
- Support conversational retrieval, `#` mention attachment, and side-panel context search.
- Keep context attachment persistent for the whole thread.
- Show context-use events in the chat timeline before the assistant response uses that context.
- Preserve the recursive node substrate, memory primitives, fields, source provenance, and board capability for future Context and workflow intelligence.
- Move board from a per-thread peer tab to a global optional organizational surface.

## Non-Goals

- No mandatory topic-cluster review.
- No full world-map generation during onboarding.
- No standalone BrainShare surface or user-facing BrainShare naming.
- No automatic conversion of all imported history into a project/task hierarchy.
- No app imports beyond Claude and ChatGPT in this slice.
- No generic automation/workflow canvas.
- No requirement to preserve old per-thread board views as user-facing pages.

## Product Shell

WorkOS becomes chat-first.

The center panel is the working thread: imported transcript, native messages, assistant replies, context events, handoff markers, and user corrections all live in the main timeline.

The left rail should have these major regions:

```text
Top nav:
- New chat
- Search
- Board
- Feed / Focus later
- Settings

Primary threads:
- Pinned
- Active / user-created threads

Historical/imported:
- Imported Chats
```

The current per-node tab model should be redistributed:

```text
Chat: center timeline
Context / Memory / Sources / Fields / Tree: structured side panel
Board: global top-left page
Feed: later becomes Focus
```

This preserves the underlying functionality while avoiding a UI where every chat feels like a mini workspace with five equal tabs.

## Import Flow

The first-run import flow is batch-oriented.

The user can add both Claude and ChatGPT exports before generating imported threads:

```text
Add exports
- Claude export detected
- ChatGPT export detected

Review import inventory
- file/app detected
- readable chat count
- duplicate or invalid-file warnings

Generate imported threads
Start working
```

This inventory review is not a cluster/map review. It only confirms what WorkOS is about to import.

The user can run additional import sessions later with one or more exports.

## Imported Chats

Each imported Claude/ChatGPT conversation becomes a normal WorkOS thread with source metadata.

Imported threads should have:

- full transcript inline
- source app logo or badge
- imported source metadata
- stable provenance pointers
- eligibility for global search
- eligibility for `#` mention/search
- eligibility for automatic and conversational context retrieval, unless ignored
- the ability to continue below the imported transcript

When the user continues an imported thread, WorkOS inserts a lightweight handoff marker between old and new messages:

```text
Imported from Claude
Continued in WorkOS
```

or:

```text
Imported from Claude · Continued in WorkOS on June 24, 2026
```

The exact copy can be refined in UI implementation. The important requirement is that historical source content and WorkOS continuation are visibly separated.

## Imported Chats Left Rail

Imported chats live in a lower left-rail section because they are historical, not because they are second-class.

Rows should feel like Claude/ChatGPT sidebar rows:

```text
[Claude logo] Campaign reporting script
[ChatGPT logo] SQL cleanup notes
[Claude logo] Positioning draft
```

Default rows should not need dates. Search, sort, and filter controls appear at the top of the Imported Chats section when expanded.

Required controls:

- browse imported chats
- search by title and content
- filter by source app
- filter by hidden/ignored/archived where useful
- sort by newest, oldest, recently used, and possibly title later

Each imported chat row needs a three-dot menu with:

- Open
- Pin / unpin
- Hide from Imported Chats
- Ignore in suggestions / Allow in suggestions
- Archive
- Delete forever

Action meanings:

- Hide from Imported Chats: remove from that rail section only. The thread still exists, remains searchable, can be directly attached with `#`, and can be used for automatic context unless ignored.
- Ignore in suggestions: WorkOS will not automatically pull this thread into future context suggestions. Direct `#` attachment and direct opening still work.
- Archive: remove from normal active surfaces while keeping it restorable and available through archive filters according to product rules.
- Delete forever: permanently remove the imported chat/source content after confirmation.

## Context Retrieval Doors

Within a thread, context can enter through four doors:

```text
1. Automatic retrieval
2. Conversational retrieval
3. # mention/search
4. Side-panel search
```

Global search and left-rail browsing are navigation tools. They help the user go somewhere. They should not be treated as primary "attach context to the current thread" mechanisms.

### Automatic Retrieval

When the user starts or continues a thread, WorkOS should quietly check imported and native history for relevant context.

Ranking should favor:

- recent material first
- strong title/source/content matches
- unresolved work or next-step language
- repeated topics
- explicit source hints from the user
- thread context already attached to the current work

If confidence is high, WorkOS attaches context before the assistant response and shows a timeline event:

```text
Added context from Claude: Campaign reporting script
```

If confidence is split, WorkOS asks a quick disambiguation question before using the wrong context:

```text
Do you mean the SQL campaign script or the Python export script?
```

If confidence is low, WorkOS proceeds normally without pretending it found useful prior context.

### Conversational Retrieval

Users can ask naturally:

```text
Find where I talked about the script with ChatGPT.
I think there was a Claude chat called campaign reporting.
Pull in the thing where Lulu and I were discussing marketing data.
Look for the keyword XYZ.
```

WorkOS should search, present likely matches only when needed, attach the chosen or high-confidence source to the current thread, and continue the work.

### `#` Mention/Search

Typing `#` searches one namespace:

- Claude imported chats
- ChatGPT imported chats
- native WorkOS threads
- imported chats that have been continued in WorkOS
- later source types when added

Results show source logos on the left so users can distinguish Claude, ChatGPT, WorkOS, and later sources without splitting the search surface.

This search must be reliable. If the user types meaningful words from a title, in any order, the matching thread or imported chat should appear.

Requirements:

- search all eligible native threads and imported chats
- include hidden-from-imported-rail items unless archive/delete rules exclude them
- normalize case, punctuation, whitespace, smart quotes, and hyphens
- use token-based matching, not only prefix or substring matching
- support order-insensitive title-token matches
- rank exact titles and all-token title matches highly
- avoid limiting candidates before scoring
- reuse the same matching core for `#`, global search, side-panel search, and imported-chat rail search where possible
- test exact-title and unordered-title-word lookup failures

### Side-Panel Search

The context side panel should include search for finding and attaching context while staying in the current thread.

This is for users who are already working and want to pull in a specific old chat/thread/source without leaving the thread.

## Persistent Thread Context

Context attachment is thread-level, not one-message.

When WorkOS attaches context through automatic retrieval, conversational retrieval, `#`, or side-panel search, that context remains available to the ongoing thread until the user removes, ignores, supersedes, or corrects it.

Rule:

> Attachment is whole-object. Prompt inclusion is budget-aware.

Product behavior: if a user attaches a prior chat, the whole prior chat is attached to the thread.

Prompt assembly behavior: if the attached object is too large, WorkOS may include a faithful summary plus the most relevant passages while keeping the full source inspectable and available for follow-up retrieval.

## Timeline Context Events

Whenever WorkOS attaches, ignores, removes, or meaningfully changes thread context, it should create a compact event in the main timeline.

Examples:

```text
Added context from Claude: Campaign reporting script
Added context from 3 imported chats
Removed context from this thread: Old dashboard experiment
Ignored ChatGPT: Old dashboard experiment in suggestions
```

Context events appear before the assistant response that uses the context.

Event quick actions should include, where applicable:

- Open
- Remove from thread
- Ignore in suggestions
- Allow in suggestions
- Undo

These actions should also be available from semantically appropriate places such as the source chat, the side panel, and Settings/Sources. The product should not impose arbitrary limits on where a user can correct context behavior if the current place makes the object and action understandable.

## Context Source Links And Deep Links

Whenever a different thread is referenced as context in the current thread, the referenced thread should be clickable.

This applies to:

- timeline context events
- citations in assistant replies
- attached-context rows in the side panel
- `#` mentions
- conversational retrieval results
- source snippets

Opening a referenced thread should preserve the user's current place. On web, the default behavior should be to open the referenced thread in a new tab or equivalent secondary surface rather than replacing the current working thread.

When WorkOS references a specific moment inside a source thread, the link should deep-link to the relevant message or message range whenever possible.

Example:

```text
WorkOS: This looks like the same parsing issue from the SQL script thread.
Source: Claude · Campaign reporting script · parsing issue
```

Clicking the source should open the source thread at the cited parsing-issue message, not at the top of a long transcript.

Deep-link requirements:

- imported and native messages need stable addressable IDs
- source citations should store the thread id plus message id, source index, or source span
- cited messages should be visually highlighted or scrolled into view on open
- if exact message anchoring is unavailable, WorkOS should fall back to opening the source thread and showing the nearest available source snippet in the context panel
- users should not have to manually scroll a long imported chat to verify a surfaced source

## Structured Context Panel

The right panel should be persistent, structured, and horizontally resizable on desktop. On mobile it becomes a full-height drawer.

It should be opened from:

- context events
- citations
- `#` attachments
- a persistent context control
- side-panel search interactions

It should not be a hodgepodge document drawer. It should organize current thread context into stable sections:

```text
Context
- Attached context
- Sources
- Open loops
- Decisions / assumptions
- Memory notes
- Related threads
- Fields / metadata
- Child threads
```

This replaces the current mental model where Chat, Board, Fields, Memory, and Tree are peer tabs on every thread.

Memory, fields, sources, and tree relationships remain important. They move into the context side panel because they support the conversation.

## Board Direction

Board becomes a global page reachable from the top of the left rail, similar to Feed today.

It should not remain a primary per-thread tab. The old per-thread board views can be removed as user-facing surfaces.

The board should be an optional organizational surface over the same recursive node/thread substrate:

- users can add any thread to the global board
- imported chats can be added to the board if useful
- users like Lulu can ignore board entirely
- board power users can organize work spatially
- board placement does not determine whether a thread exists

The global board can start visually blank, with an Add thread action.

When a user adds a parent thread to the global board, its subthreads should be able to appear with it. If those subthreads already have field values, lifecycle statuses, priorities, or other board-relevant metadata, the global board should reflect those values rather than erasing them.

The migration stance is:

- remove old per-thread board UX
- preserve nodes, subthreads, field values, lifecycle statuses, priorities, mirrors, links, and positions where they remain meaningful
- do not require users to revisit old thread-specific board views
- make the global board read existing field values and relationships when threads are added

## Data Model Orientation

Imported chats should use the existing node/thread substrate with import/source metadata.

Likely node-level metadata:

```text
source_kind: imported_ai_chat
source_app: claude | chatgpt
source_import_session_id
source_conversation_id
source_title
source_created_at / source_updated_at where available
source_hash
suggestion_status: allowed | ignored
imported_visibility: visible | hidden_from_imported_chats
```

Likely message/post-level metadata:

```text
source_app
source_message_id
source_role
source_author
source_index
source_timestamp
raw_text_hash
import_boundary_marker
```

Thread-context attachment needs durable state:

```text
thread_id
context_source_node_id
attached_by: automatic | conversational | hashtag | side_panel | user
status: active | removed | ignored_for_suggestions
created_at
removed_at
metadata: retrieval score, reason, source spans, prompt inclusion notes
```

Exact table and column design should happen during the implementation plan, but the product contract needs this durable state.

## BrainShare Substrate

BrainShare remains an internal Context engine, not a user-facing product.

This v1 should preserve enough substrate for future Context intelligence:

- source-preserving imported conversations
- exact message provenance
- distinction between human and AI messages
- raw text hashes
- source timestamps
- thread-level context attachments
- user corrections as durable signals
- ability to promote extracted decisions, assumptions, standards, open loops, and summaries over time

Full graph extraction is not required before the user can work.

The model is progressive:

```text
Import source chats
Make them searchable and citeable
Attach relevant context during real work
Record what was useful or rejected
Promote durable structure over time
```

## Settings And Source Management

V1 needs both everyday left-rail controls and a governance-oriented Settings/Sources surface.

Settings/Sources should include:

- import Claude/ChatGPT exports
- view import sessions and status
- manage ignored sources
- re-enable sources
- review and restore archived imported chats
- delete imported sources forever

Everyday navigation and continuation remain in the left rail.

## Acceptance Criteria

- A user can add Claude and ChatGPT exports in the same first-run import session before thread generation.
- The user can run later import sessions.
- Imported conversations become normal WorkOS threads in an Imported Chats left-rail section.
- Imported chat rows show source logos and clean titles.
- Imported chats can be opened and continued directly.
- Imported transcripts render inline, with a visible handoff marker before WorkOS continuation.
- Imported chats and native WorkOS threads share one reliable `#` mention/search namespace.
- `#` search finds exact titles and meaningful unordered title words.
- Context can be attached through automatic retrieval, conversational retrieval, `#`, and side-panel search.
- Automatically attached context appears as a visible timeline event before the assistant response uses it.
- Attached context persists for the whole thread.
- Referenced context threads are clickable and open without losing the current working thread.
- Specific source moments deep-link to the cited message or nearest available source span.
- Users can open, remove, ignore, allow, and undo context choices from sensible places.
- The structured context panel exposes attached context, sources, memory, open loops, fields, and related/child threads.
- Board is available as a global top-left page.
- Existing board-relevant data is preserved even if old per-thread board views are removed.
- The user does not need to organize or approve a generated map before using WorkOS.

Emotional criterion:

> I just said what I wanted to do, and WorkOS remembered where I left off.
