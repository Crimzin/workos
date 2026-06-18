# Import-Created Thread Links Design

## Goal

Starter context posts generated during an AI history import should link directly to related threads created by the same import batch. The memo should be readable as prose, but navigable as WorkOS context.

The user-facing syntax is:

```text
#[Thread Name]
```

When materialized, a resolved reference becomes the existing WorkOS `nodeMention` inline content, rendered as a clickable `#Thread Name` token that opens the referenced thread.

## Core Product Principle

This is an act of import-time creation, not global WorkOS search.

For V1, `#[Thread Name]` references only resolve against threads generated in the same accepted import plan. The resolver does not inspect existing WorkOS nodes, does not fuzzy-match unrelated workspaces, and does not try to infer that an old card is "close enough."

That keeps the generated import batch self-contained:

1. BrainShare analyzes the source material.
2. BrainShare proposes a coherent thread set.
3. BrainShare writes starter context memos that may reference sibling, parent, or child generated threads.
4. WorkOS creates the generated threads.
5. WorkOS converts import-local `#[Thread Name]` references into real clickable `#` node mentions.

## User Experience

The parent starter memo should use inline references naturally:

```markdown
BrainShare is the context engine, while #[Swarm] is the orchestration layer and #[Finiti] is an adjacent product thread around guided completion.
```

After import, this renders like ordinary WorkOS `#` mentions. Clicking `#Swarm` opens the generated Swarm thread.

The memo should also use structural aids where they help the reader:

| Thread | Role in the system |
| --- | --- |
| #[WorkOS] | Shared operating surface for human and agent work |
| #[BrainShare] | Context and memory engine |
| #[Swarm] | Agent orchestration layer |
| #[Finiti] | Adjacent guided-completion product thread |

Inline thread links should support the memo, not dominate it. The starter context still needs narrative, prioritization, evidence, and next steps.

## Scope

Included in V1:

- References among threads created by the same import batch.
- Parent-to-child, child-to-parent, and sibling-to-sibling references.
- Resolution into existing BlockNote `nodeMention` inline content.
- Preview detection of unresolved `#[Thread Name]` references.
- A generation prompt contract that tells BrainShare to only use `#[Thread Name]` for generated threads in the same output.

Excluded from V1:

- Cross-referencing existing WorkOS nodes.
- Global node search during import materialization.
- User-authored `#[Thread Name]` resolution in normal posts.
- Backlink tables or durable graph edges derived from starter-context links.
- Automatic merging of generated threads with existing WorkOS threads.

## Generation Contract

BrainShare should produce an import plan where thread references are internally consistent.

Each generated thread should have:

- a stable proposed title
- a starter context memo
- optional parent or related thread metadata
- optional inline references using `#[Exact Thread Title]`

Prompt rules:

- Use `#[Thread Name]` only when `Thread Name` is another generated thread in the same import output.
- Prefer meaningful links to important sibling or child threads over exhaustive linking.
- Use inline links where a normal memo would naturally refer to another subject.
- Do not invent a linked thread name unless that thread is included in the generated thread set.
- If the source material contains major subtopics, propose them as generated child or sibling threads instead of burying everything in the parent memo.

The prompt should also require a coverage pass before memo writing so major named concepts are not lost to recency bias.

## Import Preview Contract

Preview should surface unresolved import-local references before materialization.

For each cluster/thread, WorkOS should derive:

- `inline_thread_refs`: names found in the starter memo via `#[...]`
- `resolved_inline_thread_refs`: refs matching generated thread titles in the accepted import set
- `unresolved_inline_thread_refs`: refs that do not match any accepted generated thread title

Unresolved refs should be visible in the review UI as generation issues. V1 should still allow import, but unresolved refs remain plain text rather than producing broken links.

## Resolution Rules

Thread reference resolution is import-local.

Matching should:

- trim leading and trailing whitespace inside `#[...]`
- normalize repeated internal whitespace
- match case-insensitively for robustness
- display the canonical generated thread title after resolution

Duplicate generated titles after normalization are invalid for link resolution. Preview should flag them because `#[Thread Name]` would be ambiguous.

If a reference resolves:

- convert it to BlockNote inline content with `type: "nodeMention"`
- set `props.id` to the generated node id
- set `props.title` to the generated node title
- set `props.type` to the generated node type, usually `stack`
- preserve surrounding text and inline styles where practical

If a reference does not resolve:

- leave it as visible plain text
- record the unresolved ref in import metadata
- do not fail the entire import unless the user chooses stricter validation later

## Materialization Flow

The materializer needs a two-phase flow.

1. Create the workspace and all accepted generated thread nodes.
2. Build an import-local title map from generated thread title to node id/type.
3. Render starter context post bodies with `#[Thread Name]` converted to `nodeMention` inline content.
4. Insert pinned starter context posts.
5. Insert memory primitives and import metadata.
6. Revalidate the created workspace and threads.

This sequencing is required because a starter context post may reference a thread that is created later in the import order.

For this implementation slice, accepted generated threads should continue to materialize as stacks under the imported workspace. Parent/child relationships can be represented in memo structure and inline links. True nested materialization can come later after the generator is producing consistently good thread sets.

## Dossier-First Starter Context

Thread links work best when paired with a better starter-context synthesis flow.

Before writing memos, BrainShare should build a hidden coverage dossier for the import:

- origin narrative
- major named concepts and projects
- generated thread candidates
- target users and use cases
- tests, prototypes, and evidence
- decisions and pivots
- open questions and risks
- likely parent/child relationships

The visible memo is then written from the dossier, using whatever structure fits the subject. For the WorkOS import, that likely means a parent memo with tables, bullets, timelines, and inline links to generated child threads.

## Testing

Add focused tests for:

- extracting `#[Thread Name]` refs from starter context markdown
- resolving refs against an import-local generated thread set
- unresolved refs remaining plain text
- duplicate generated titles producing a preview issue
- materialization creating all nodes before rendering starter posts
- generated BlockNote output containing `nodeMention` inline content
- existing markdown links still rendering normally

Manual browser verification should confirm that imported starter-context `#` mentions are clickable and route to the generated sibling/child thread.

## V1 Decisions

- Unresolved refs warn in preview but do not block import.
- Generated threads materialize as stacks under the imported workspace.
- Preview keeps raw `#[Thread Name]` syntax and shows issue badges for unresolved refs.

## Later Decisions

- Whether to materialize generated child threads as nested cards/stacks under a parent thread.
- Whether to render `#[Thread Name]` as a non-clickable pill in preview before materialization.
- Whether to derive durable backlinks or graph edges from starter-context references.

## Success Criteria

The first successful version should make an imported WorkOS history feel like a navigable knowledge structure, not a flat summary. A reader should be able to start in the parent memo, understand the overall narrative, and jump directly into generated threads like `#BrainShare`, `#Swarm`, and `#Finiti` without relying on search or manual reconstruction.
