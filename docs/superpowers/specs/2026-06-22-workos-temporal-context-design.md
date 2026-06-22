# WorkOS Temporal Context Design

Date: 2026-06-22
Status: Draft for review

## Goal

WorkOS should treat time as part of the operating context, not merely as UI decoration. Every agent should know the current WorkOS date and time, every meaningful WorkOS event should carry an exact timestamp with date, and older context should be interpreted through its age before it influences a reply.

The immediate failure mode to prevent is stale-context leakage. If a user mentioned a temporary condition months ago, an agent must not treat it as current. If a thread paused overnight, an agent must not assume last night's schedule, fatigue, or urgency is still true the next day.

## Product Principles

- WorkOS is the user-facing product name. Internal implementation may use agent/runtime/event terminology, but UI copy should stay plain.
- Exact time should be available wherever WorkOS or an agent reasons about events.
- Relative time can remain useful in compact UI, but it must never be the only time available to agents.
- Older context is not automatically irrelevant, but its age changes how it should be used.
- Temporary personal or situational facts expire faster than durable work facts.
- When stale context might materially affect the answer, agents should ask a brief freshness question instead of silently relying on it.

## Scope

Temporal Context v0 includes:

- A shared WorkOS clock helper in the platform app.
- Date-bearing timestamp formatting for agent prompts and key UI surfaces.
- Agent prompt rules for temporal relevance and freshness checks.
- A durable WorkOS event log for user and agent actions.
- Event writes for the highest-value mutations: thread/node creation, posts, AI replies, field value changes, field definition changes, thread status changes, links, pins, reactions, and imports.

Temporal Context v0 does not require:

- A full user-facing activity feed UI.
- Complex retention policies.
- Automatic summarization of event history.
- Per-user timezone settings beyond a clear default and a future-ready implementation boundary.

## Architecture

### Time Layer

Add `apps/platform/src/lib/time.ts` as the single place for WorkOS time rendering.

It should expose:

- `getWorkOSNow()` returns the current instant and timezone metadata.
- `formatAbsoluteDateTime(value, options)` renders a full date and time.
- `formatRelativeAge(value, now)` renders compact age when useful.
- `formatPromptTimestamp(value, now)` renders both absolute timestamp and relative age for agent context.
- `formatTemporalContext(now)` renders the current WorkOS clock for prompt headers.

The default timezone for v0 should be `America/New_York`, matching the current working context, with the API shaped so instance/user timezone can replace it later.

### Event Log

Add migration `apps/platform/supabase/migrations/0027_workos_events.sql`.

Create `workos_events`:

- `id uuid primary key default gen_random_uuid()`
- `instance_id uuid not null references instances(id) on delete cascade`
- `workspace_id uuid references nodes(id) on delete cascade`
- `node_id uuid references nodes(id) on delete cascade`
- `actor_id uuid references actors(id) on delete set null`
- `event_type text not null`
- `subject_type text not null`
- `subject_id uuid`
- `occurred_at timestamptz not null default now()`
- `summary text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Indexes:

- `(instance_id, occurred_at desc)`
- `(workspace_id, occurred_at desc)`
- `(node_id, occurred_at desc)`
- `(actor_id, occurred_at desc)`
- `(event_type, occurred_at desc)`

This table records what happened. Existing domain tables remain the source of current state.

### Event Types

Use stable, namespaced event types:

- `node.created`
- `node.updated`
- `node.archived`
- `node.unarchived`
- `node.deleted`
- `thread.resolved`
- `thread.reopened`
- `thread.superseded`
- `post.created`
- `post.updated`
- `post.deleted`
- `post.pinned`
- `post.unpinned`
- `post.reaction_added`
- `post.reaction_removed`
- `field.created`
- `field.updated`
- `field.deleted`
- `field.option_created`
- `field.option_updated`
- `field.option_deleted`
- `field.value_changed`
- `link.created`
- `link.deleted`
- `import.materialized`
- `agent.reply_started`
- `agent.reply_completed`
- `agent.reply_failed`

Metadata should include previous and next values when useful, especially for `field.value_changed`, `thread.*`, and title/status changes.

### Server Actions

Add a small event writer at `apps/platform/src/lib/events.ts`, with helpers:

- `recordWorkOSEvent(input)`
- `recordNodeEvent(...)`
- `recordPostEvent(...)`
- `recordFieldValueChanged(...)`

Server actions should write events immediately after successful mutations. If event writing fails, the action should throw for high-value state changes where history matters, because silent event loss undermines the feature. For streaming AI updates, intermediate token flushes should not create events; create an event when the AI reply starts and when the final reply completes or fails.

### Agent Prompt Rendering

Update `apps/platform/src/lib/agents/claude-prompt.ts`.

The system prompt should start with the current WorkOS clock:

```text
Current WorkOS time: Monday, June 22, 2026 at 12:43 PM America/New_York.
```

Add a Temporal Relevance instruction near the top:

```text
Before using prior thread context, compare its timestamp to the current WorkOS time. Do not assume old physical states, moods, schedules, symptoms, urgency, locations, or temporary intentions are still true unless the user restates them, they are durable project context, or there is recent confirming evidence. Answer the target post first. Older posts are background only.
```

Add a freshness-check rule:

```text
If older context appears relevant but may be stale, do not silently rely on it. Ignore it if it is clearly temporary and not needed. Ask a brief freshness question if the answer depends on whether it is still true.
```

Agent-rendered posts should use full timestamp context:

```text
[Will - Monday, June 22, 2026 at 12:43 PM America/New_York - just now]
```

For long gaps in a chronological thread, insert a marker:

```text
--- 93 days pass ---
```

This makes stale context visually and semantically hard to miss.

### Temporal Relevance Decision Ladder

Agents should follow this ladder:

1. Clearly stale temporary state: ignore unless the user reintroduces it.
   Examples: symptoms, tiredness, mood, location, "tonight", "right now", temporary blockers, short-lived preferences.
2. Possibly stale but important: ask a brief freshness question.
   Examples: priority, deadline, relationship/client state, job plans, project direction, active blocker.
3. Durable unless contradicted: use it.
   Examples: product decisions, coding standards, architecture constraints, repo facts, named goals, stable preferences.
4. Recent target-post context: trust it most.
   The latest user post beats older context unless the user explicitly asks for continuity.

### UI

Post headers may keep compact relative labels, but exact date and time should be present in `title`, `dateTime`, or accessible text. Key system surfaces should include full date and time:

- post headers
- sub-thread updated labels
- detail panel Created and Updated rows
- future event/activity views

Avoid making the UI noisy. The main product improvement is unambiguous time in WorkOS context and agent reasoning.

## Data Flow

Post creation:

1. User submits a post.
2. `createPost` inserts into `posts`.
3. `recordWorkOSEvent` writes `post.created`.
4. Agent routing receives target post with exact timestamp.
5. Prompt rendering includes current WorkOS time, exact post timestamps, time-gap markers, and temporal relevance instructions.

Field value change:

1. User edits a field.
2. `setFieldValue` reads current values for the node/field.
3. Mutation replaces the values.
4. `recordFieldValueChanged` writes previous and next values into event metadata.
5. Current board/detail views still read from `node_field_values`; event history remains available for future context and audit.

AI reply:

1. User post triggers agent routing.
2. Agent prompt receives current WorkOS time and temporally annotated thread context.
3. Streaming reply creates or updates one post.
4. WorkOS records `agent.reply_started` and terminal `agent.reply_completed` or `agent.reply_failed`.

## Error Handling

- Invalid dates should fall back to the raw value rather than crashing rendering.
- Event writes should be transactional where practical. When a mutation cannot share a database transaction from the current server action pattern, write the event immediately after the successful mutation and fail loudly if the event cannot be recorded.
- Prompt rendering should be deterministic under test by accepting an optional `now` value.
- Timezone should have a single default in v0 and should not be inferred ad hoc in multiple files.

## Testing

Add focused tests for:

- Absolute date/time formatting includes date, time, and timezone.
- Relative age formatting is computed from an injected `now`.
- Claude prompt starts with current WorkOS time.
- Claude prompt renders post timestamps with full dates.
- Claude prompt inserts time-gap markers across large gaps.
- Claude prompt includes the temporal relevance and freshness-check rules.
- Field value changes record previous and next values.
- Post creation records a `post.created` event.
- Migration creates expected indexes and constraints.

## Open Decisions

- Whether WorkOS should display an event/history panel in the first implementation or leave it as stored substrate for agents and future UI.
- Where instance/user timezone should live once multi-user settings exist.
- Whether event writes should eventually move into Postgres triggers for stronger guarantees. v0 should prefer explicit server-action writes because summaries and metadata are easier to control in application code.
