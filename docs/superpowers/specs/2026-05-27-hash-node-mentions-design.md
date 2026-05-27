# Hash Node Mentions Design

## Goal

Add `#` node mentions to WorkOS posts so a user can explicitly attach relevant node context to an agent request without asking WorkOS to search the whole instance. The feature should feel like Slack channel references: lightweight, inline, clickable, and human-readable.

This is a near-term context-routing hack that can later become a durable BrainShare attention-scope signal.

## User Experience

Typing `#` in the post editor opens a node picker. Selecting a node inserts an inline node mention into the post body. The mention renders as a compact clickable token using the node title.

The picker searches non-archived nodes across the current instance, with titles and paths shown so similarly named cards can be distinguished.

When a post that contains one or more node mentions triggers an agent, WorkOS includes those referenced nodes in the prompt as temporary context for that invocation. V1 extracts node mentions from the target post only, not every historical post in the thread.

Initial behavior is invocation-scoped only. A `#node` mention affects the agent response to that post, but it does not permanently attach the referenced node to the thread. Thread-sticky context can come later as an explicit pin or attach action.

## Initial Context Payload

For each mentioned node, include a light context slice:

- node type, title, workspace, and breadcrumb path
- owner and members when present
- rendered field values
- Memory tab primitives: rationale, assumptions, decisions
- latest 10 posts from that node's own thread

Do not include the mentioned node's parent, sibling, child, or linked-node context in v1. This keeps token usage bounded and makes `#` references cheaper than ambient retrieval.

## Prompt Shape

Inline Claude should receive the active thread as it does today, plus a separate section before the active thread:

```text
# Mentioned Node Context

## Pricing rewrite [card]
Path: Workspace / Stack / Pricing rewrite
Fields:
- Status: In progress
Memory:
- Decision: ...
Recent thread:
[Will - 2d ago]
...
```

The active thread remains last and still marks the target post. Mentioned-node context should inform the answer, not replace the target-post instruction.

## Data Model

Store node mentions inside the existing BlockNote post body as inline content, parallel to actor mentions. The inline node mention props should include:

- `id`
- `title`
- `type`

No new database table is required for v1 because the source of truth is the post body. A database-level reference table can be added later if search, backlinks, or analytics need it.

## Implementation Boundaries

Reuse the existing mention/editor patterns where possible:

- extend the post editor suggestion behavior to support `#`
- add node search for mention candidates
- add parser utilities to extract node mentions from a post body
- extend agent context gathering to fetch light contexts for explicitly mentioned nodes
- extend prompt rendering with a mentioned-node section

The confirmed coding-agent execution path should eventually receive the same mentioned-node context. For v1, include this in the design target, but keep implementation scoped to the same context renderer if possible so inline chat and coding agents do not diverge further.

## Error Handling

If a referenced node no longer exists, render a small unavailable-context line in the prompt rather than failing the agent call.

If too many nodes are mentioned, include the first few in post order and add a prompt note that the remaining mentions were omitted due to context limits. A reasonable v1 cap is 5 mentioned nodes per agent invocation.

If a mentioned node has a very long thread, include only the latest 10 posts.

## Testing

Add focused tests for:

- extracting node mentions from BlockNote JSON
- prompt rendering with mentioned-node context
- cap behavior for too many mentioned nodes
- missing-node behavior

If the post editor mention integration is hard to unit test directly, cover extraction and rendering first, then manually verify the editor flow in the running app.

## Later Extensions

- `#node` mentions become visible backlinks on the referenced node
- users can promote a temporary mention to a durable thread attachment
- BrainShare treats `#node` references as explicit attention-scope evidence
- agent responses can cite which mentioned node informed an answer
- heavier context can be requested explicitly with language like "use the full context from #Node"
