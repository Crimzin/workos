# BrainShare Import Genesis Design

## Goal

WorkOS import should become BrainShare's opening gambit: it slurps up an AI conversation export, turns source conversations into provisional BrainShare memory, and uses that memory to propose the first WorkOS thread map.

The product goal is not to categorize Claude or ChatGPT chats. The goal is to produce a MECE map of topics, projects, goals, and subtopics that is more useful than the raw archive. The wow moment should be: "WorkOS understands what is on my mind and gave me a clearer map of it."

This iteration builds a provisional BrainShare graph model inside `apps/platform`. It should use BrainShare-shaped concepts now, while deferring the full Python/FastAPI/Graphiti backend until the UX and import protocol are validated.

## Core Reframe

Old frame:

```text
conversations -> clusters -> starter context
```

New frame:

```text
source export
-> Episodes
-> topic chunks within Episodes
-> facets / primitive candidates
-> MECE attention scope tree
-> reviewed BrainShare memory
-> WorkOS threads and starter contexts
```

Chats are source material, not buckets. A single chat can meander across several topics and contribute evidence to multiple future WorkOS threads.

## Product Principles

- Every export conversation must be accounted for as an Episode, even if it contributes no useful memory.
- Untitled does not mean empty. Untitled chats with messages need derived titles and normal source handling.
- The primary review object is the proposed scope/thread map, not chat clusters.
- A source chat can support multiple scopes, but each extracted facet should have one primary home in the MECE map.
- BrainShare conviction must trace to human signal, not AI-generated prose.
- User corrections are first-class signal. They should update the provisional memory map and later become correction Episodes in BrainShare proper.
- Fast visible progress matters. The user should see inventory and first-pass understanding before any full transcript extraction finishes.
- The provisional platform-side model must map cleanly to the future BrainShare backend.

## No Hard-Coded Prophecies

Export-specific expectations are acceptance-oracle examples, not product priors.

For the current local export, it is useful to evaluate whether the proposal discovers separate meaningful scopes for things like active projects, prior work, creative/music work, career exploration, finances, immigration/legal, health, and events. Those expectations belong in env-gated local tests, fixture assertions, or manual evaluation notes.

The implementation must not contain user-specific strings, project names, or expected cluster labels as hidden rules. Production logic may use generic mechanisms only:

- source provenance
- topic boundary detection
- named-entity extraction
- repeated-entity and repeated-intent detection
- human-signal weighting
- facet extraction
- MECE scope synthesis
- contradiction and bridge detection
- common domain priors

If an expected scope emerges, it must emerge from source evidence, not from a hardcoded list. Tests may verify expected output for a fixture, but production code must stay fixture-agnostic.

## Provisional BrainShare Objects

### Episode

An immutable source conversation from an import.

Fields should include:

- stable source id
- source tool and export fingerprint
- source title, derived title, and title kind
- timestamps
- message counts and human-message counts
- readable status and exclusion reason
- raw provenance pointer
- compact source sketch for review

### Topic Chunk

A coherent topic segment inside an Episode.

This handles long or meandering conversations. Topic boundaries can come from cheap heuristics first:

- explicit shifts such as "now let's talk about"
- large subject-matter changes
- title/summary/entity discontinuities
- long pauses when timestamps are available
- sudden movement from one project/person/domain to another

The first implementation can use coarse chunking from human turns and sketches. Full transcript chunking can happen selectively.

### Facet Candidate

A provisional memory unit extracted from a Topic Chunk.

Facet types should align with BrainShare typed primitives without requiring the full backend yet:

- project
- goal
- subgoal
- decision
- assumption
- action
- open question
- context update
- person / actor
- artifact
- signal pattern
- relationship

Each facet should carry:

- statement
- facet type
- primary Episode and Topic Chunk
- supporting source links
- confidence / conviction posture
- human-signal evidence when present
- candidate scope assignment

### Scope Node

A proposed MECE WorkOS thread or subthread.

Scope nodes are the user-facing map. They should support:

- title
- short memo-style summary
- rationale
- parent scope id, if nested
- attention tier: full extraction, lightweight tracking, or ignore
- facet ids
- source links
- suggested questions or correction prompts
- confidence

Scope nodes should be suitable to become WorkOS threads, stacks, cards, or starter-context posts after review.

### Source Link

An evidence link from a scope or facet back to one or more Episodes / Topic Chunks.

Source links are how the user inspects why BrainShare believes something and how future Graphiti provenance edges can be created.

## Pipeline

### 1. Import Inventory

Parse the export and create one Episode per source conversation.

The UI should immediately show:

- total source conversations
- readable conversations
- unreadable conversations
- untitled conversations
- derived-title conversations
- excluded Episodes and reasons

No source conversation should disappear.

### 2. Cheap Sketch Pass

Create a compact sketch for every readable Episode. This is the universal substrate for fast review and LLM synthesis.

Sketch fields:

- display title
- one-paragraph source summary from export metadata or cheap extraction
- first human turn
- last human turn
- candidate signal human turns
- top human-mentioned entities and terms
- attachment/file hints
- noise flags
- source project prior, if available

Candidate signal turns are provisional. They are selected by local heuristics such as first and last substantive human turns, concrete named entities, correction markers, decision language, overlap with title/summary, and information density.

### 3. Topic Chunk Proposal

Split Episodes into one or more Topic Chunks.

Short or coherent conversations may have one chunk. Long conversations can have multiple chunks. The system should prefer a rough useful split over expensive perfect segmentation during onboarding.

### 4. Facet Extraction

Extract lightweight Facet Candidates from sketches and chunks.

The first implementation can use a hybrid approach:

- deterministic extraction for obvious entities, titles, repeated terms, and source metadata
- LLM extraction over compact sketches/chunks for higher-level facets such as goals, decisions, assumptions, questions, and narrative relationships

Full transcript extraction is reserved for approved scopes, high-signal chunks, ambiguous bridge chunks, or user-selected evidence.

### 5. MECE Scope Synthesis

Synthesize a proposed attention scope tree from facets.

The scope tree should aim to be:

- complete enough to account for all meaningful source material
- mutually exclusive at the scope/facet level
- collectively exhaustive for the user's active domains
- nested where a topic naturally has subtopics
- opinionated enough to be insightful
- humble enough to ask when evidence is thin

The system should treat common human domains as priors, not final categories. The actual scopes should be shaped by source evidence, repeated intent, named projects, human corrections, and source organization.

### 6. Review And Correction

The review UI should ask the user to approve or correct the map of what BrainShare thinks matters.

The user should be able to:

- rename scopes
- delete scopes
- split scopes
- merge scopes
- move facets or source evidence
- set attention tiers
- answer suggested yes/no questions
- give natural-language instructions through the composer
- inspect source evidence in a side panel

The language should avoid "approve these clusters." It should feel like reviewing BrainShare's first map of the user's world.

### 7. Materialization

After review, approved Scope Nodes can become WorkOS threads/nodes and starter-context inputs.

This spec does not require full Graphiti persistence yet. It should preserve enough IDs and source links that the approved provisional graph can later be committed into BrainShare proper.

## LLM Usage

LLMs should be used where semantic judgment matters, not as an excuse to process everything expensively.

Recommended use:

- synthesize a MECE scope tree from compact Episode/Chunk sketches
- extract high-level facet candidates from compact chunks
- critique proposed scopes for generic labels, mixed projects, missing anchors, and bridge topics
- propose user-facing correction questions

Avoid:

- full transcript extraction for every source before showing anything
- one giant prompt containing all raw chats
- hidden deterministic rules that mimic one user's expected output
- storing LLM suggestions as high-conviction memory without human signal

## Conviction And Human Signal

BrainShare's conviction principle applies from the start:

- AI-generated content can be useful context.
- Human responses determine whether that content is adopted.
- Explicit user approval, correction, or instruction is stronger evidence than silence.
- Brainstorming should not be stored as a decision unless the user validates it.
- A correction during import review is high-signal memory about how the user understands their own world.

The provisional model can represent conviction simply at first:

- assert: strong human signal or repeated clear source evidence
- flag: plausible but incomplete or possibly mixed
- ask: thin evidence, ambiguity, or possible conflict

## UI Shape

The import page should feel like an interactive BrainShare memo, not a board.

Main surface:

- opening synthesis of what BrainShare found
- proposed scope tree with nested scopes
- attention tier controls
- source evidence chips attached to scopes
- inline suggested decisions/questions
- coverage metrics that preserve trust

Composer:

- same visual and interaction pattern as the WorkOS thread composer
- accepts natural-language corrections such as "make this its own thread" or "move the immigration items out of finance"
- can show an inline confirmation dialog before materialization

Side panel:

- opens when the user clicks source evidence
- shows Episode sketch, Topic Chunks, Facet Candidates, and provenance
- stays pinned while scrolling
- starts closed so the first view is the map

## Data Boundaries

This iteration lives in `apps/platform`.

The provisional model should be stored as typed TypeScript data and, where needed, local/Supabase import-review state. It should not require Neo4j, Graphiti, or the Python BrainShare service yet.

The model should remain portable:

```text
Platform Episode             -> BrainShare Episode
Platform TopicChunk          -> BrainShare chunk
Platform FacetCandidate      -> BrainShare typed primitive candidate
Platform ScopeNode           -> BrainShare Goal / Scope / WorkOS node
Platform SourceLink          -> Graph provenance edge
```

## Testing Strategy

Unit tests:

- parse all source conversations into Episodes
- distinguish untitled from unreadable
- derive titles without excluding useful chats
- create multiple Topic Chunks for meandering synthetic conversations
- allow one Episode to support multiple Scope Nodes through Source Links
- preserve one primary Scope assignment per Facet Candidate
- reject invalid states with missing source references
- preserve coverage metadata

Fixture / local acceptance tests:

- use the local export only as an env-gated acceptance oracle
- verify that expected meaningful domains are discoverable from evidence
- verify that no source conversations disappear
- verify that the system can produce a more useful scope map than flat chat categories
- scan production import logic to prevent fixture-specific magic strings from entering implementation code

Browser tests:

- `/import` displays total source count and parse status
- excluded count is inspectable and not misleading
- scope review controls do not blank the page
- natural-language corrections update the provisional scope map
- source side panel opens and closes without losing review state

## Implementation Boundary

This spec covers the provisional BrainShare import model and review-state generation inside WorkOS.

It does not yet implement:

- Graphiti / Neo4j storage
- the Python BrainShare service
- full typed primitive extraction for every transcript
- cross-import matching against existing WorkOS memory
- long-term graph retrieval or context assembly

Those should follow once the user has validated the import genesis experience and the provisional objects have proven useful.
