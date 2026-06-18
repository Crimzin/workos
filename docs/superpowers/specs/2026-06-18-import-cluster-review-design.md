# Import Cluster Review Design

## Goal

WorkOS should let a user review and correct AI-discovered conversation clusters before generating starter context posts. The review experience should feel fast, tactile, and familiar: suggested yes/no decisions, draggable chat chips, and a WorkOS-style composer for natural-language corrections.

This is the step between export upload and starter-context generation.

The main review area should feel like an interactive chat/post, not like the WorkOS Board tab. Do not use a kanban board, swimlanes, stack rows, card tiles, or workspace-board visual grammar for this experience.

## Product Principle

The clustering engine should make a strong first proposal, but the user should not have to trust it blindly or hand-edit JSON. The user should be able to correct the proposed import structure in three ways:

1. Answer simple yes/no questions.
2. Drag chat chips between clusters, one-offs, ambiguous items, and excluded.
3. Type instructions in natural language, like a normal WorkOS thread.

The interface should make the AI's current understanding visible and editable.

## Primary User Flow

1. User uploads or selects an AI export.
2. WorkOS runs a fast scan and proposes clusters.
3. The review page opens with:
   - proposed clusters
   - ambiguous conversations
   - one-off conversations
   - suggested yes/no questions
   - a bottom composer for instructions
4. User answers questions, drags chips, or types corrections.
5. WorkOS updates the interactive review surface immediately.
6. User clicks a generation action for one cluster or the whole approved import.
7. WorkOS generates starter context from the approved cluster state.

## Screen Layout

The page has three active regions.

### Header

The header shows:

- import name or export filename
- conversation count
- clustered count
- ambiguous count
- excluded count
- primary action: `Generate Starter Context`
- secondary action: `Save Draft`

### Main Review Surface

The main panel is an interactive review post: a structured, editable memo-like surface with cluster sections, inline controls, and draggable chat chips. It should read top-to-bottom like a WorkOS post or thread artifact, not left-to-right like a kanban board.

Each cluster appears as a flowing section with:

- cluster title
- confidence badge
- conversation count
- optional short rationale
- visible chat chips
- action menu for rename, split, merge, exclude, or generate memo for this cluster

The surface also includes special holding sections:

- `Ambiguous`
- `One-Offs`
- `Excluded`
- `New Cluster`

The holding sections are first-class editable regions, not side notes.

Design constraints:

- Use a single-column or document-like layout by default.
- Clusters should feel like editable sections inside a post, not board columns.
- Chat chips may wrap within sections, but they should not resemble WorkOS card tiles.
- Do not reuse Board tab stack/card styling, column headers, lifecycle columns, or board drag handles.
- The page should feel closer to "AI-generated memo that I can correct" than "project board that I organize."

### Bottom Composer

The bottom of the page has a WorkOS-style composer, matching the mental model of normal thread interaction.

Examples:

```text
Move Burn into the WorkOS cluster as dogfood context.
```

```text
Split Anthropic-specific job search into its own cluster.
```

```text
Keep immigration separate from finance.
```

```text
Create a new cluster for Vegas bachelor party planning and move the craps chat into it.
```

```text
Exclude the empty untitled conversations.
```

The composer should update the review surface, not create a normal post.

## Suggested Questions

The clustering engine may return suggested questions with yes/no toggles.

Examples:

- Keep agent/tooling conversations inside the WorkOS cluster?
- Include Burn in WorkOS as dogfood/product context?
- Split Anthropic-specific job-search conversations into their own cluster?
- Keep immigration/visa conversations separate from finance/legal planning?
- Split allergy-related health conversations into their own health subcluster?
- Separate TribeWild group-project work from personal songwriting?

Each question should have:

- short label
- yes/no toggle
- affected conversations
- preview of the action

Each question defaults to `No`, and the user is not required to answer any of them. The happy path is doing nothing: unanswered questions remain `No` and the current proposal stays intact.

Toggling a question to `Yes` should move chips automatically. Toggling it back to `No` should reverse that suggested move where possible. Users can still override by dragging chips afterward.

## Chat Chips

Each conversation is represented as a chip.

Collapsed chip content:

- title

Example:

```text
Work OS - investigation
```

Hover preview content:

- message count
- confidence or relevance
- optional date
- short summary

Expanded or selected chip detail:

- title
- export summary
- first human turn
- last human turn
- high-signal human turns
- rare terms
- why included
- current cluster
- move-to menu

The move-to menu is required as an accessibility and precision fallback to drag/drop.

## Drag And Drop

Drag/drop should support:

- moving a chip between clusters
- moving a chip to `Ambiguous`
- moving a chip to `One-Offs`
- moving a chip to `Excluded`
- dropping a chip onto `New Cluster`, which prompts for a cluster name

Dragging should be reversible through undo.

The UI should not require pixel-perfect dragging. Clusters and holding areas should have large drop zones.

## Natural-Language Instruction Engine

The bottom composer sends the current review-state snapshot plus the user's instruction to an instruction interpreter.

The interpreter returns a structured patch, not prose.

Patch operations:

- `move_conversation`
- `move_many_conversations`
- `create_cluster`
- `rename_cluster`
- `merge_clusters`
- `split_cluster`
- `exclude_conversations`
- `mark_ambiguous`
- `mark_one_off`
- `answer_question`

The UI applies the patch and shows a compact confirmation:

```text
Moved 2 conversations into WorkOS / BrainShare / Swarm.
```

For risky or ambiguous instructions, the system should ask for confirmation before applying.

Examples that require confirmation:

- "delete all the one-offs"
- "exclude everything unrelated"
- "merge all career stuff"
- "move the ambiguous ones where they belong"

The composer should support undo for the last applied instruction.

## Instruction Handling Rules

The instruction engine should:

- use only the visible cluster state and conversation sketches
- avoid using hidden assistant memory or prior conversation context
- prefer small, reversible patches
- ask when a title match is ambiguous
- report when no matching conversation or cluster was found
- never generate starter context as a side effect of a correction instruction

This preserves the user's trust: the review surface changes because the user asked for a structural edit, not because the model silently reinterpreted the whole export.

## State Model

The review state should include:

- clusters
- conversations
- questions
- holding areas
- operation history
- unresolved instructions

Minimal shape:

```ts
interface ImportClusterReviewState {
  importJobId: string;
  clusters: ReviewCluster[];
  conversations: ReviewConversation[];
  questions: ReviewQuestion[];
  holdingAreas: {
    ambiguous: string[];
    oneOffs: string[];
    excluded: string[];
  };
  history: ReviewOperation[];
}
```

Each conversation belongs to exactly one place:

- one cluster
- ambiguous
- one-offs
- excluded

## Cluster Generation Boundary

This page reviews cluster membership only.

It does not yet:

- generate starter context automatically
- materialize WorkOS threads
- resolve `#[thread]` links
- run deep full-transcript indexing for every conversation

Those steps happen after the user approves the cluster state.

## Empty Conversations

The fast scan may find empty or untitled conversations.

They should appear in a grouped review bucket:

```text
22 empty or unreadable conversations
```

The user can:

- exclude all
- keep as one-offs
- review individually

Default recommendation: exclude from starter-context generation, but do not delete source data.

## Success Criteria

The review page succeeds if a user can:

- understand the proposed clusters in under a minute
- answer the obvious questions with toggles
- fix mistakes by dragging chips
- issue natural-language structural corrections
- see the review surface update immediately
- approve a cluster for starter-context generation without editing JSON

The page should feel like WorkOS is asking for a few high-leverage corrections, not making the user organize an archive from scratch.

## Later Extensions

- Inline `#[thread]` references after generated thread sets exist.
- Multi-pass background refinement that suggests additional related chats.
- Saved import review sessions.
- Diff view between original AI proposal and user-corrected cluster state.
- Bulk keyboard shortcuts for power users.
- Conversation search/filter within the review surface.
