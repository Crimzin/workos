# Focus V1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Focus V1 foundation: a persistent Focus home surface with continuous briefing conversation, explicit generation rules, and thread-anchored Focus items, without calendar integration yet.

**Architecture:** Add durable Focus tables for sessions, messages, items, and item-thread anchors. Keep Focus separate from normal node post streams, but require every accepted Focus item to anchor to one or more WorkOS threads. Ship a deterministic briefing draft path first so continuity, routing, data, and UI can be verified before adding AI generation and Google Calendar in later plans.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres migrations, server actions, Tailwind v4 token classes, lucide-react, Node assert tests run with `npx --yes tsx`.

---

## Scope Check

This plan implements the Focus foundation only. It deliberately excludes:

- Google Calendar OAuth/read/write;
- schedule drafting and calendar block commit;
- AI-generated briefings from Claude/OpenAI;
- onboarding-as-Focus;
- Granola, LinkedIn, Gmail, or external source integrations;
- drag/drop schedule editing.

The first usable milestone is: clicking Focus opens one continuous Focus conversation, WorkOS shows or creates the correct current planning-session briefing without duplicate generation on navigation, and all Focus items have thread anchors or are explicitly marked as needing an anchor.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/platform/supabase/migrations/0033_focus_foundation.sql` | Add Focus sessions, messages, items, and item-thread anchor tables. |
| `apps/platform/supabase/migrations/focus-foundation.test.ts` | Migration contract test for Focus schema, constraints, and indexes. |
| `apps/platform/src/lib/types.ts` | Add Focus session/message/item/anchor TypeScript types and event types. |
| `apps/platform/src/lib/cache.ts` | Add Focus cache tag and revalidation helper. |
| `apps/platform/src/lib/focus-windows.ts` | Pure time-window classification for Monday morning, morning, midday, end of day, Friday reflection, and ad hoc. |
| `apps/platform/src/lib/focus-windows.test.ts` | Tests for deterministic Focus planning-window classification. |
| `apps/platform/src/lib/focus-continuity.ts` | Pure decision helper for whether WorkOS should add a new briefing turn or resume current conversation. |
| `apps/platform/src/lib/focus-continuity.test.ts` | Tests for duplicate-prevention and generation triggers. |
| `apps/platform/src/lib/focus-briefing-draft.ts` | Deterministic V1 foundation briefing text and seeded Focus items from available threads. |
| `apps/platform/src/lib/focus-briefing-draft.test.ts` | Tests for role/goals framing, thread anchors, and low-context behavior. |
| `apps/platform/src/lib/focus.ts` | Supabase read/write helpers for Focus home data, session creation, message insertion, and item anchors. |
| `apps/platform/src/lib/focus-data-access.test.ts` | Static contract test for Focus data helper and action wiring. |
| `apps/platform/src/lib/actions/focus.ts` | Server actions for replying to Focus and refreshing the Focus conversation. |
| `apps/platform/src/app/focus/page.tsx` | Focus route server component. |
| `apps/platform/src/components/focus/focus-surface.tsx` | Client surface for messages, Focus items, inline actions, and reply composer. |
| `apps/platform/src/components/focus/focus-message.tsx` | Message renderer for user and WorkOS turns. |
| `apps/platform/src/components/focus/focus-item-card.tsx` | Thread-anchored Focus item renderer and missing-anchor affordance. |
| `apps/platform/src/components/focus/focus-composer.tsx` | Plain-text Focus reply composer. |
| `apps/platform/src/components/focus/focus-surface.test.ts` | Static/contract test for route and UI wiring. |
| `apps/platform/src/components/sidebar.tsx` | Add primary Focus nav item. |
| `apps/platform/src/app/page.tsx` | Redirect `/` to `/focus` so Focus is the home surface. |

---

### Task 1: Focus Schema

**Files:**
- Create: `apps/platform/supabase/migrations/0033_focus_foundation.sql`
- Create: `apps/platform/supabase/migrations/focus-foundation.test.ts`
- Modify: `apps/platform/src/lib/types.ts`
- Modify: `apps/platform/src/lib/cache.ts`

Implementation note: the original decomposition expected the next migration to
be `0031`, based on the local checkout. During execution, the linked Supabase
project reported remote-only migrations `0031` and `0032`, so Focus uses
`0033_focus_foundation.sql` to avoid a version collision.

- [ ] **Step 1: Write the failing migration contract test**

Create `apps/platform/supabase/migrations/focus-foundation.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/0033_focus_foundation.sql",
  "utf8"
);

for (const required of [
  "create table if not exists focus_sessions",
  "create table if not exists focus_messages",
  "create table if not exists focus_items",
  "create table if not exists focus_item_threads",
  "mode text not null",
  "window_key text not null",
  "role text not null",
  "message_kind text not null",
  "anchor_status text not null default 'anchored'",
  "thread_role text not null default 'primary'",
  "unique(instance_id, actor_id, window_key)",
  "unique(focus_item_id, thread_id)",
  "alter table focus_sessions enable row level security",
  "alter table focus_messages enable row level security",
  "alter table focus_items enable row level security",
  "alter table focus_item_threads enable row level security",
]) {
  assert.match(sql, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.match(sql, /check \(mode in \('weekly', 'morning', 'midday', 'end_of_day', 'friday_reflection', 'ad_hoc'\)\)/);
assert.match(sql, /check \(role in \('user', 'workos', 'system'\)\)/);
assert.match(sql, /check \(message_kind in \('briefing', 'reply', 'status', 'repair_prompt'\)\)/);
assert.match(sql, /check \(status in \('proposed', 'accepted', 'deferred', 'dismissed', 'completed'\)\)/);
assert.match(sql, /check \(anchor_status in \('anchored', 'needs_thread', 'dismissed'\)\)/);
assert.match(sql, /create index if not exists focus_sessions_instance_active_idx/);
assert.match(sql, /create index if not exists focus_messages_session_created_idx/);
assert.match(sql, /create index if not exists focus_items_session_rank_idx/);
assert.match(sql, /create index if not exists focus_item_threads_thread_idx/);
assert.match(sql, /notify pgrst, 'reload schema'/);
```

- [ ] **Step 2: Run the migration contract test and verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/focus-foundation.test.ts
```

Expected: FAIL with `ENOENT` for `0033_focus_foundation.sql`.

- [ ] **Step 3: Add the Focus migration**

Create `apps/platform/supabase/migrations/0033_focus_foundation.sql`:

```sql
create table if not exists focus_sessions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  actor_id uuid not null references actors(id) on delete cascade,
  mode text not null
    check (mode in ('weekly', 'morning', 'midday', 'end_of_day', 'friday_reflection', 'ad_hoc')),
  window_key text not null,
  status text not null default 'active'
    check (status in ('active', 'closed')),
  title text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_id, actor_id, window_key),
  check (length(trim(window_key)) > 0),
  check (length(trim(title)) > 0)
);

create table if not exists focus_messages (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  focus_session_id uuid not null references focus_sessions(id) on delete cascade,
  actor_id uuid references actors(id) on delete set null,
  role text not null check (role in ('user', 'workos', 'system')),
  message_kind text not null
    check (message_kind in ('briefing', 'reply', 'status', 'repair_prompt')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(body)) > 0)
);

create table if not exists focus_items (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  focus_session_id uuid not null references focus_sessions(id) on delete cascade,
  created_by_message_id uuid references focus_messages(id) on delete set null,
  title text not null,
  body text,
  item_type text not null default 'next_move'
    check (item_type in ('priority', 'next_move', 'planning_question', 'radar')),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'deferred', 'dismissed', 'completed')),
  anchor_status text not null default 'anchored'
    check (anchor_status in ('anchored', 'needs_thread', 'dismissed')),
  priority_rank integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deferred_until timestamptz,
  check (length(trim(title)) > 0)
);

create table if not exists focus_item_threads (
  id uuid primary key default gen_random_uuid(),
  focus_item_id uuid not null references focus_items(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  thread_role text not null default 'primary'
    check (thread_role in ('primary', 'supporting')),
  created_at timestamptz not null default now(),
  unique(focus_item_id, thread_id)
);

create index if not exists focus_sessions_instance_active_idx
  on focus_sessions(instance_id, status, opened_at desc);

create index if not exists focus_sessions_window_idx
  on focus_sessions(instance_id, actor_id, window_key);

create index if not exists focus_messages_session_created_idx
  on focus_messages(focus_session_id, created_at asc);

create index if not exists focus_items_session_rank_idx
  on focus_items(focus_session_id, status, priority_rank asc, created_at asc);

create index if not exists focus_items_anchor_status_idx
  on focus_items(focus_session_id, anchor_status);

create index if not exists focus_item_threads_thread_idx
  on focus_item_threads(thread_id);

drop trigger if exists focus_sessions_set_updated_at on focus_sessions;
create trigger focus_sessions_set_updated_at
  before update on focus_sessions
  for each row execute function set_updated_at();

drop trigger if exists focus_messages_set_updated_at on focus_messages;
create trigger focus_messages_set_updated_at
  before update on focus_messages
  for each row execute function set_updated_at();

drop trigger if exists focus_items_set_updated_at on focus_items;
create trigger focus_items_set_updated_at
  before update on focus_items
  for each row execute function set_updated_at();

alter table focus_sessions enable row level security;
alter table focus_messages enable row level security;
alter table focus_items enable row level security;
alter table focus_item_threads enable row level security;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the migration contract test and verify it passes**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/focus-foundation.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Add Focus types**

In `apps/platform/src/lib/types.ts`, add these type exports near the other domain enums:

```ts
export type FocusSessionMode =
  | "weekly"
  | "morning"
  | "midday"
  | "end_of_day"
  | "friday_reflection"
  | "ad_hoc";
export type FocusSessionStatus = "active" | "closed";
export type FocusMessageRole = "user" | "workos" | "system";
export type FocusMessageKind = "briefing" | "reply" | "status" | "repair_prompt";
export type FocusItemType =
  | "priority"
  | "next_move"
  | "planning_question"
  | "radar";
export type FocusItemStatus =
  | "proposed"
  | "accepted"
  | "deferred"
  | "dismissed"
  | "completed";
export type FocusItemAnchorStatus = "anchored" | "needs_thread" | "dismissed";
export type FocusThreadRole = "primary" | "supporting";
```

Add these interfaces after `WorkOSEvent`:

```ts
export interface FocusSession {
  id: string;
  instance_id: string;
  actor_id: string | null;
  mode: FocusSessionMode;
  window_key: string;
  status: FocusSessionStatus;
  title: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FocusMessage {
  id: string;
  instance_id: string;
  focus_session_id: string;
  actor_id: string | null;
  role: FocusMessageRole;
  message_kind: FocusMessageKind;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FocusItem {
  id: string;
  instance_id: string;
  focus_session_id: string;
  created_by_message_id: string | null;
  title: string;
  body: string | null;
  item_type: FocusItemType;
  status: FocusItemStatus;
  anchor_status: FocusItemAnchorStatus;
  priority_rank: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deferred_until: string | null;
}

export interface FocusItemThread {
  id: string;
  focus_item_id: string;
  thread_id: string;
  thread_role: FocusThreadRole;
  created_at: string;
}
```

Extend `WorkOSEventType` with:

```ts
  | "focus.session_started"
  | "focus.message_created"
  | "focus.item_created"
  | "focus.item_updated"
  | "focus.item_thread_attached";
```

- [ ] **Step 6: Add Focus cache helper**

In `apps/platform/src/lib/cache.ts`, add a tag:

```ts
  focusHome: (instanceId: string, actorId: string) =>
    `focus-home:${instanceId}:${actorId}`,
```

Add a revalidation helper near the other helpers:

```ts
export function revalidateFocusHome(instanceId: string, actorId: string) {
  revalidateTag(cacheTags.focusHome(instanceId, actorId), IMMEDIATE);
}
```

- [ ] **Step 7: Run typecheck**

Run:

```bash
cd apps/platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit schema and types**

Run:

```bash
git add apps/platform/supabase/migrations/0033_focus_foundation.sql apps/platform/supabase/migrations/focus-foundation.test.ts apps/platform/src/lib/types.ts apps/platform/src/lib/cache.ts
git commit -m "feat(focus): add foundation schema"
```

---

### Task 2: Planning Windows And Continuity Rules

**Files:**
- Create: `apps/platform/src/lib/focus-windows.ts`
- Create: `apps/platform/src/lib/focus-windows.test.ts`
- Create: `apps/platform/src/lib/focus-continuity.ts`
- Create: `apps/platform/src/lib/focus-continuity.test.ts`

- [ ] **Step 1: Write the failing planning-window tests**

Create `apps/platform/src/lib/focus-windows.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  classifyFocusWindow,
  focusWindowTitle,
  localDateKey,
} from "./focus-windows.ts";

assert.equal(
  localDateKey(new Date("2026-07-06T13:00:00.000Z"), "America/New_York"),
  "2026-07-06"
);

const mondayMorning = classifyFocusWindow(
  new Date("2026-07-06T13:00:00.000Z"),
  "America/New_York"
);
assert.equal(mondayMorning.mode, "weekly");
assert.equal(mondayMorning.windowKey, "weekly:2026-07-06");
assert.equal(focusWindowTitle(mondayMorning), "Weekly Focus");

const tuesdayMorning = classifyFocusWindow(
  new Date("2026-07-07T13:30:00.000Z"),
  "America/New_York"
);
assert.equal(tuesdayMorning.mode, "morning");
assert.equal(tuesdayMorning.windowKey, "morning:2026-07-07");

const midday = classifyFocusWindow(
  new Date("2026-07-07T17:15:00.000Z"),
  "America/New_York"
);
assert.equal(midday.mode, "midday");
assert.equal(midday.windowKey, "midday:2026-07-07");

const endOfDay = classifyFocusWindow(
  new Date("2026-07-07T21:45:00.000Z"),
  "America/New_York"
);
assert.equal(endOfDay.mode, "end_of_day");
assert.equal(endOfDay.windowKey, "end_of_day:2026-07-07");

const friday = classifyFocusWindow(
  new Date("2026-07-10T19:00:00.000Z"),
  "America/New_York"
);
assert.equal(friday.mode, "friday_reflection");
assert.equal(friday.windowKey, "friday_reflection:2026-07-10");
```

- [ ] **Step 2: Run the planning-window tests and verify they fail**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-windows.test.ts
```

Expected: FAIL because `focus-windows.ts` does not exist.

- [ ] **Step 3: Implement planning-window helpers**

Create `apps/platform/src/lib/focus-windows.ts`:

```ts
import type { FocusSessionMode } from "./types";

export interface FocusWindow {
  mode: FocusSessionMode;
  windowKey: string;
  localDate: string;
  localHour: number;
  localWeekday: number;
  timeZone: string;
}

interface LocalParts {
  date: string;
  hour: number;
  weekday: number;
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const weekdayName = value("weekday");
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    date: `${year}-${month}-${day}`,
    hour: Number(value("hour")),
    weekday: weekdayMap[weekdayName] ?? 0,
  };
}

export function localDateKey(date: Date, timeZone: string): string {
  return localParts(date, timeZone).date;
}

export function classifyFocusWindow(
  date: Date,
  timeZone = "America/New_York"
): FocusWindow {
  const parts = localParts(date, timeZone);
  let mode: FocusSessionMode;

  if (parts.weekday === 1 && parts.hour < 12) {
    mode = "weekly";
  } else if (parts.weekday === 5 && parts.hour >= 14) {
    mode = "friday_reflection";
  } else if (parts.hour < 12) {
    mode = "morning";
  } else if (parts.hour < 16) {
    mode = "midday";
  } else {
    mode = "end_of_day";
  }

  return {
    mode,
    windowKey: `${mode}:${parts.date}`,
    localDate: parts.date,
    localHour: parts.hour,
    localWeekday: parts.weekday,
    timeZone,
  };
}

export function focusWindowTitle(window: Pick<FocusWindow, "mode">): string {
  const titles: Record<FocusSessionMode, string> = {
    weekly: "Weekly Focus",
    morning: "Morning Focus",
    midday: "Midday Repair",
    end_of_day: "End of Day",
    friday_reflection: "Friday Reflection",
    ad_hoc: "Focus",
  };

  return titles[window.mode];
}
```

- [ ] **Step 4: Run planning-window tests and verify they pass**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-windows.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Write failing continuity tests**

Create `apps/platform/src/lib/focus-continuity.test.ts`:

```ts
import assert from "node:assert/strict";
import { decideFocusBriefingTurn } from "./focus-continuity.ts";

const currentWindow = {
  mode: "morning" as const,
  windowKey: "morning:2026-07-07",
  localDate: "2026-07-07",
  localHour: 9,
  localWeekday: 2,
  timeZone: "America/New_York",
};

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "morning:2026-07-07",
      mode: "morning",
      lastMessageAt: "2026-07-07T13:00:00.000Z",
    },
    triggers: {},
  }).action,
  "resume"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: null,
    triggers: {},
  }).reason,
  "no_active_session"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "midday:2026-07-07",
      mode: "midday",
      lastMessageAt: "2026-07-07T17:00:00.000Z",
    },
    triggers: {},
  }).reason,
  "planning_window_changed"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "morning:2026-07-07",
      mode: "morning",
      lastMessageAt: "2026-07-07T13:00:00.000Z",
    },
    triggers: { userRequestedReplan: true },
  }).reason,
  "user_requested_replan"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "morning:2026-07-07",
      mode: "morning",
      lastMessageAt: "2026-07-07T13:00:00.000Z",
    },
    triggers: { materialCalendarChange: true },
  }).reason,
  "material_calendar_change"
);
```

- [ ] **Step 6: Run continuity tests and verify they fail**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-continuity.test.ts
```

Expected: FAIL because `focus-continuity.ts` does not exist.

- [ ] **Step 7: Implement continuity helper**

Create `apps/platform/src/lib/focus-continuity.ts`:

```ts
import type { FocusSessionMode } from "./types";
import type { FocusWindow } from "./focus-windows";

export interface ActiveFocusSessionSummary {
  id: string;
  windowKey: string;
  mode: FocusSessionMode;
  lastMessageAt: string | null;
}

export interface FocusContinuityTriggers {
  userRequestedReplan?: boolean;
  materialCalendarChange?: boolean;
  focusBlockChanged?: boolean;
  criticalItemChanged?: boolean;
  criticalThreadChanged?: boolean;
  sourceContextChanged?: boolean;
  meaningfulAbsence?: boolean;
}

export type FocusBriefingAction = "resume" | "add_briefing";

export type FocusBriefingReason =
  | "current_session_valid"
  | "no_active_session"
  | "planning_window_changed"
  | "user_requested_replan"
  | "material_calendar_change"
  | "focus_block_changed"
  | "critical_item_changed"
  | "critical_thread_changed"
  | "source_context_changed"
  | "meaningful_absence";

export interface FocusBriefingDecision {
  action: FocusBriefingAction;
  reason: FocusBriefingReason;
}

export function decideFocusBriefingTurn({
  currentWindow,
  activeSession,
  triggers,
}: {
  currentWindow: Pick<FocusWindow, "windowKey">;
  activeSession: ActiveFocusSessionSummary | null;
  triggers: FocusContinuityTriggers;
}): FocusBriefingDecision {
  if (triggers.userRequestedReplan) {
    return { action: "add_briefing", reason: "user_requested_replan" };
  }
  if (!activeSession) {
    return { action: "add_briefing", reason: "no_active_session" };
  }
  if (activeSession.windowKey !== currentWindow.windowKey) {
    return { action: "add_briefing", reason: "planning_window_changed" };
  }
  if (triggers.materialCalendarChange) {
    return { action: "add_briefing", reason: "material_calendar_change" };
  }
  if (triggers.focusBlockChanged) {
    return { action: "add_briefing", reason: "focus_block_changed" };
  }
  if (triggers.criticalItemChanged) {
    return { action: "add_briefing", reason: "critical_item_changed" };
  }
  if (triggers.criticalThreadChanged) {
    return { action: "add_briefing", reason: "critical_thread_changed" };
  }
  if (triggers.sourceContextChanged) {
    return { action: "add_briefing", reason: "source_context_changed" };
  }
  if (triggers.meaningfulAbsence) {
    return { action: "add_briefing", reason: "meaningful_absence" };
  }

  return { action: "resume", reason: "current_session_valid" };
}
```

- [ ] **Step 8: Run continuity tests and verify they pass**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-continuity.test.ts
```

Expected: PASS with no output.

- [ ] **Step 9: Commit pure Focus rules**

Run:

```bash
git add apps/platform/src/lib/focus-windows.ts apps/platform/src/lib/focus-windows.test.ts apps/platform/src/lib/focus-continuity.ts apps/platform/src/lib/focus-continuity.test.ts
git commit -m "feat(focus): add briefing continuity rules"
```

---

### Task 3: Deterministic Briefing Draft

**Files:**
- Create: `apps/platform/src/lib/focus-briefing-draft.ts`
- Create: `apps/platform/src/lib/focus-briefing-draft.test.ts`

- [ ] **Step 1: Write the failing briefing draft tests**

Create `apps/platform/src/lib/focus-briefing-draft.test.ts`:

```ts
import assert from "node:assert/strict";
import { buildFocusBriefingDraft } from "./focus-briefing-draft.ts";

const draft = buildFocusBriefingDraft({
  window: {
    mode: "weekly",
    windowKey: "weekly:2026-07-06",
    localDate: "2026-07-06",
    localHour: 9,
    localWeekday: 1,
    timeZone: "America/New_York",
  },
  actorName: "Will",
  candidateThreads: [
    {
      id: "thread-workos",
      title: "WorkOS Focus V1",
      updated_at: "2026-07-05T20:00:00.000Z",
    },
    {
      id: "thread-saglo",
      title: "Saglo engagement",
      updated_at: "2026-07-04T20:00:00.000Z",
    },
  ],
});

assert.match(draft.body, /Happy Monday/);
assert.match(draft.body, /WorkOS Focus V1/);
assert.match(draft.body, /Saglo engagement/);
assert.equal(draft.items.length, 2);
assert.deepEqual(draft.items.map((item) => item.threadIds), [
  ["thread-workos"],
  ["thread-saglo"],
]);
assert.equal(draft.items[0].anchorStatus, "anchored");

const lowContext = buildFocusBriefingDraft({
  window: {
    mode: "morning",
    windowKey: "morning:2026-07-07",
    localDate: "2026-07-07",
    localHour: 9,
    localWeekday: 2,
    timeZone: "America/New_York",
  },
  actorName: "Will",
  candidateThreads: [],
});

assert.match(lowContext.body, /I do not have enough active threads/);
assert.equal(lowContext.items.length, 1);
assert.equal(lowContext.items[0].anchorStatus, "needs_thread");
assert.deepEqual(lowContext.items[0].threadIds, []);
```

- [ ] **Step 2: Run the briefing draft tests and verify they fail**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-briefing-draft.test.ts
```

Expected: FAIL because `focus-briefing-draft.ts` does not exist.

- [ ] **Step 3: Implement deterministic briefing draft**

Create `apps/platform/src/lib/focus-briefing-draft.ts`:

```ts
import type { FocusItemAnchorStatus, FocusItemType } from "./types";
import type { FocusWindow } from "./focus-windows";

export interface FocusCandidateThread {
  id: string;
  title: string;
  updated_at: string;
}

export interface FocusDraftItem {
  title: string;
  body: string;
  itemType: FocusItemType;
  anchorStatus: FocusItemAnchorStatus;
  threadIds: string[];
}

export interface FocusBriefingDraft {
  body: string;
  items: FocusDraftItem[];
}

function greetingFor(window: Pick<FocusWindow, "mode">): string {
  if (window.mode === "weekly") return "Happy Monday. Ready for another big week?";
  if (window.mode === "midday") return "Let's repair the day.";
  if (window.mode === "end_of_day") return "Let's close the day cleanly.";
  if (window.mode === "friday_reflection") return "Friday check-in. Let's land the week.";
  return "Good morning. Let's pick the next useful move.";
}

export function buildFocusBriefingDraft({
  window,
  actorName,
  candidateThreads,
}: {
  window: FocusWindow;
  actorName: string;
  candidateThreads: FocusCandidateThread[];
}): FocusBriefingDraft {
  const topThreads = [...candidateThreads]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 3);

  if (topThreads.length === 0) {
    return {
      body: `${greetingFor(window)}\n\n${actorName}, I do not have enough active threads to draft a grounded Focus plan yet. Want me to create a starter thread for the most important thing you are trying to move forward?`,
      items: [
        {
          title: "Create a starter Focus thread",
          body: "Focus needs a thread anchor before it can turn this into a real next move.",
          itemType: "planning_question",
          anchorStatus: "needs_thread",
          threadIds: [],
        },
      ],
    };
  }

  const lines = topThreads.map((thread, index) => `${index + 1}. ${thread.title}`);
  return {
    body: `${greetingFor(window)}\n\nHere are the thread-backed priorities I can see right now:\n\n${lines.join("\n")}\n\nWould you rerank these at all? If there is one must-win for this planning window, what should it be?`,
    items: topThreads.map((thread) => ({
      title: thread.title,
      body: "Focus thinks this thread deserves attention in the current planning window.",
      itemType: "priority",
      anchorStatus: "anchored",
      threadIds: [thread.id],
    })),
  };
}
```

- [ ] **Step 4: Run briefing draft tests and verify they pass**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-briefing-draft.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit briefing draft helper**

Run:

```bash
git add apps/platform/src/lib/focus-briefing-draft.ts apps/platform/src/lib/focus-briefing-draft.test.ts
git commit -m "feat(focus): add deterministic briefing draft"
```

---

### Task 4: Focus Data Access And Actions

**Files:**
- Create: `apps/platform/src/lib/focus.ts`
- Create: `apps/platform/src/lib/focus-data-access.test.ts`
- Create: `apps/platform/src/lib/actions/focus.ts`

- [ ] **Step 1: Write the failing data/action contract test**

Create `apps/platform/src/lib/focus-data-access.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const focus = readFileSync("src/lib/focus.ts", "utf8");
const actions = readFileSync("src/lib/actions/focus.ts", "utf8");

assert.match(focus, /export async function getFocusHomeData/);
assert.match(focus, /ensureFocusSession/);
assert.match(focus, /decideFocusBriefingTurn/);
assert.match(focus, /buildFocusBriefingDraft/);
assert.match(focus, /onConflict: "instance_id,actor_id,window_key"/);
assert.doesNotMatch(focus, /unstable_cache/);
assert.match(focus, /focus_item_threads/);
assert.match(focus, /thread:nodes\(id,title,type\)/);

assert.match(actions, /export async function createFocusReply/);
assert.match(actions, /insertFocusMessage/);
assert.match(actions, /role: "user"/);
assert.match(actions, /role: "workos"/);
assert.match(actions, /revalidatePath\("\/focus"\)/);
```

- [ ] **Step 2: Run the data/action contract test and verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-data-access.test.ts
```

Expected: FAIL because `focus.ts` and `actions/focus.ts` do not exist.

- [ ] **Step 3: Create Focus data access helper**

Create `apps/platform/src/lib/focus.ts`:

```ts
import { classifyFocusWindow, focusWindowTitle } from "./focus-windows";
import { buildFocusBriefingDraft } from "./focus-briefing-draft";
import { decideFocusBriefingTurn } from "./focus-continuity";
import { supabase } from "./supabase";
import type {
  FocusItem,
  FocusItemAnchorStatus,
  FocusItemThread,
  FocusMessage,
  FocusSession,
  WorkNode,
} from "./types";

export interface FocusItemWithThreads extends FocusItem {
  threads: Array<{
    id: string;
    title: string;
    type: WorkNode["type"];
    thread_role: FocusItemThread["thread_role"];
  }>;
}

export interface FocusHomeData {
  session: FocusSession;
  messages: FocusMessage[];
  items: FocusItemWithThreads[];
}

interface FocusItemThreadRow {
  id: string;
  focus_item_id: string;
  thread_id: string;
  thread_role: FocusItemThread["thread_role"];
  thread: Pick<WorkNode, "id" | "title" | "type"> | Pick<WorkNode, "id" | "title" | "type">[] | null;
}

async function getCandidateThreads(instanceId: string): Promise<Pick<WorkNode, "id" | "title" | "updated_at">[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id,title,updated_at")
    .eq("instance_id", instanceId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []) as Pick<WorkNode, "id" | "title" | "updated_at">[];
}

async function getLatestActiveFocusSession(
  instanceId: string,
  actorId: string
): Promise<FocusSession | null> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("*")
    .eq("instance_id", instanceId)
    .eq("actor_id", actorId)
    .eq("status", "active")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as FocusSession | null;
}

async function ensureFocusSession({
  instanceId,
  actorId,
  actorName,
}: {
  instanceId: string;
  actorId: string;
  actorName: string;
}): Promise<FocusSession> {
  const window = classifyFocusWindow(new Date());
  const activeSession = await getLatestActiveFocusSession(instanceId, actorId);
  const decision = decideFocusBriefingTurn({
    currentWindow: window,
    activeSession: activeSession
      ? {
          id: activeSession.id,
          windowKey: activeSession.window_key,
          mode: activeSession.mode,
          lastMessageAt: activeSession.updated_at,
        }
      : null,
    triggers: {},
  });

  if (decision.action === "resume" && activeSession) {
    return activeSession;
  }

  const { data: session, error: sessionError } = await supabase
    .from("focus_sessions")
    .upsert(
      {
        instance_id: instanceId,
        actor_id: actorId,
        mode: window.mode,
        window_key: window.windowKey,
        title: focusWindowTitle(window),
        metadata: { generated_reason: decision.reason, time_zone: window.timeZone },
      },
      { onConflict: "instance_id,actor_id,window_key" }
    )
    .select("*")
    .single();
  if (sessionError) throw sessionError;

  const candidateThreads = await getCandidateThreads(instanceId);
  const existingMessages = await getFocusMessages(session.id);
  if (existingMessages.some((message) => message.message_kind === "briefing")) {
    return session as FocusSession;
  }

  const draft = buildFocusBriefingDraft({
    window,
    actorName,
    candidateThreads,
  });
  const briefing = await insertFocusMessage({
    instanceId,
    sessionId: session.id,
    actorId: null,
    role: "workos",
    messageKind: "briefing",
    body: draft.body,
    metadata: { generated_reason: decision.reason },
  });

  for (const [index, item] of draft.items.entries()) {
    await insertFocusItem({
      instanceId,
      sessionId: session.id,
      messageId: briefing.id,
      title: item.title,
      body: item.body,
      itemType: item.itemType,
      anchorStatus: item.anchorStatus,
      priorityRank: index + 1,
      threadIds: item.threadIds,
    });
  }

  return session as FocusSession;
}

export async function getFocusMessages(sessionId: string): Promise<FocusMessage[]> {
  const { data, error } = await supabase
    .from("focus_messages")
    .select("*")
    .eq("focus_session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FocusMessage[];
}

export async function getFocusItems(sessionId: string): Promise<FocusItemWithThreads[]> {
  const { data: items, error } = await supabase
    .from("focus_items")
    .select("*")
    .eq("focus_session_id", sessionId)
    .order("priority_rank", { ascending: true });
  if (error) throw error;

  const itemRows = (items ?? []) as FocusItem[];
  if (itemRows.length === 0) return [];

  const { data: anchors, error: anchorError } = await supabase
    .from("focus_item_threads")
    .select("id,focus_item_id,thread_id,thread_role,thread:nodes(id,title,type)")
    .in(
      "focus_item_id",
      itemRows.map((item) => item.id)
    );
  if (anchorError) throw anchorError;

  const anchorsByItem = new Map<string, FocusItemWithThreads["threads"]>();
  for (const anchor of (anchors ?? []) as unknown as FocusItemThreadRow[]) {
    const thread = Array.isArray(anchor.thread) ? anchor.thread[0] : anchor.thread;
    if (!thread) continue;
    const threads = anchorsByItem.get(anchor.focus_item_id) ?? [];
    threads.push({
      id: thread.id,
      title: thread.title,
      type: thread.type,
      thread_role: anchor.thread_role,
    });
    anchorsByItem.set(anchor.focus_item_id, threads);
  }

  return itemRows.map((item) => ({
    ...item,
    threads: anchorsByItem.get(item.id) ?? [],
  }));
}

export async function getFocusHomeData({
  instanceId,
  actorId,
  actorName,
}: {
  instanceId: string;
  actorId: string;
  actorName: string;
}): Promise<FocusHomeData> {
  const session = await ensureFocusSession({ instanceId, actorId, actorName });
  const [messages, items] = await Promise.all([
    getFocusMessages(session.id),
    getFocusItems(session.id),
  ]);
  return { session, messages, items };
}

export async function insertFocusMessage({
  instanceId,
  sessionId,
  actorId,
  role,
  messageKind,
  body,
  metadata = {},
}: {
  instanceId: string;
  sessionId: string;
  actorId: string | null;
  role: FocusMessage["role"];
  messageKind: FocusMessage["message_kind"];
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<FocusMessage> {
  const { data, error } = await supabase
    .from("focus_messages")
    .insert({
      instance_id: instanceId,
      focus_session_id: sessionId,
      actor_id: actorId,
      role,
      message_kind: messageKind,
      body: body.trim(),
      metadata,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as FocusMessage;
}

export async function insertFocusItem({
  instanceId,
  sessionId,
  messageId,
  title,
  body,
  itemType,
  anchorStatus,
  priorityRank,
  threadIds,
}: {
  instanceId: string;
  sessionId: string;
  messageId: string | null;
  title: string;
  body: string;
  itemType: FocusItem["item_type"];
  anchorStatus: FocusItemAnchorStatus;
  priorityRank: number;
  threadIds: string[];
}): Promise<FocusItem> {
  const { data, error } = await supabase
    .from("focus_items")
    .insert({
      instance_id: instanceId,
      focus_session_id: sessionId,
      created_by_message_id: messageId,
      title,
      body,
      item_type: itemType,
      anchor_status: anchorStatus,
      priority_rank: priorityRank,
    })
    .select("*")
    .single();
  if (error) throw error;

  if (threadIds.length > 0) {
    const { error: anchorError } = await supabase.from("focus_item_threads").insert(
      threadIds.map((threadId) => ({
        focus_item_id: data.id,
        thread_id: threadId,
        thread_role: "primary",
      }))
    );
    if (anchorError) throw anchorError;
  }

  return data as FocusItem;
}
```

- [ ] **Step 4: Create Focus server actions**

Create `apps/platform/src/lib/actions/focus.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateFocusHome } from "../cache";
import { insertFocusMessage } from "../focus";

export async function createFocusReply(
  focusSessionId: string,
  body: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const actor = await getCurrentActor();
  await insertFocusMessage({
    instanceId: actor.instance_id,
    sessionId: focusSessionId,
    actorId: actor.id,
    role: "user",
    messageKind: "reply",
    body: trimmed,
  });

  await insertFocusMessage({
    instanceId: actor.instance_id,
    sessionId: focusSessionId,
    actorId: null,
    role: "workos",
    messageKind: "status",
    body: "Got it. I saved that correction for this Focus plan. The next slice will teach me to revise the plan from your reply.",
    metadata: { deterministic_foundation_reply: true },
  });

  revalidateFocusHome(actor.instance_id, actor.id);
  revalidatePath("/focus");
}
```

- [ ] **Step 5: Run the data/action contract test and verify it passes**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/focus-data-access.test.ts
```

Expected: PASS with no output.

- [ ] **Step 6: Run typecheck**

Run:

```bash
cd apps/platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit data access and actions**

Run:

```bash
git add apps/platform/src/lib/focus.ts apps/platform/src/lib/focus-data-access.test.ts apps/platform/src/lib/actions/focus.ts
git commit -m "feat(focus): add focus home data access"
```

---

### Task 5: Focus Route And UI

**Files:**
- Create: `apps/platform/src/app/focus/page.tsx`
- Create: `apps/platform/src/components/focus/focus-surface.tsx`
- Create: `apps/platform/src/components/focus/focus-message.tsx`
- Create: `apps/platform/src/components/focus/focus-item-card.tsx`
- Create: `apps/platform/src/components/focus/focus-composer.tsx`
- Create: `apps/platform/src/components/focus/focus-surface.test.ts`
- Modify: `apps/platform/src/components/sidebar.tsx`
- Modify: `apps/platform/src/app/page.tsx`

- [ ] **Step 1: Write failing UI wiring test**

Create `apps/platform/src/components/focus/focus-surface.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const surface = readFileSync("src/components/focus/focus-surface.tsx", "utf8");
const page = readFileSync("src/app/focus/page.tsx", "utf8");
const sidebar = readFileSync("src/components/sidebar.tsx", "utf8");
const home = readFileSync("src/app/page.tsx", "utf8");

assert.match(surface, /export function FocusSurface/);
assert.match(surface, /FocusItemCard/);
assert.match(surface, /FocusComposer/);
assert.match(surface, /messages\.map/);
assert.match(page, /getFocusHomeData/);
assert.match(page, /FocusSurface/);
assert.match(sidebar, /href="\/focus"/);
assert.match(sidebar, /label="Focus"/);
assert.match(home, /redirect\("\/focus"\)/);
```

- [ ] **Step 2: Run UI wiring test and verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/focus/focus-surface.test.ts
```

Expected: FAIL because the Focus UI files do not exist.

- [ ] **Step 3: Create Focus page**

Create `apps/platform/src/app/focus/page.tsx`:

```tsx
import { FocusSurface } from "@/components/focus/focus-surface";
import { getCurrentActor } from "@/lib/actor";
import { getFocusHomeData } from "@/lib/focus";

export default async function FocusPage() {
  const actor = await getCurrentActor();
  const data = await getFocusHomeData({
    instanceId: actor.instance_id,
    actorId: actor.id,
    actorName: actor.name,
  });

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary">
      <FocusSurface
        session={data.session}
        messages={data.messages}
        items={data.items}
      />
    </main>
  );
}
```

- [ ] **Step 4: Create Focus message component**

Create `apps/platform/src/components/focus/focus-message.tsx`:

```tsx
import type { FocusMessage as FocusMessageRecord } from "@/lib/types";
import { formatRelativeAge } from "@/lib/time";

interface FocusMessageProps {
  message: FocusMessageRecord;
}

export function FocusMessage({ message }: FocusMessageProps) {
  const isWorkOS = message.role === "workos";
  return (
    <article
      className={[
        "rounded-lg border px-4 py-3 text-sm leading-6",
        isWorkOS
          ? "border-border bg-bg-card text-text-primary"
          : "border-border/70 bg-bg-secondary text-text-secondary",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-text-secondary">
          {isWorkOS ? "WorkOS" : "You"}
        </div>
        <time
          dateTime={message.created_at}
          className="text-[11px] text-text-tertiary"
        >
          {formatRelativeAge(message.created_at)}
        </time>
      </div>
      <div className="whitespace-pre-wrap">{message.body}</div>
    </article>
  );
}
```

- [ ] **Step 5: Create Focus item card component**

Create `apps/platform/src/components/focus/focus-item-card.tsx`:

```tsx
import Link from "next/link";
import { CircleDot, GitBranch, Plus } from "lucide-react";
import type { FocusItemWithThreads } from "@/lib/focus";

interface FocusItemCardProps {
  item: FocusItemWithThreads;
}

export function FocusItemCard({ item }: FocusItemCardProps) {
  const needsThread = item.anchor_status === "needs_thread" || item.threads.length === 0;

  return (
    <div className="rounded-lg border border-border bg-bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <CircleDot size={16} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {item.title}
            </h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-tertiary">
              {item.status}
            </span>
          </div>
          {item.body ? (
            <p className="mt-1 text-sm text-text-secondary">{item.body}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {needsThread ? (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Plus size={13} />
                Create or attach thread
              </button>
            ) : (
              item.threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/n/${thread.id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <GitBranch size={13} />
                  {thread.title}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create Focus composer**

Create `apps/platform/src/components/focus/focus-composer.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";
import { createFocusReply } from "@/lib/actions/focus";

interface FocusComposerProps {
  sessionId: string;
}

export function FocusComposer({ sessionId }: FocusComposerProps) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const disabled = pending || value.trim().length === 0;

  const submit = () => {
    const body = value.trim();
    if (!body) return;
    setValue("");
    startTransition(async () => {
      await createFocusReply(sessionId, body);
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-card p-2">
      <label className="sr-only" htmlFor="focus-reply">
        Reply to Focus
      </label>
      <textarea
        id="focus-reply"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Reply to Focus..."
        rows={3}
        className="block w-full resize-none bg-transparent px-2 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-1 pt-1">
        <span className="text-[11px] text-text-tertiary">
          Cmd+Enter to send
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Send reply"
        >
          <ArrowUp size={15} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create Focus surface**

Create `apps/platform/src/components/focus/focus-surface.tsx`:

```tsx
"use client";

import type { FocusItemWithThreads } from "@/lib/focus";
import type { FocusMessage, FocusSession } from "@/lib/types";
import { FocusComposer } from "./focus-composer";
import { FocusItemCard } from "./focus-item-card";
import { FocusMessage as FocusMessageView } from "./focus-message";

interface FocusSurfaceProps {
  session: FocusSession;
  messages: FocusMessage[];
  items: FocusItemWithThreads[];
}

export function FocusSurface({ session, messages, items }: FocusSurfaceProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 shrink-0">
        <div className="section-label">Home</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
          Focus
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          {session.title} stays continuous until there is a reason for WorkOS to
          chime in again.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pb-4">
        {messages.map((message) => (
          <FocusMessageView key={message.id} message={message} />
        ))}

        {items.length > 0 ? (
          <section className="space-y-2">
            <div className="section-label">Thread-backed next moves</div>
            <div className="space-y-2">
              {items.map((item) => (
                <FocusItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border bg-bg-primary pt-3">
        <FocusComposer sessionId={session.id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add Focus to sidebar**

In `apps/platform/src/components/sidebar.tsx`, add `Crosshair` to the lucide import:

```tsx
  Crosshair,
```

Add this `NavLink` before Feed:

```tsx
        <NavLink
          href="/focus"
          label="Focus"
          icon={<Crosshair size={15} />}
          active={pathname === "/focus"}
          collapsed={effectiveCollapsed}
          onNavigate={onNavigate}
        />
```

- [ ] **Step 9: Make Focus the root home**

Replace `apps/platform/src/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/focus");
}
```

- [ ] **Step 10: Run UI wiring test and verify it passes**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/focus/focus-surface.test.ts
```

Expected: PASS with no output.

- [ ] **Step 11: Run typecheck**

Run:

```bash
cd apps/platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 12: Commit Focus route and UI**

Run:

```bash
git add apps/platform/src/app/focus/page.tsx apps/platform/src/components/focus/focus-surface.tsx apps/platform/src/components/focus/focus-message.tsx apps/platform/src/components/focus/focus-item-card.tsx apps/platform/src/components/focus/focus-composer.tsx apps/platform/src/components/focus/focus-surface.test.ts apps/platform/src/components/sidebar.tsx apps/platform/src/app/page.tsx
git commit -m "feat(focus): add focus home surface"
```

---

### Task 6: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run all Focus foundation unit tests**

Run:

```bash
cd apps/platform && \
npx --yes tsx supabase/migrations/focus-foundation.test.ts && \
npx --yes tsx src/lib/focus-windows.test.ts && \
npx --yes tsx src/lib/focus-continuity.test.ts && \
npx --yes tsx src/lib/focus-briefing-draft.test.ts && \
npx --yes tsx src/lib/focus-data-access.test.ts && \
npx --yes tsx src/components/focus/focus-surface.test.ts
```

Expected: PASS with no output.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd apps/platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run targeted lint**

Run:

```bash
cd apps/platform && npx eslint src/lib/focus-windows.ts src/lib/focus-continuity.ts src/lib/focus-briefing-draft.ts src/lib/focus.ts src/lib/actions/focus.ts src/components/focus/focus-surface.tsx src/components/focus/focus-message.tsx src/components/focus/focus-item-card.tsx src/components/focus/focus-composer.tsx src/app/focus/page.tsx src/components/sidebar.tsx src/app/page.tsx
```

Expected: PASS with no errors.

- [ ] **Step 4: Run the dev server**

Run:

```bash
cd apps/platform && npm run dev
```

Expected: Next dev server starts and reports a local URL, usually `http://localhost:3000`.

- [ ] **Step 5: Manually verify Focus continuity**

Open the app and verify:

1. `/` redirects to `/focus`.
2. Sidebar shows Focus above Feed.
3. Opening `/focus` shows a WorkOS briefing and thread-backed items.
4. Navigating away and back to `/focus` does not create another briefing.
5. Sending a Focus reply appends one user message and one deterministic WorkOS acknowledgement.
6. Items with thread anchors link to `/n/<threadId>`.
7. Low-context state shows a "Create or attach thread" affordance instead of an orphan task.

Expected: all seven checks pass.

- [ ] **Step 6: Commit any verification fixes**

If verification required fixes, run:

```bash
git add apps/platform
git commit -m "fix(focus): stabilize foundation surface"
```

If no fixes were needed, skip this step.

---

## Follow-Up Plans

After this foundation lands, write separate plans for:

1. **Focus AI Briefing Generation:** replace deterministic draft with model-backed planning using account memory, thread context, recent events, and "why" evidence.
2. **Google Calendar Integration:** OAuth, availability reads, WorkOS-owned Focus blocks, and calendar sync state.
3. **Schedule Draft And Commit UX:** schedule preview, chat edits, block creation, and repair prompts.
4. **First-Run Focus Onboarding:** diagnostic interview, import/API/integration handholding, and first useful plan.
