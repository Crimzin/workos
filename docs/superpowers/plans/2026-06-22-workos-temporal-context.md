# WorkOS Temporal Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give WorkOS a first-class internal clock, exact date-bearing timestamps in agent context, temporal relevance rules, and a durable event log for core user and agent actions.

**Architecture:** Add a focused time helper module, use it from the Claude prompt renderer and compact UI timestamp surfaces, then add an explicit `workos_events` table plus application-level event writer. Server actions record events immediately after successful mutations while existing domain tables remain the source of current state.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/Postgres migrations, existing Node assert tests run with `npx --yes tsx`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/platform/src/lib/time.ts` | WorkOS clock, timezone, absolute prompt timestamp, relative age, and time-gap helpers. |
| `apps/platform/src/lib/time.test.ts` | Pure tests for date-bearing formatting, relative age, current clock text, and gap labels. |
| `apps/platform/src/lib/agents/claude-prompt.ts` | Add current WorkOS time, temporal relevance rules, full post timestamps, and time-gap markers. |
| `apps/platform/src/lib/agents/claude-prompt.test.ts` | Regression coverage for prompt clock, stale-context instructions, full timestamps, and gap markers. |
| `apps/platform/supabase/migrations/0027_workos_events.sql` | Durable event table and indexes. |
| `apps/platform/src/lib/events.ts` | Event insert helpers and pure event metadata builders. |
| `apps/platform/src/lib/events.test.ts` | Pure tests for event insert shape and field-value change metadata. |
| `apps/platform/src/lib/types.ts` | `WorkOSEvent` and event type definitions. |
| `apps/platform/src/lib/actions/posts.ts` | Record post lifecycle events and pass `now` into prompt rendering. |
| `apps/platform/src/lib/agents/reply-poster.ts` | Record AI reply start/completion around non-streaming and streaming reply posts. |
| `apps/platform/src/lib/actions/fields.ts` | Record field definition, option, reorder, and value change events. |
| `apps/platform/src/lib/actions/nodes.ts` | Record node creation, thread creation, archive, resolution, reopen, and card activity events. |
| `apps/platform/src/lib/actions/links.ts` | Record link creation/deletion events. |
| `apps/platform/src/lib/actions/imports.ts` | Record import materialization events for workspace, threads, and starting posts. |
| `apps/platform/src/components/post-item.tsx` | Use full timestamp in accessible/title text while preserving compact visible label. |
| `apps/platform/src/components/thread/sub-thread-list.tsx` | Use shared date-bearing timestamp formatting. |
| `apps/platform/src/components/detail-panel.tsx` | Show created/updated with full date and time. |

---

### Task 1: WorkOS Time Helpers

**Files:**
- Create: `apps/platform/src/lib/time.test.ts`
- Create: `apps/platform/src/lib/time.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/platform/src/lib/time.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  DEFAULT_WORKOS_TIME_ZONE,
  formatAbsoluteDateTime,
  formatPromptTimestamp,
  formatRelativeAge,
  formatTemporalContext,
  getElapsedGapLabel,
} from "./time.ts";

const now = new Date("2026-06-22T16:43:00.000Z");

assert.equal(DEFAULT_WORKOS_TIME_ZONE, "America/New_York");

assert.equal(
  formatAbsoluteDateTime("2026-06-22T16:43:00.000Z", { now }),
  "Monday, June 22, 2026 at 12:43 PM America/New_York"
);

assert.equal(
  formatTemporalContext(now),
  "Current WorkOS time: Monday, June 22, 2026 at 12:43 PM America/New_York."
);

assert.equal(
  formatRelativeAge("2026-06-22T16:42:30.000Z", now),
  "just now"
);
assert.equal(formatRelativeAge("2026-06-22T15:43:00.000Z", now), "1h ago");
assert.equal(formatRelativeAge("2026-06-21T16:43:00.000Z", now), "1d ago");
assert.equal(formatRelativeAge("2026-03-21T16:43:00.000Z", now), "93d ago");

assert.equal(
  formatPromptTimestamp("2026-03-21T16:43:00.000Z", now),
  "Saturday, March 21, 2026 at 12:43 PM America/New_York - 93d ago"
);

assert.equal(
  getElapsedGapLabel(
    "2026-03-21T16:43:00.000Z",
    "2026-06-22T16:43:00.000Z"
  ),
  "93 days pass"
);

assert.equal(
  formatAbsoluteDateTime("not-a-date", { now }),
  "not-a-date"
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/time.test.ts
```

Expected: FAIL with an import error because `apps/platform/src/lib/time.ts` does not exist.

- [ ] **Step 3: Add the minimal implementation**

Create `apps/platform/src/lib/time.ts`:

```ts
export const DEFAULT_WORKOS_TIME_ZONE = "America/New_York";

export interface WorkOSTimeFormatOptions {
  now?: Date;
  timeZone?: string;
}

export interface WorkOSNow {
  instant: Date;
  iso: string;
  timeZone: string;
  label: string;
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function getWorkOSNow(
  timeZone: string = DEFAULT_WORKOS_TIME_ZONE
): WorkOSNow {
  const instant = new Date();
  return {
    instant,
    iso: instant.toISOString(),
    timeZone,
    label: formatAbsoluteDateTime(instant, { timeZone }),
  };
}

export function formatTemporalContext(
  now: Date = new Date(),
  timeZone: string = DEFAULT_WORKOS_TIME_ZONE
): string {
  return `Current WorkOS time: ${formatAbsoluteDateTime(now, {
    now,
    timeZone,
  })}.`;
}

export function formatAbsoluteDateTime(
  value: string | Date,
  options: WorkOSTimeFormatOptions = {}
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const timeZone = options.timeZone ?? DEFAULT_WORKOS_TIME_ZONE;
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);

  return `${formatted} ${timeZone}`;
}

export function formatRelativeAge(
  value: string | Date,
  now: Date = new Date()
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  if (diffMs < MINUTE_MS) return "just now";
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  return `${Math.floor(diffMs / DAY_MS)}d ago`;
}

export function formatPromptTimestamp(
  value: string | Date,
  now: Date = new Date(),
  timeZone: string = DEFAULT_WORKOS_TIME_ZONE
): string {
  return `${formatAbsoluteDateTime(value, { now, timeZone })} - ${formatRelativeAge(
    value,
    now
  )}`;
}

export function getElapsedGapLabel(
  previousValue: string | Date,
  nextValue: string | Date
): string | null {
  const previous =
    previousValue instanceof Date ? previousValue : new Date(previousValue);
  const next = nextValue instanceof Date ? nextValue : new Date(nextValue);
  if (Number.isNaN(previous.getTime()) || Number.isNaN(next.getTime())) {
    return null;
  }

  const days = Math.floor((next.getTime() - previous.getTime()) / DAY_MS);
  if (days < 2) return null;
  return `${days} days pass`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx --yes tsx apps/platform/src/lib/time.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/time.ts apps/platform/src/lib/time.test.ts
git commit -m "feat: add WorkOS time helpers"
```

---

### Task 2: Temporal Prompt Rendering

**Files:**
- Modify: `apps/platform/src/lib/agents/claude-prompt.test.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`

- [ ] **Step 1: Write the failing prompt tests**

In `apps/platform/src/lib/agents/claude-prompt.test.ts`, change the existing prompt construction:

```ts
const prompt = renderClaudePrompt(ctx, {
  targetPostId: "target",
  now: new Date("2026-06-22T16:43:00.000Z"),
});
```

Add these assertions after the existing system prompt assertions:

```ts
assert.match(
  prompt.systemPrompt,
  /Current WorkOS time: Monday, June 22, 2026 at 12:43 PM America\/New_York\./
);
assert.match(
  prompt.systemPrompt,
  /Before using prior thread context, compare its timestamp to the current WorkOS time\./
);
assert.match(
  prompt.systemPrompt,
  /Ask a brief freshness question if the answer depends on whether it is still true\./
);
```

Add these assertions after the existing target-post assertion:

```ts
assert.match(
  prompt.userMessage,
  /\[Will · Tuesday, May 19, 2026 at 10:12 PM America\/New_York - 34d ago\]\n@Claude what about the first diagnostic\?/
);
assert.match(
  prompt.userMessage,
  /\[Will · Tuesday, May 19, 2026 at 10:14 PM America\/New_York - 34d ago\]\n@Claude boop/
);
```

Add a time-gap scenario near the end of the file:

```ts
const gapPrompt = renderClaudePrompt(
  {
    ...ctx,
    ownThread: [
      post("today", "@Claude what should we do now?", "2026-06-22T16:43:00.000Z"),
      post("old", "I am exhausted tonight.", "2026-03-21T16:43:00.000Z"),
    ],
  },
  {
    targetPostId: "today",
    now: new Date("2026-06-22T16:43:00.000Z"),
  }
);

assert.match(gapPrompt.userMessage, /--- 93 days pass ---/);
assert.match(
  gapPrompt.userMessage,
  /I am exhausted tonight\.[\s\S]*--- 93 days pass ---[\s\S]*@Claude what should we do now\?/
);
```

- [ ] **Step 2: Run the prompt test to verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/agents/claude-prompt.test.ts
```

Expected: FAIL because `ClaudePromptOptions` does not accept `now`, the system prompt has no clock, and post timestamps are still relative-only.

- [ ] **Step 3: Implement prompt clock, rules, full timestamps, and gap markers**

In `apps/platform/src/lib/agents/claude-prompt.ts`, add imports:

```ts
import {
  formatPromptTimestamp,
  formatTemporalContext,
  getElapsedGapLabel,
} from "../time";
```

Extend `ClaudePromptOptions`:

```ts
  /**
   * Injectable clock for deterministic prompt tests. Production callers omit
   * this so WorkOS uses the current server time.
   */
  now?: Date;
```

At the start of `buildSystemPrompt`, define:

```ts
  const now = options.now ?? new Date();
```

Add these lines immediately after the opening identity line and blank line:

```ts
    formatTemporalContext(now),
    ``,
    `# Temporal Relevance`,
    `Before using prior thread context, compare its timestamp to the current WorkOS time. Do not assume old physical states, moods, schedules, symptoms, urgency, locations, or temporary intentions are still true unless the user restates them, they are durable project context, or there is recent confirming evidence. Answer the target post first. Older posts are background only.`,
    `If older context appears relevant but may be stale, do not silently rely on it. Ignore it if it is clearly temporary and not needed. Ask a brief freshness question if the answer depends on whether it is still true.`,
    `Use this ladder: clearly stale temporary state should be ignored unless reintroduced; possibly stale but important context needs a brief freshness question; durable project facts can be used unless contradicted; the target post is the strongest signal.`,
    ``,
```

Change every call to `renderPost` in `renderThreadSection`, `renderRelativeSection`, and `renderMentionedNodeSection` to pass `options.now ?? new Date()` through their call chain. The final function signatures should be:

```ts
function renderThreadSection(
  heading: string,
  posts: PostRecord[],
  targetPostId: string | undefined,
  now: Date
): string
```

```ts
function renderRelativeSection(
  heading: string,
  thread: RelativeThread,
  now: Date
): string
```

```ts
function renderMentionedNodeSection(
  nodes: MentionedNodeContext[],
  omittedCount: number,
  now: Date
): string
```

Replace the body of `renderThreadSection` with:

```ts
  const lines: string[] = [heading, ``];
  const chronological = [...posts].reverse();
  let previousPost: PostRecord | null = null;
  for (const p of chronological) {
    const gapLabel = previousPost
      ? getElapsedGapLabel(previousPost.created_at, p.created_at)
      : null;
    if (gapLabel) {
      lines.push(`--- ${gapLabel} ---`);
      lines.push("");
    }
    lines.push(renderPost(p, targetPostId, now));
    lines.push("");
    previousPost = p;
  }
  return lines.join("\n").trimEnd();
```

Apply the same gap-marker loop shape in `renderRelativeSection`; mentioned-node recent threads can call `renderPost(post, undefined, now)` without gap markers.

Replace `renderPost` timestamp logic:

```ts
function renderPost(
  post: PostRecord,
  targetPostId?: string,
  now: Date = new Date()
): string {
  const author = post.actor?.name ?? "Unknown";
  const when = formatPromptTimestamp(post.created_at, now);
```

Delete the local `relativeTime` function at the bottom of the file.

- [ ] **Step 4: Run the prompt test to verify it passes**

Run:

```bash
npx --yes tsx apps/platform/src/lib/agents/claude-prompt.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Run the time helper test**

Run:

```bash
npx --yes tsx apps/platform/src/lib/time.test.ts
```

Expected: PASS with no output.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts
git commit -m "feat: add temporal relevance to agent prompts"
```

---

### Task 3: WorkOS Events Table And Event Helper

**Files:**
- Create: `apps/platform/supabase/migrations/0027_workos_events.sql`
- Create: `apps/platform/src/lib/events.test.ts`
- Create: `apps/platform/src/lib/events.ts`
- Modify: `apps/platform/src/lib/types.ts`

- [ ] **Step 1: Write the failing event helper test**

Create `apps/platform/src/lib/events.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildFieldValueChangeMetadata,
  buildWorkOSEventInsert,
} from "./events.ts";

const event = buildWorkOSEventInsert({
  instanceId: "instance-1",
  workspaceId: "workspace-1",
  nodeId: "node-1",
  actorId: "actor-1",
  eventType: "field.value_changed",
  subjectType: "field",
  subjectId: "field-1",
  summary: "Will changed Status from Backlog to In Progress.",
  metadata: { field_name: "Status" },
  occurredAt: "2026-06-22T16:43:00.000Z",
});

assert.deepEqual(event, {
  instance_id: "instance-1",
  workspace_id: "workspace-1",
  node_id: "node-1",
  actor_id: "actor-1",
  event_type: "field.value_changed",
  subject_type: "field",
  subject_id: "field-1",
  summary: "Will changed Status from Backlog to In Progress.",
  metadata: { field_name: "Status" },
  occurred_at: "2026-06-22T16:43:00.000Z",
});

assert.deepEqual(
  buildFieldValueChangeMetadata({
    fieldId: "field-1",
    fieldName: "Status",
    previousValues: ["Backlog"],
    nextValues: ["In Progress"],
  }),
  {
    field_id: "field-1",
    field_name: "Status",
    previous_values: ["Backlog"],
    next_values: ["In Progress"],
  }
);

assert.deepEqual(
  buildFieldValueChangeMetadata({
    fieldId: "field-2",
    previousValues: [],
    nextValues: [],
  }),
  {
    field_id: "field-2",
    previous_values: [],
    next_values: [],
  }
);
```

- [ ] **Step 2: Run the event helper test to verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/events.test.ts
```

Expected: FAIL with an import error because `apps/platform/src/lib/events.ts` does not exist.

- [ ] **Step 3: Add event types**

In `apps/platform/src/lib/types.ts`, add after `AgentToolStatus`:

```ts
export type WorkOSEventType =
  | "node.created"
  | "node.updated"
  | "node.archived"
  | "node.unarchived"
  | "node.deleted"
  | "thread.resolved"
  | "thread.reopened"
  | "thread.superseded"
  | "post.created"
  | "post.updated"
  | "post.deleted"
  | "post.pinned"
  | "post.unpinned"
  | "post.reaction_added"
  | "post.reaction_removed"
  | "field.created"
  | "field.updated"
  | "field.deleted"
  | "field.option_created"
  | "field.option_updated"
  | "field.option_deleted"
  | "field.option_reordered"
  | "field.value_changed"
  | "link.created"
  | "link.deleted"
  | "import.materialized"
  | "agent.reply_started"
  | "agent.reply_completed"
  | "agent.reply_failed";

export interface WorkOSEvent {
  id: string;
  instance_id: string;
  workspace_id: string | null;
  node_id: string | null;
  actor_id: string | null;
  event_type: WorkOSEventType;
  subject_type: string;
  subject_id: string | null;
  occurred_at: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
```

- [ ] **Step 4: Add event helper implementation**

Create `apps/platform/src/lib/events.ts`:

```ts
import { supabase } from "./supabase";
import type { WorkOSEventType } from "./types";

export interface WorkOSEventInput {
  instanceId: string;
  workspaceId?: string | null;
  nodeId?: string | null;
  actorId?: string | null;
  eventType: WorkOSEventType;
  subjectType: string;
  subjectId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export interface WorkOSEventInsert {
  instance_id: string;
  workspace_id: string | null;
  node_id: string | null;
  actor_id: string | null;
  event_type: WorkOSEventType;
  subject_type: string;
  subject_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  occurred_at?: string;
}

export function buildWorkOSEventInsert(
  input: WorkOSEventInput
): WorkOSEventInsert {
  return {
    instance_id: input.instanceId,
    workspace_id: input.workspaceId ?? null,
    node_id: input.nodeId ?? null,
    actor_id: input.actorId ?? null,
    event_type: input.eventType,
    subject_type: input.subjectType,
    subject_id: input.subjectId ?? null,
    summary: input.summary ?? null,
    metadata: input.metadata ?? {},
    ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
  };
}

export async function recordWorkOSEvent(
  input: WorkOSEventInput
): Promise<void> {
  const { error } = await supabase
    .from("workos_events")
    .insert(buildWorkOSEventInsert(input));
  if (error) throw error;
}

export function buildFieldValueChangeMetadata(input: {
  fieldId: string;
  fieldName?: string;
  previousValues: string[];
  nextValues: string[];
}): Record<string, unknown> {
  return {
    field_id: input.fieldId,
    ...(input.fieldName ? { field_name: input.fieldName } : {}),
    previous_values: input.previousValues,
    next_values: input.nextValues,
  };
}
```

- [ ] **Step 5: Add the migration**

Create `apps/platform/supabase/migrations/0027_workos_events.sql`:

```sql
create table if not exists workos_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  workspace_id uuid references nodes(id) on delete cascade,
  node_id uuid references nodes(id) on delete cascade,
  actor_id uuid references actors(id) on delete set null,
  event_type text not null,
  subject_type text not null,
  subject_id uuid,
  occurred_at timestamptz not null default now(),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(trim(event_type)) > 0),
  check (length(trim(subject_type)) > 0)
);

create index if not exists workos_events_instance_occurred_idx
  on workos_events(instance_id, occurred_at desc);

create index if not exists workos_events_workspace_occurred_idx
  on workos_events(workspace_id, occurred_at desc)
  where workspace_id is not null;

create index if not exists workos_events_node_occurred_idx
  on workos_events(node_id, occurred_at desc)
  where node_id is not null;

create index if not exists workos_events_actor_occurred_idx
  on workos_events(actor_id, occurred_at desc)
  where actor_id is not null;

create index if not exists workos_events_type_occurred_idx
  on workos_events(event_type, occurred_at desc);

notify pgrst, 'reload schema';
```

- [ ] **Step 6: Run event helper test**

Run:

```bash
npx --yes tsx apps/platform/src/lib/events.test.ts
```

Expected: PASS with no output.

- [ ] **Step 7: Inspect migration ordering**

Run:

```bash
ls apps/platform/supabase/migrations | sort | tail -5
```

Expected: `0027_workos_events.sql` appears after `0026_rls_security_hardening.sql`.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/supabase/migrations/0027_workos_events.sql apps/platform/src/lib/events.ts apps/platform/src/lib/events.test.ts apps/platform/src/lib/types.ts
git commit -m "feat: add WorkOS event log"
```

---

### Task 4: Record Post And AI Reply Events

**Files:**
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Modify: `apps/platform/src/lib/agents/reply-poster.ts`

- [ ] **Step 1: Extend event helper test for post event shape**

Append to `apps/platform/src/lib/events.test.ts`:

```ts
const postEvent = buildWorkOSEventInsert({
  instanceId: "instance-1",
  workspaceId: "workspace-1",
  nodeId: "node-1",
  actorId: "actor-1",
  eventType: "post.created",
  subjectType: "post",
  subjectId: "post-1",
  summary: "Will posted in Launch plan.",
  metadata: { post_type: "post", body_preview: "Ship it." },
});

assert.equal(postEvent.event_type, "post.created");
assert.equal(postEvent.subject_type, "post");
assert.deepEqual(postEvent.metadata, {
  post_type: "post",
  body_preview: "Ship it.",
});
```

- [ ] **Step 2: Run event helper test**

Run:

```bash
npx --yes tsx apps/platform/src/lib/events.test.ts
```

Expected: PASS. This confirms the event helper already supports post event payloads before wiring actions.

- [ ] **Step 3: Record post events in `posts.ts` actions**

In `apps/platform/src/lib/actions/posts.ts`, import:

```ts
import { recordWorkOSEvent } from "../events";
```

After successful `posts.insert` in `createPost`, add:

```ts
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.created",
    subjectType: "post",
    subjectId: insertedPost.id,
    summary: `${actor.name} posted in this thread.`,
    metadata: {
      post_type: "post",
      body_preview: plainText.slice(0, 240),
      requested_agent_response: mayRequestAgent,
    },
    occurredAt: insertedPost.created_at,
  });
```

In `updatePost`, fetch the actor before updating:

```ts
  const actor = await getCurrentActor();
```

After the update succeeds, add:

```ts
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.updated",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} edited a post.`,
    metadata: { body_preview: plainTextFromBody(trimmed).slice(0, 240) },
  });
```

In `deletePost`, fetch the actor before deleting and add after successful delete:

```ts
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "post.deleted",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} deleted a post.`,
  });
```

In `pinPost`, fetch the actor before updating and add after successful update:

```ts
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: pinned ? "post.pinned" : "post.unpinned",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} ${pinned ? "pinned" : "unpinned"} a post.`,
  });
```

In `togglePostReaction`, after add/delete succeeds, add:

```ts
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: existing ? "post.reaction_removed" : "post.reaction_added",
    subjectType: "post",
    subjectId: postId,
    summary: `${actor.name} ${existing ? "removed" : "added"} a reaction.`,
    metadata: { emoji: normalizedEmoji },
  });
```

- [ ] **Step 4: Record AI reply events**

In `apps/platform/src/lib/agents/reply-poster.ts`, import:

```ts
import { recordWorkOSEvent } from "../events";
```

Change `postAgentReply` insert to select the post id and timestamp:

```ts
  const { data, error } = await supabase
    .from("posts")
    .insert({
      node_id: nodeId,
      actor_id: agentActorId,
      post_type: "post",
      body,
    })
    .select("id,created_at")
    .single();
```

After the insert succeeds, add:

```ts
  await recordWorkOSEvent({
    instanceId: await getNodeInstanceId(nodeId),
    workspaceId,
    nodeId,
    actorId: agentActorId,
    eventType: "agent.reply_completed",
    subjectType: "post",
    subjectId: data.id,
    summary: "AI reply completed.",
    metadata: { body_preview: text.slice(0, 240), mode: "single_insert" },
    occurredAt: data.created_at,
  });
```

Add this helper at the bottom of `reply-poster.ts`:

```ts
async function getNodeInstanceId(nodeId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nodes")
    .select("instance_id")
    .eq("id", nodeId)
    .single();
  if (error) throw error;
  return data.instance_id as string;
}
```

In `createStreamingAgentReply`, change the select to:

```ts
    .select("id,created_at")
```

After the insert succeeds, add:

```ts
  await recordWorkOSEvent({
    instanceId: await getNodeInstanceId(nodeId),
    workspaceId,
    nodeId,
    actorId: agentActorId,
    eventType: "agent.reply_started",
    subjectType: "post",
    subjectId: data.id,
    summary: "AI reply started.",
    metadata: { body_preview: initialText.slice(0, 240), mode: "streaming" },
    occurredAt: data.created_at,
  });
```

In `updateStreamingAgentReply`, after the final Supabase update, do not write an event. The terminal event is added in the caller in the next step.

In `apps/platform/src/lib/actions/posts.ts`, inside `streamInlineClaudeReply`, after the final successful flush, add:

```ts
    if (handle) {
      await recordWorkOSEvent({
        instanceId: await getNodeInstanceId(input.nodeId),
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
        actorId: input.agent.id,
        eventType: "agent.reply_completed",
        subjectType: "post",
        subjectId: handle.postId,
        summary: `${input.agent.name} completed an AI reply.`,
        metadata: { flush_count: flushCount, body_preview: accumulated.slice(0, 240) },
      });
    }
```

Add a local helper at the bottom of `apps/platform/src/lib/actions/posts.ts`:

```ts
async function getNodeInstanceId(nodeId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nodes")
    .select("instance_id")
    .eq("id", nodeId)
    .single();
  if (error) throw error;
  return data.instance_id as string;
}
```

In the catch block, after updating or creating the failure reply, record:

```ts
    if (handle) {
      await recordWorkOSEvent({
        instanceId: await getNodeInstanceId(input.nodeId),
        workspaceId: input.workspaceId,
        nodeId: input.nodeId,
        actorId: input.agent.id,
        eventType: "agent.reply_failed",
        subjectType: "post",
        subjectId: handle.postId,
        summary: `${input.agent.name} reply failed.`,
        metadata: { body_preview: failureReply.slice(0, 240) },
      });
    }
```

- [ ] **Step 5: Run tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/events.test.ts
npx --yes tsx apps/platform/src/lib/agents/claude-prompt.test.ts
```

Expected: both pass with no output.

- [ ] **Step 6: Run lint on touched files**

Run:

```bash
cd apps/platform && npx eslint src/lib/actions/posts.ts src/lib/agents/reply-poster.ts src/lib/events.ts
```

Expected: PASS with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/actions/posts.ts apps/platform/src/lib/agents/reply-poster.ts apps/platform/src/lib/events.test.ts
git commit -m "feat: record post events"
```

---

### Task 5: Record Field, Node, Link, And Import Events

**Files:**
- Modify: `apps/platform/src/lib/events.test.ts`
- Modify: `apps/platform/src/lib/events.ts`
- Modify: `apps/platform/src/lib/actions/fields.ts`
- Modify: `apps/platform/src/lib/actions/nodes.ts`
- Modify: `apps/platform/src/lib/actions/links.ts`
- Modify: `apps/platform/src/lib/actions/imports.ts`

- [ ] **Step 1: Write failing tests for value-label normalization**

In `apps/platform/src/lib/events.test.ts`, extend the existing import from `./events.ts`:

```ts
import {
  buildFieldValueChangeMetadata,
  buildWorkOSEventInsert,
  normalizeEventValueLabels,
} from "./events.ts";
```

Then append these assertions:

```ts

assert.deepEqual(normalizeEventValueLabels([" Backlog ", "", null, "Done"]), [
  "Backlog",
  "Done",
]);
assert.deepEqual(normalizeEventValueLabels([]), []);
```

- [ ] **Step 2: Run event helper test to verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/events.test.ts
```

Expected: FAIL because `normalizeEventValueLabels` is not exported.

- [ ] **Step 3: Add normalization helper**

In `apps/platform/src/lib/events.ts`, add:

```ts
export function normalizeEventValueLabels(
  values: Array<string | null | undefined>
): string[] {
  return values
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0);
}
```

- [ ] **Step 4: Run event helper test**

Run:

```bash
npx --yes tsx apps/platform/src/lib/events.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Wire field events**

In `apps/platform/src/lib/actions/fields.ts`, import:

```ts
import {
  buildFieldValueChangeMetadata,
  normalizeEventValueLabels,
  recordWorkOSEvent,
} from "../events";
```

In `setFieldValue`, fetch the actor and field before deleting existing values:

```ts
  const actor = await getCurrentActor();
  const { data: fieldRow, error: fieldErr } = await supabase
    .from("data_fields")
    .select("id,name")
    .eq("id", fieldId)
    .single();
  if (fieldErr) throw fieldErr;

  const { data: previousRows, error: previousErr } = await supabase
    .from("node_field_values")
    .select("value_text,value_date, option:data_field_options(name)")
    .eq("node_id", nodeId)
    .eq("field_id", fieldId)
    .order("position", { ascending: true });
  if (previousErr) throw previousErr;
```

After inserts complete, compute next labels from the submitted input and record:

```ts
  const previousValues = normalizeEventValueLabels(
    (previousRows ?? []).map((row) => {
      const option = row.option as { name?: string } | null;
      return option?.name ?? row.value_text ?? row.value_date ?? null;
    })
  );
  const nextValues = normalizeEventValueLabels(
    fieldType === "text"
      ? [input.valueText ?? null]
      : fieldType === "date"
        ? [input.valueDate ?? null]
        : await getOptionNames(input.optionIds ?? [])
  );

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "field.value_changed",
    subjectType: "field",
    subjectId: fieldId,
    summary: `${actor.name} changed ${fieldRow.name}.`,
    metadata: buildFieldValueChangeMetadata({
      fieldId,
      fieldName: fieldRow.name,
      previousValues,
      nextValues,
    }),
  });
```

Add helper in `fields.ts`:

```ts
async function getOptionNames(optionIds: string[]): Promise<string[]> {
  if (optionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("data_field_options")
    .select("id,name")
    .in("id", optionIds);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [row.id, row.name]));
  return optionIds.map((id) => byId.get(id) ?? id);
}
```

Record `field.created` after `createField`, `field.updated` after `renameField` and `updateField`, `field.deleted` after `deleteField`, `field.option_created` after `addFieldOption`, `field.option_updated` after `updateFieldOption`, `field.option_deleted` after `deleteFieldOption`, and `field.option_reordered` after `reorderFieldOptions`. Use `getCurrentActor()` for `instanceId` and actor attribution in each action.

- [ ] **Step 6: Wire node events**

In `apps/platform/src/lib/actions/nodes.ts`, import:

```ts
import { recordWorkOSEvent } from "../events";
```

Add event writes after successful mutations:

- `archiveNode`: `node.archived`
- `unarchiveNode`: `node.unarchived`
- `deleteNode`: fetch node before delete, then `node.deleted`
- `updateNodeTitle`: `node.updated` with previous and next title in metadata
- `createCard`: `node.created` for the card and `post.created` for the parent activity post
- `createSubThread`: `node.created` for the sub-thread and `post.created` for parent activity post
- `resolveSubThread`: `thread.resolved`
- `reopenSubThread`: `thread.reopened`

Each event should include `instanceId: actor.instance_id`, `workspaceId`, the affected `nodeId`, `actorId: actor.id`, and a short summary.

- [ ] **Step 7: Wire link events**

In `apps/platform/src/lib/actions/links.ts`, import `recordWorkOSEvent`.

After `createLink`, record:

```ts
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: fromNodeId,
    actorId: actor.id,
    eventType: "link.created",
    subjectType: "node_link",
    subjectId: null,
    summary: `${actor.name} linked two threads.`,
    metadata: { from_node_id: fromNodeId, to_node_id: toNodeId, link_type: linkType },
  });
```

In `deleteLink`, fetch the actor and record `link.deleted` with the same metadata after successful delete.

- [ ] **Step 8: Wire import materialization events**

In `apps/platform/src/lib/actions/imports.ts`, import `recordWorkOSEvent`.

After workspace creation, record `import.materialized` with `subjectType: "workspace"` and metadata containing `import_job_id` and accepted thread count.

After each imported thread node is created, record `node.created` with metadata `{ source: "import", import_job_id: plan.importJobId, import_cluster_id: thread.clusterId }`.

After each starting context post is inserted, record `post.created` with metadata `{ post_kind: "starting_context", source: "import", import_job_id: plan.importJobId, import_cluster_id: thread.clusterId }`.

- [ ] **Step 9: Run tests and lint**

Run:

```bash
npx --yes tsx apps/platform/src/lib/events.test.ts
npx --yes tsx apps/platform/src/lib/time.test.ts
cd apps/platform && npx eslint src/lib/actions/fields.ts src/lib/actions/nodes.ts src/lib/actions/links.ts src/lib/actions/imports.ts src/lib/events.ts
```

Expected: tests pass and lint reports no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/platform/src/lib/actions/fields.ts apps/platform/src/lib/actions/nodes.ts apps/platform/src/lib/actions/links.ts apps/platform/src/lib/actions/imports.ts apps/platform/src/lib/events.ts apps/platform/src/lib/events.test.ts
git commit -m "feat: record WorkOS mutation events"
```

---

### Task 6: Date-Bearing UI Timestamp Surfaces

**Files:**
- Modify: `apps/platform/src/components/post-item.tsx`
- Modify: `apps/platform/src/components/thread/sub-thread-list.tsx`
- Modify: `apps/platform/src/components/detail-panel.tsx`

- [ ] **Step 1: Confirm shared formatter coverage**

Run:

```bash
npx --yes tsx apps/platform/src/lib/time.test.ts
```

Expected: PASS with no output. This test covers the shared date-bearing formatter before UI adoption.

- [ ] **Step 2: Update post header timestamp**

In `apps/platform/src/components/post-item.tsx`, import:

```ts
import { formatAbsoluteDateTime, formatRelativeAge } from "@/lib/time";
```

Replace:

```tsx
<span className="text-[11px] text-text-tertiary">{formatRelative(post.created_at)}</span>
```

with:

```tsx
<time
  dateTime={post.created_at}
  title={formatAbsoluteDateTime(post.created_at)}
  className="text-[11px] text-text-tertiary"
>
  {formatRelativeAge(post.created_at)}
</time>
```

Delete the local `formatRelative` function at the bottom of `post-item.tsx`.

- [ ] **Step 3: Update sub-thread timestamp**

In `apps/platform/src/components/thread/sub-thread-list.tsx`, import:

```ts
import { formatAbsoluteDateTime } from "@/lib/time";
```

Replace local `formatTimestamp` usage with:

```tsx
<time dateTime={thread.updated_at}>{formatAbsoluteDateTime(thread.updated_at)}</time>
```

Delete the local `formatTimestamp` function.

- [ ] **Step 4: Update detail panel system dates**

In `apps/platform/src/components/detail-panel.tsx`, import:

```ts
import { formatAbsoluteDateTime } from "@/lib/time";
```

Replace:

```tsx
<SystemRow label="Created" value={formatDate(node.created_at)} />
<SystemRow label="Updated" value={formatDate(node.updated_at)} />
```

with:

```tsx
<SystemRow label="Created" value={formatAbsoluteDateTime(node.created_at)} />
<SystemRow label="Updated" value={formatAbsoluteDateTime(node.updated_at)} />
```

Delete the local `formatDate` function if it is no longer used.

- [ ] **Step 5: Run tests and lint**

Run:

```bash
npx --yes tsx apps/platform/src/lib/time.test.ts
cd apps/platform && npx eslint src/components/post-item.tsx src/components/thread/sub-thread-list.tsx src/components/detail-panel.tsx
```

Expected: test passes and lint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/components/post-item.tsx apps/platform/src/components/thread/sub-thread-list.tsx apps/platform/src/components/detail-panel.tsx
git commit -m "feat: show date-bearing timestamps"
```

---

### Task 7: Final Verification

**Files:**
- Verify all files changed by Tasks 1-6.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/time.test.ts
npx --yes tsx apps/platform/src/lib/events.test.ts
npx --yes tsx apps/platform/src/lib/agents/claude-prompt.test.ts
```

Expected: all pass with no output.

- [ ] **Step 2: Run broader related tests**

Run:

```bash
npx --yes tsx apps/platform/src/components/posts-tab-content.test.ts
npx --yes tsx apps/platform/src/lib/post-reactions.test.ts
npx --yes tsx apps/platform/src/lib/thread-status.test.ts
```

Expected: all pass with no output.

- [ ] **Step 3: Run lint**

Run:

```bash
cd apps/platform && npx eslint src/lib/time.ts src/lib/events.ts src/lib/agents/claude-prompt.ts src/lib/actions/posts.ts src/lib/actions/fields.ts src/lib/actions/nodes.ts src/lib/actions/links.ts src/lib/actions/imports.ts src/lib/agents/reply-poster.ts src/components/post-item.tsx src/components/thread/sub-thread-list.tsx src/components/detail-panel.tsx
```

Expected: PASS with no errors.

- [ ] **Step 4: Inspect staged and unstaged work**

Run:

```bash
git status --short
```

Expected: temporal-context files show only intentional changes. Existing unrelated import/mobile/RLS changes may still be present and must not be reverted or committed as part of this feature.

- [ ] **Step 5: Final commit if needed**

If verification required small fixes after Task 6, commit only those fixes:

```bash
git add apps/platform/src/lib/time.ts apps/platform/src/lib/time.test.ts apps/platform/src/lib/events.ts apps/platform/src/lib/events.test.ts apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts apps/platform/src/lib/actions/posts.ts apps/platform/src/lib/actions/fields.ts apps/platform/src/lib/actions/nodes.ts apps/platform/src/lib/actions/links.ts apps/platform/src/lib/actions/imports.ts apps/platform/src/lib/agents/reply-poster.ts apps/platform/src/components/post-item.tsx apps/platform/src/components/thread/sub-thread-list.tsx apps/platform/src/components/detail-panel.tsx apps/platform/supabase/migrations/0027_workos_events.sql apps/platform/src/lib/types.ts
git commit -m "fix: polish temporal context"
```

Expected: commit created only if there were post-verification fixes.
