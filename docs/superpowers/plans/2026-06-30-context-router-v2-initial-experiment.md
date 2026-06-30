# Context Router V2 Initial Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable WorkOS context-router V2 experiment: account-level memory, per-thread context sheets, richer build-as-needed routing, budgeted prompt assembly, and real in-flight status labels for inline Claude replies.

**Architecture:** Extend the existing WorkOS platform context stack rather than creating a parallel BrainShare service. Add structured account memory and thread sheets as durable L1 context, expand `context-router` candidates into weighted graph candidates, route family/mentioned/attached/imported/global context through one budgeted assembly path, and feed Claude a compact prompt with a logged manifest.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres migrations, server actions, existing `context-router`, `thread_context_attachments`, `context_chunks`, `agent_runs`, `lucide-react`, Node assert tests run with `npx --yes tsx`.

---

## Scope Check

This plan implements one integrated experiment, not the full BrainShare future. It deliberately excludes embeddings, Graphiti, a separate BrainShare API, cross-user/team permissions, and a polished manifest UI. The first usable milestone is: a blank thread can find relevant financial-planning/imported-script context, reuse persisted thread memory on follow-ups, include only relevant account memory, avoid raw family-thread floods, and show honest in-flight stage text before the provider starts streaming.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/platform/supabase/migrations/0030_context_memory_and_sheets.sql` | Add account memory records, thread context sheets, and inline run stage/manifest columns. |
| `apps/platform/supabase/migrations/context-memory-and-sheets.test.ts` | Migration contract test for the new durable memory schema. |
| `apps/platform/src/lib/types.ts` | Add typed account memory and thread sheet records; extend `AgentRun` with stage/manifest fields. |
| `apps/platform/src/lib/cache.ts` | Add cache tags and revalidation helpers for account memory and thread context sheets. |
| `apps/platform/src/lib/account-memory.ts` | Read, normalize, render, and select account-level memory records. |
| `apps/platform/src/lib/account-memory.test.ts` | Pure tests for memory kernel selection, sensitivity suppression, Markdown rendering, and latest-turn precedence. |
| `apps/platform/src/lib/actions/account-memory.ts` | Server actions for create/update/retract account memory from Settings. |
| `apps/platform/src/components/account-memory-settings.tsx` | Settings Memory tab UI for account-level long-term memory. |
| `apps/platform/src/app/settings/memory/page.tsx` | Server route for Settings -> Memory. |
| `apps/platform/src/lib/settings-nav.ts` and `.test.ts` | Add the Memory settings tab. |
| `apps/platform/src/lib/thread-context-sheet.ts` | Normalize, render, select, and update per-thread context sheets. |
| `apps/platform/src/lib/thread-context-sheet.test.ts` | Pure tests for active/short/long-term lookup order, supersession, and compact Markdown rendering. |
| `apps/platform/src/lib/actions/thread-context-sheet.ts` | Server helpers to upsert thread sheets after meaningful agent turns. |
| `apps/platform/src/lib/context-router/term-expansion.ts` and `.test.ts` | Deterministic query normalization and expansion for plural/stem/synonym/theme misses. |
| `apps/platform/src/lib/context-router/budget.ts` and `.test.ts` | Layer-aware budget/fidelity decisions and prompt-size warnings. |
| `apps/platform/src/lib/context-router/manifest.ts` and `.test.ts` | Manifest shape, stage labels, and logging payload helpers. |
| `apps/platform/src/lib/context-router/types.ts` | Upgrade V1 candidate/pack types to V2-compatible fields while preserving V1 packs. |
| `apps/platform/src/lib/context-router/candidates.ts` and `.test.ts` | Weighted candidate scoring across account memory, thread sheets, family, mentions, attachments, chunks, and global search. |
| `apps/platform/src/lib/context-router/reranker.ts` and `.test.ts` | Teach reranker about candidate source kind, relation, freshness, and fidelity options. |
| `apps/platform/src/lib/context-router/router.ts` and `.test.ts` | Produce budgeted `ContextPackDecision[]` plus a manifest from rich candidate pools. |
| `apps/platform/src/lib/context-router/discovery.ts` and `.test.ts` | Supabase-backed cheap candidate discovery split from pure scoring. |
| `apps/platform/src/lib/actions/posts.ts` | Wire automatic context discovery, context sheet persistence, manifest logging, and inline stage updates into agent invocation. |
| `apps/platform/src/lib/agents/node-context.ts` and `.test.ts` | Carry selected account memory, thread sheet, and routed family packs into prompt rendering. |
| `apps/platform/src/lib/agents/claude-prompt.ts` and `.test.ts` | Render L0/L1/L2/L3 context compactly; stop raw family rendering by default. |
| `apps/platform/src/lib/agents/runs.ts` and `.test.ts` | Add inline Claude run helpers for current stage labels and final manifest attachment. |
| `apps/platform/src/components/posts-tab-content.tsx` and `.test.ts` | Replace generic local-only thinking indicator with durable current stage labels from active inline runs. |

---

### Task 1: Durable Memory Schema

**Files:**
- Create: `apps/platform/supabase/migrations/0030_context_memory_and_sheets.sql`
- Create: `apps/platform/supabase/migrations/context-memory-and-sheets.test.ts`
- Modify: `apps/platform/src/lib/types.ts`
- Modify: `apps/platform/src/lib/cache.ts`

- [ ] **Step 1: Write the failing migration contract test**

Create `apps/platform/supabase/migrations/context-memory-and-sheets.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/0030_context_memory_and_sheets.sql",
  "utf8"
);

for (const required of [
  "create table if not exists account_memory_records",
  "category text not null",
  "sensitivity_label text not null default 'normal'",
  "status text not null default 'active'",
  "source_refs jsonb not null default '[]'::jsonb",
  "supersedes_memory_id uuid references account_memory_records(id)",
  "create table if not exists thread_context_sheets",
  "thread_id uuid not null references nodes(id) on delete cascade",
  "long_term jsonb not null default '[]'::jsonb",
  "short_term jsonb not null default '[]'::jsonb",
  "active_working jsonb not null default '[]'::jsonb",
  "alter table agent_runs",
  "add column if not exists current_stage text",
  "add column if not exists prompt_manifest jsonb not null default '{}'::jsonb",
]) {
  assert.match(sql, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.match(sql, /check \(category in \('identity', 'role', 'current_project'/);
assert.match(sql, /check \(status in \('active', 'tentative', 'superseded', 'retracted'\)\)/);
assert.match(sql, /create index if not exists account_memory_records_instance_status_idx/);
assert.match(sql, /create unique index if not exists thread_context_sheets_thread_idx/);
assert.match(sql, /alter table account_memory_records enable row level security/);
assert.match(sql, /alter table thread_context_sheets enable row level security/);
```

- [ ] **Step 2: Run the migration contract test and verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/context-memory-and-sheets.test.ts
```

Expected: FAIL with `ENOENT` for `0030_context_memory_and_sheets.sql`.

- [ ] **Step 3: Add the migration**

Create `apps/platform/supabase/migrations/0030_context_memory_and_sheets.sql`:

```sql
create table if not exists account_memory_records (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  category text not null
    check (category in ('identity', 'role', 'current_project', 'standing_goal', 'preference', 'communication_style', 'writing_voice', 'recurring_constraint', 'tool_context', 'relationship', 'correction', 'sensitive_fact', 'work_standard')),
  statement text not null,
  scope text not null default 'account'
    check (scope in ('account', 'workspace', 'project', 'person', 'domain')),
  scope_ref_id uuid,
  status text not null default 'active'
    check (status in ('active', 'tentative', 'superseded', 'retracted')),
  sensitivity_label text not null default 'normal'
    check (sensitivity_label in ('normal', 'private', 'financial', 'medical', 'legal', 'credential_like', 'high_care')),
  conviction numeric(3,2) not null default 1.00
    check (conviction >= 0 and conviction <= 1),
  source_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  supersedes_memory_id uuid references account_memory_records(id) on delete set null,
  superseded_by_memory_id uuid references account_memory_records(id) on delete set null,
  created_by_actor_id uuid references actors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  stale_after timestamptz,
  retracted_at timestamptz,
  check (length(trim(statement)) > 0)
);

create table if not exists thread_context_sheets (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  long_term jsonb not null default '[]'::jsonb,
  short_term jsonb not null default '[]'::jsonb,
  active_working jsonb not null default '[]'::jsonb,
  markdown text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agent_runs
  add column if not exists current_stage text,
  add column if not exists prompt_manifest jsonb not null default '{}'::jsonb;

create index if not exists account_memory_records_instance_status_idx
  on account_memory_records(instance_id, status, updated_at desc);

create index if not exists account_memory_records_category_idx
  on account_memory_records(instance_id, category, status);

create index if not exists account_memory_records_sensitivity_idx
  on account_memory_records(instance_id, sensitivity_label, status);

create unique index if not exists thread_context_sheets_thread_idx
  on thread_context_sheets(thread_id);

create index if not exists thread_context_sheets_instance_updated_idx
  on thread_context_sheets(instance_id, updated_at desc);

create index if not exists agent_runs_inline_stage_idx
  on agent_runs(target_node_id, provider_key, status, updated_at desc)
  where provider_key = 'inline_claude';

drop trigger if exists account_memory_records_set_updated_at on account_memory_records;
create trigger account_memory_records_set_updated_at
  before update on account_memory_records
  for each row execute function set_updated_at();

drop trigger if exists thread_context_sheets_set_updated_at on thread_context_sheets;
create trigger thread_context_sheets_set_updated_at
  before update on thread_context_sheets
  for each row execute function set_updated_at();

alter table account_memory_records enable row level security;
alter table thread_context_sheets enable row level security;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Extend platform types**

In `apps/platform/src/lib/types.ts`, add these types near the existing memory types:

```ts
export type AccountMemoryCategory =
  | "identity"
  | "role"
  | "current_project"
  | "standing_goal"
  | "preference"
  | "communication_style"
  | "writing_voice"
  | "recurring_constraint"
  | "tool_context"
  | "relationship"
  | "correction"
  | "sensitive_fact"
  | "work_standard";

export type AccountMemoryScope =
  | "account"
  | "workspace"
  | "project"
  | "person"
  | "domain";

export type AccountMemoryStatus =
  | "active"
  | "tentative"
  | "superseded"
  | "retracted";

export type AccountMemorySensitivity =
  | "normal"
  | "private"
  | "financial"
  | "medical"
  | "legal"
  | "credential_like"
  | "high_care";

export interface AccountMemoryRecord {
  id: string;
  instance_id: string;
  category: AccountMemoryCategory;
  statement: string;
  scope: AccountMemoryScope;
  scope_ref_id: string | null;
  status: AccountMemoryStatus;
  sensitivity_label: AccountMemorySensitivity;
  conviction: number;
  source_refs: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  supersedes_memory_id: string | null;
  superseded_by_memory_id: string | null;
  created_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
  last_confirmed_at: string | null;
  stale_after: string | null;
  retracted_at: string | null;
}

export interface ThreadContextSheetItem {
  id: string;
  statement: string;
  source_refs: Array<Record<string, unknown>>;
  status?: string;
  updated_at?: string;
}

export interface ThreadContextSheet {
  id: string;
  instance_id: string;
  thread_id: string;
  long_term: ThreadContextSheetItem[];
  short_term: ThreadContextSheetItem[];
  active_working: ThreadContextSheetItem[];
  markdown: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

Also extend `AgentRun` with:

```ts
  current_stage: string | null;
  prompt_manifest: Record<string, unknown>;
```

- [ ] **Step 5: Add cache tags**

In `apps/platform/src/lib/cache.ts`, add tags:

```ts
  accountMemory: (instanceId: string) => `account-memory:${instanceId}`,
  threadContextSheet: (threadId: string) => `thread-context-sheet:${threadId}`,
```

Add helpers:

```ts
export function revalidateAccountMemory(instanceId: string) {
  revalidateTag(cacheTags.accountMemory(instanceId), IMMEDIATE);
}

export function revalidateThreadContextSheet(threadId: string) {
  revalidateTag(cacheTags.threadContextSheet(threadId), IMMEDIATE);
}
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/context-memory-and-sheets.test.ts && npx tsc --noEmit
```

Expected: PASS and TypeScript clean.

Commit:

```bash
git add apps/platform/supabase/migrations/0030_context_memory_and_sheets.sql apps/platform/supabase/migrations/context-memory-and-sheets.test.ts apps/platform/src/lib/types.ts apps/platform/src/lib/cache.ts
git commit -m "feat(context): add durable memory schema"
```

---

### Task 2: Account Memory Library And Settings Tab

**Files:**
- Create: `apps/platform/src/lib/account-memory.ts`
- Create: `apps/platform/src/lib/account-memory.test.ts`
- Create: `apps/platform/src/lib/actions/account-memory.ts`
- Create: `apps/platform/src/components/account-memory-settings.tsx`
- Create: `apps/platform/src/app/settings/memory/page.tsx`
- Modify: `apps/platform/src/lib/settings-nav.ts`
- Modify: `apps/platform/src/lib/settings-nav.test.ts`

- [ ] **Step 1: Write account memory behavior tests**

Create `apps/platform/src/lib/account-memory.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildAccountMemoryKernel,
  renderAccountMemoryMarkdown,
  selectAccountMemoryForPrompt,
} from "./account-memory.ts";
import type { AccountMemoryRecord } from "./types.ts";

function memory(
  id: string,
  category: AccountMemoryRecord["category"],
  statement: string,
  overrides: Partial<AccountMemoryRecord> = {}
): AccountMemoryRecord {
  return {
    id,
    instance_id: "instance-1",
    category,
    statement,
    scope: "account",
    scope_ref_id: null,
    status: "active",
    sensitivity_label: "normal",
    conviction: 1,
    source_refs: [],
    metadata: {},
    supersedes_memory_id: null,
    superseded_by_memory_id: null,
    created_by_actor_id: "will",
    created_at: "2026-06-30T12:00:00.000Z",
    updated_at: "2026-06-30T12:00:00.000Z",
    last_confirmed_at: null,
    stale_after: null,
    retracted_at: null,
    ...overrides,
  };
}

const records = [
  memory("identity", "identity", "Will is building WorkOS."),
  memory("naming", "work_standard", "Use WorkOS as the product name; BrainShare is internal."),
  memory("style", "communication_style", "Lead with the recommendation, then reasoning."),
  memory("finance", "sensitive_fact", "Financial-planning context exists and may be stale.", {
    sensitivity_label: "financial",
  }),
  memory("old", "preference", "Use long reports.", { status: "superseded" }),
];

assert.deepEqual(
  buildAccountMemoryKernel(records).map((item) => item.id),
  ["identity", "naming", "style"]
);

assert.deepEqual(
  selectAccountMemoryForPrompt({
    records,
    resolvedQuery: "Help me with personal finance and tax planning.",
    latestUserText: "Help me with personal finance and tax planning.",
  }).included.map((item) => item.id),
  ["identity", "naming", "style", "finance"]
);

assert.deepEqual(
  selectAccountMemoryForPrompt({
    records,
    resolvedQuery: "Draft a product update.",
    latestUserText: "Actually ignore prior voice preferences for this post.",
  }).included.map((item) => item.id),
  ["identity", "naming"]
);

assert.deepEqual(
  selectAccountMemoryForPrompt({
    records,
    resolvedQuery: "Draft a product update.",
    latestUserText: "Draft a product update.",
  }).suppressed.map((item) => item.id),
  ["finance"]
);

const markdown = renderAccountMemoryMarkdown(records);
assert.match(markdown, /# Account Context/);
assert.match(markdown, /## About Me/);
assert.match(markdown, /Will is building WorkOS/);
assert.match(markdown, /## Things To Handle Carefully/);
assert.match(markdown, /Financial-planning context exists/);
assert.doesNotMatch(markdown, /Use long reports/);
```

- [ ] **Step 2: Run the account memory test and verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/account-memory.test.ts
```

Expected: FAIL because `account-memory.ts` does not exist.

- [ ] **Step 3: Implement pure account memory helpers**

Create `apps/platform/src/lib/account-memory.ts`:

```ts
import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type {
  AccountMemoryRecord,
  AccountMemorySensitivity,
} from "./types";

const KERNEL_CATEGORIES = new Set<AccountMemoryRecord["category"]>([
  "identity",
  "role",
  "communication_style",
  "work_standard",
  "correction",
]);

const HIGH_CARE_LABELS = new Set<AccountMemorySensitivity>([
  "financial",
  "medical",
  "legal",
  "credential_like",
  "high_care",
]);

const SENSITIVE_QUERY_TERMS = new Map<AccountMemorySensitivity, string[]>([
  ["financial", ["finance", "financial", "money", "tax", "budget", "retirement", "runway", "cash", "asset"]],
  ["medical", ["medical", "health", "doctor", "diagnosis", "therapy"]],
  ["legal", ["legal", "lawyer", "contract", "lawsuit", "liability"]],
  ["credential_like", ["password", "token", "credential", "api key", "secret"]],
  ["high_care", ["private", "sensitive", "personal"]],
]);

export interface AccountMemorySelection {
  included: AccountMemoryRecord[];
  omitted: AccountMemoryRecord[];
  suppressed: AccountMemoryRecord[];
}

export function activeAccountMemory(records: AccountMemoryRecord[]): AccountMemoryRecord[] {
  return records.filter((record) => record.status === "active");
}

export function buildAccountMemoryKernel(records: AccountMemoryRecord[]): AccountMemoryRecord[] {
  return activeAccountMemory(records)
    .filter((record) => KERNEL_CATEGORIES.has(record.category))
    .filter((record) => !HIGH_CARE_LABELS.has(record.sensitivity_label))
    .sort(sortMemoryRecords);
}

export function selectAccountMemoryForPrompt(input: {
  records: AccountMemoryRecord[];
  resolvedQuery: string;
  latestUserText: string;
}): AccountMemorySelection {
  const loweredQuery = `${input.resolvedQuery} ${input.latestUserText}`.toLowerCase();
  const userOverridesStyle = /ignore prior voice|ignore prior preference|for this post/i.test(input.latestUserText);
  const included = new Map<string, AccountMemoryRecord>();
  const suppressed: AccountMemoryRecord[] = [];
  const omitted: AccountMemoryRecord[] = [];

  for (const record of buildAccountMemoryKernel(input.records)) {
    if (userOverridesStyle && record.category === "communication_style") {
      omitted.push(record);
      continue;
    }
    included.set(record.id, record);
  }

  for (const record of activeAccountMemory(input.records)) {
    if (included.has(record.id)) continue;
    if (HIGH_CARE_LABELS.has(record.sensitivity_label)) {
      if (isSensitiveMemoryRelevant(record, loweredQuery)) {
        included.set(record.id, record);
      } else {
        suppressed.push(record);
      }
      continue;
    }
    if (memoryTextMatches(record, loweredQuery)) {
      included.set(record.id, record);
    } else {
      omitted.push(record);
    }
  }

  return {
    included: [...included.values()].sort(sortMemoryRecords),
    omitted: omitted.sort(sortMemoryRecords),
    suppressed: suppressed.sort(sortMemoryRecords),
  };
}

export function renderAccountMemoryMarkdown(records: AccountMemoryRecord[]): string {
  const active = activeAccountMemory(records).sort(sortMemoryRecords);
  const sections = [
    ["About Me", active.filter((item) => item.category === "identity" || item.category === "role")],
    ["Current Work", active.filter((item) => item.category === "current_project" || item.category === "standing_goal")],
    ["How I Work With AI", active.filter((item) => item.category === "preference" || item.category === "communication_style" || item.category === "work_standard")],
    ["Writing Voice", active.filter((item) => item.category === "writing_voice")],
    ["Corrections", active.filter((item) => item.category === "correction")],
    ["Things To Handle Carefully", active.filter((item) => HIGH_CARE_LABELS.has(item.sensitivity_label))],
  ];

  const lines = ["# Account Context", ""];
  for (const [heading, items] of sections) {
    if (items.length === 0) continue;
    lines.push(`## ${heading}`);
    for (const item of items) lines.push(`- ${item.statement}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function getAccountMemoryRecords(instanceId: string): Promise<AccountMemoryRecord[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("account_memory_records")
        .select("*")
        .eq("instance_id", instanceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AccountMemoryRecord[];
    },
    ["account-memory", instanceId],
    { tags: [cacheTags.accountMemory(instanceId)] }
  )();
}

function sortMemoryRecords(a: AccountMemoryRecord, b: AccountMemoryRecord): number {
  return b.conviction - a.conviction || Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

function memoryTextMatches(record: AccountMemoryRecord, loweredQuery: string): boolean {
  return record.statement
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .some((token) => loweredQuery.includes(token));
}

function isSensitiveMemoryRelevant(record: AccountMemoryRecord, loweredQuery: string): boolean {
  const terms = SENSITIVE_QUERY_TERMS.get(record.sensitivity_label) ?? [];
  return terms.some((term) => loweredQuery.includes(term)) || memoryTextMatches(record, loweredQuery);
}
```

- [ ] **Step 4: Add Settings tab tests and nav**

Update `apps/platform/src/lib/settings-nav.test.ts` so the labels assertion is:

```ts
assert.deepEqual(
  SETTINGS_SECTIONS.map((section) => section.label),
  ["Agents", "AI Standards", "Sources", "Memory"]
);
assert.equal(isSettingsPathActive("/settings/memory"), true);
```

Update `apps/platform/src/lib/settings-nav.ts`:

```ts
  {
    href: "/settings/memory",
    label: "Memory",
    description: "Long-term account context used across WorkOS threads.",
  },
```

- [ ] **Step 5: Add server actions and Settings page**

Create `apps/platform/src/lib/actions/account-memory.ts` with named exports:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateAccountMemory } from "../cache";
import { supabase } from "../supabase";
import type {
  AccountMemoryCategory,
  AccountMemoryScope,
  AccountMemorySensitivity,
} from "../types";

export async function createAccountMemory(input: {
  category: AccountMemoryCategory;
  statement: string;
  scope?: AccountMemoryScope;
  sensitivityLabel?: AccountMemorySensitivity;
}): Promise<void> {
  const actor = await getCurrentActor();
  const statement = input.statement.trim();
  if (!statement) throw new Error("Memory statement is required");

  const { error } = await supabase.from("account_memory_records").insert({
    instance_id: actor.instance_id,
    category: input.category,
    statement,
    scope: input.scope ?? "account",
    sensitivity_label: input.sensitivityLabel ?? "normal",
    created_by_actor_id: actor.id,
    source_refs: [{ kind: "settings", actor_id: actor.id }],
  });
  if (error) throw error;

  revalidateAccountMemory(actor.instance_id);
  revalidatePath("/settings/memory");
}

export async function updateAccountMemory(input: {
  id: string;
  statement: string;
  category: AccountMemoryCategory;
  sensitivityLabel: AccountMemorySensitivity;
}): Promise<void> {
  const actor = await getCurrentActor();
  const statement = input.statement.trim();
  if (!statement) throw new Error("Memory statement is required");

  const { error } = await supabase
    .from("account_memory_records")
    .update({
      statement,
      category: input.category,
      sensitivity_label: input.sensitivityLabel,
      last_confirmed_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("instance_id", actor.instance_id);
  if (error) throw error;

  revalidateAccountMemory(actor.instance_id);
  revalidatePath("/settings/memory");
}

export async function retractAccountMemory(id: string): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("account_memory_records")
    .update({ status: "retracted", retracted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("instance_id", actor.instance_id);
  if (error) throw error;

  revalidateAccountMemory(actor.instance_id);
  revalidatePath("/settings/memory");
}
```

Create `apps/platform/src/app/settings/memory/page.tsx`:

```tsx
import { getCurrentActor } from "@/lib/actor";
import { getAccountMemoryRecords, renderAccountMemoryMarkdown } from "@/lib/account-memory";
import { AccountMemorySettings } from "@/components/account-memory-settings";

export default async function MemorySettingsPage() {
  const actor = await getCurrentActor();
  const records = await getAccountMemoryRecords(actor.instance_id);

  return (
    <AccountMemorySettings
      records={records}
      markdown={renderAccountMemoryMarkdown(records)}
    />
  );
}
```

Create `apps/platform/src/components/account-memory-settings.tsx` as a client component with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Plus, RotateCcw, Save } from "lucide-react";
import {
  createAccountMemory,
  retractAccountMemory,
  updateAccountMemory,
} from "@/lib/actions/account-memory";
import type {
  AccountMemoryCategory,
  AccountMemoryRecord,
  AccountMemorySensitivity,
} from "@/lib/types";

const categories: AccountMemoryCategory[] = [
  "identity",
  "role",
  "current_project",
  "standing_goal",
  "preference",
  "communication_style",
  "writing_voice",
  "recurring_constraint",
  "tool_context",
  "relationship",
  "correction",
  "sensitive_fact",
  "work_standard",
];

const sensitivities: AccountMemorySensitivity[] = [
  "normal",
  "private",
  "financial",
  "medical",
  "legal",
  "credential_like",
  "high_care",
];

export interface AccountMemorySettingsProps {
  records: AccountMemoryRecord[];
  markdown: string;
}

export function AccountMemorySettings({ records, markdown }: AccountMemorySettingsProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    category: "preference" as AccountMemoryCategory,
    sensitivityLabel: "normal" as AccountMemorySensitivity,
    statement: "",
  });

  const activeRecords = records.filter((record) => record.status === "active");

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Memory</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Durable account context WorkOS can use across threads.
          </p>
        </div>

        <form
          className="grid gap-3 border border-border bg-bg-primary p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const statement = draft.statement.trim();
            if (!statement) return;
            startTransition(async () => {
              await createAccountMemory(draft);
              setDraft({ ...draft, statement: "" });
            });
          }}
        >
          <textarea
            value={draft.statement}
            onChange={(event) => setDraft({ ...draft, statement: event.target.value })}
            rows={3}
            className="min-h-20 resize-y border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            placeholder="Remember that..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as AccountMemoryCategory })
              }
              className="h-8 border border-border bg-bg-secondary px-2 text-xs text-text-primary"
            >
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select
              value={draft.sensitivityLabel}
              onChange={(event) =>
                setDraft({ ...draft, sensitivityLabel: event.target.value as AccountMemorySensitivity })
              }
              className="h-8 border border-border bg-bg-secondary px-2 text-xs text-text-primary"
            >
              {sensitivities.map((sensitivity) => (
                <option key={sensitivity} value={sensitivity}>{sensitivity}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending || !draft.statement.trim()}
              className="inline-flex h-8 items-center gap-1.5 border border-accent bg-accent px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              <Plus size={13} />
              Add
            </button>
          </div>
        </form>

        <div className="divide-y divide-border border border-border">
          {activeRecords.map((record) => (
            <MemoryRow key={record.id} record={record} pending={pending} startTransition={startTransition} />
          ))}
          {activeRecords.length === 0 && (
            <p className="px-3 py-6 text-sm text-text-tertiary">No account memory yet.</p>
          )}
        </div>
      </div>

      <aside>
        <h3 className="text-sm font-semibold text-text-primary">Portable Markdown</h3>
        <textarea
          readOnly
          value={markdown}
          rows={20}
          className="mt-2 w-full resize-y border border-border bg-bg-secondary px-3 py-2 font-mono text-xs text-text-secondary"
        />
      </aside>
    </section>
  );
}

function MemoryRow({
  record,
  pending,
  startTransition,
}: {
  record: AccountMemoryRecord;
  pending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [statement, setStatement] = useState(record.statement);
  const [category, setCategory] = useState(record.category);
  const [sensitivityLabel, setSensitivityLabel] = useState(record.sensitivity_label);

  return (
    <div className="grid gap-2 p-3">
      <textarea
        value={statement}
        onChange={(event) => setStatement(event.target.value)}
        rows={2}
        className="resize-y border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(event) => setCategory(event.target.value as AccountMemoryCategory)} className="h-8 border border-border bg-bg-secondary px-2 text-xs text-text-primary">
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={sensitivityLabel} onChange={(event) => setSensitivityLabel(event.target.value as AccountMemorySensitivity)} className="h-8 border border-border bg-bg-secondary px-2 text-xs text-text-primary">
          {sensitivities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" disabled={pending || !statement.trim()} onClick={() => startTransition(() => updateAccountMemory({ id: record.id, statement, category, sensitivityLabel }))} className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
          <Save size={13} />
          Save
        </button>
        <button type="button" disabled={pending} onClick={() => startTransition(() => retractAccountMemory(record.id))} className="inline-flex h-8 items-center gap-1.5 border border-border px-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
          <RotateCcw size={13} />
          Retract
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/account-memory.test.ts && npx --yes tsx src/lib/settings-nav.test.ts && npx eslint src/lib/account-memory.ts src/lib/actions/account-memory.ts src/components/account-memory-settings.tsx src/app/settings/memory/page.tsx src/lib/settings-nav.ts
```

Expected: PASS and lint clean.

Commit:

```bash
git add apps/platform/src/lib/account-memory.ts apps/platform/src/lib/account-memory.test.ts apps/platform/src/lib/actions/account-memory.ts apps/platform/src/components/account-memory-settings.tsx apps/platform/src/app/settings/memory/page.tsx apps/platform/src/lib/settings-nav.ts apps/platform/src/lib/settings-nav.test.ts
git commit -m "feat(context): add account memory settings"
```

---

### Task 3: Thread Context Sheets

**Files:**
- Create: `apps/platform/src/lib/thread-context-sheet.ts`
- Create: `apps/platform/src/lib/thread-context-sheet.test.ts`
- Create: `apps/platform/src/lib/actions/thread-context-sheet.ts`
- Modify: `apps/platform/src/lib/agents/node-context.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.test.ts`

- [ ] **Step 1: Write sheet behavior tests**

Create `apps/platform/src/lib/thread-context-sheet.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildThreadContextSheetMarkdown,
  mergeThreadContextSheetUpdate,
  selectThreadSheetForPrompt,
} from "./thread-context-sheet.ts";
import type { ThreadContextSheet } from "./types.ts";

const sheet: ThreadContextSheet = {
  id: "sheet-1",
  instance_id: "instance-1",
  thread_id: "thread-1",
  active_working: [{ id: "active", statement: "We are comparing Roth conversion timing.", source_refs: [] }],
  short_term: [{ id: "source", statement: "Imported finance chat was useful last turn.", source_refs: [{ node_id: "finance-chat" }] }],
  long_term: [{ id: "durable", statement: "Balances may be stale; strategy is more durable.", source_refs: [] }],
  markdown: "",
  metadata: {},
  created_at: "2026-06-30T12:00:00.000Z",
  updated_at: "2026-06-30T12:00:00.000Z",
};

assert.deepEqual(
  selectThreadSheetForPrompt(sheet).map((item) => item.id),
  ["active", "source", "durable"]
);

const updated = mergeThreadContextSheetUpdate(sheet, {
  activeWorking: [{ id: "active-2", statement: "Now focusing on charitable giving.", source_refs: [] }],
  shortTerm: [{ id: "source", statement: "Imported finance chat was useful last turn.", source_refs: [{ node_id: "finance-chat" }] }],
  longTerm: [{ id: "durable", statement: "Balances may be stale; strategy is more durable.", source_refs: [] }],
});

assert.deepEqual(updated.active_working.map((item) => item.id), ["active-2"]);
assert.equal(updated.short_term.length, 1);
assert.equal(updated.long_term.length, 1);

const markdown = buildThreadContextSheetMarkdown(updated);
assert.match(markdown, /# Thread Context Sheet/);
assert.match(markdown, /## Active Working Memory/);
assert.match(markdown, /Now focusing on charitable giving/);
assert.match(markdown, /## Thread Long-Term Memory/);
assert.match(markdown, /Balances may be stale/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/thread-context-sheet.test.ts
```

Expected: FAIL because `thread-context-sheet.ts` does not exist.

- [ ] **Step 3: Implement sheet helpers**

Create `apps/platform/src/lib/thread-context-sheet.ts`:

```ts
import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { ThreadContextSheet, ThreadContextSheetItem } from "./types";

export interface ThreadContextSheetUpdate {
  activeWorking?: ThreadContextSheetItem[];
  shortTerm?: ThreadContextSheetItem[];
  longTerm?: ThreadContextSheetItem[];
  metadata?: Record<string, unknown>;
}

export function selectThreadSheetForPrompt(sheet: ThreadContextSheet | null): ThreadContextSheetItem[] {
  if (!sheet) return [];
  return [...sheet.active_working, ...sheet.short_term, ...sheet.long_term].filter(
    (item) => item.status !== "superseded" && item.status !== "retracted"
  );
}

export function mergeThreadContextSheetUpdate(
  sheet: ThreadContextSheet,
  update: ThreadContextSheetUpdate
): ThreadContextSheet {
  const next: ThreadContextSheet = {
    ...sheet,
    active_working: update.activeWorking ?? sheet.active_working,
    short_term: dedupeItems(update.shortTerm ?? sheet.short_term),
    long_term: dedupeItems(update.longTerm ?? sheet.long_term),
    metadata: { ...sheet.metadata, ...(update.metadata ?? {}) },
  };
  return { ...next, markdown: buildThreadContextSheetMarkdown(next) };
}

export function buildThreadContextSheetMarkdown(sheet: Pick<ThreadContextSheet, "active_working" | "short_term" | "long_term">): string {
  const lines = ["# Thread Context Sheet", ""];
  appendSection(lines, "Active Working Memory", sheet.active_working);
  appendSection(lines, "Short-Term Memory", sheet.short_term);
  appendSection(lines, "Thread Long-Term Memory", sheet.long_term);
  return lines.join("\n").trimEnd();
}

export async function getThreadContextSheet(threadId: string): Promise<ThreadContextSheet | null> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("thread_context_sheets")
        .select("*")
        .eq("thread_id", threadId)
        .maybeSingle();
      if (error) throw error;
      return data as ThreadContextSheet | null;
    },
    ["thread-context-sheet", threadId],
    { tags: [cacheTags.threadContextSheet(threadId)] }
  )();
}

function appendSection(lines: string[], heading: string, items: ThreadContextSheetItem[]) {
  if (items.length === 0) return;
  lines.push(`## ${heading}`);
  for (const item of items) lines.push(`- ${item.statement}`);
  lines.push("");
}

function dedupeItems(items: ThreadContextSheetItem[]): ThreadContextSheetItem[] {
  const seen = new Set<string>();
  const out: ThreadContextSheetItem[] = [];
  for (const item of items) {
    const key = item.id || item.statement.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
```

- [ ] **Step 4: Add server upsert helper**

Create `apps/platform/src/lib/actions/thread-context-sheet.ts`:

```ts
"use server";

import { getCurrentActor } from "../actor";
import { revalidateThreadContextSheet } from "../cache";
import {
  buildThreadContextSheetMarkdown,
  type ThreadContextSheetUpdate,
} from "../thread-context-sheet";
import { supabase } from "../supabase";

export async function upsertThreadContextSheet(input: {
  threadId: string;
  update: ThreadContextSheetUpdate;
}): Promise<void> {
  const actor = await getCurrentActor();
  const activeWorking = input.update.activeWorking ?? [];
  const shortTerm = input.update.shortTerm ?? [];
  const longTerm = input.update.longTerm ?? [];
  const markdown = buildThreadContextSheetMarkdown({
    active_working: activeWorking,
    short_term: shortTerm,
    long_term: longTerm,
  });

  const { error } = await supabase.from("thread_context_sheets").upsert(
    {
      instance_id: actor.instance_id,
      thread_id: input.threadId,
      active_working: activeWorking,
      short_term: shortTerm,
      long_term: longTerm,
      markdown,
      metadata: input.update.metadata ?? {},
    },
    { onConflict: "thread_id" }
  );
  if (error) throw error;
  revalidateThreadContextSheet(input.threadId);
}
```

- [ ] **Step 5: Carry sheet through NodeContext and prompt**

In `apps/platform/src/lib/agents/node-context.ts`, import `getThreadContextSheet`, add to `NodeContext`:

```ts
  threadContextSheet: ThreadContextSheet | null;
```

Load it in `gatherNodeContext` alongside `ownPosts`:

```ts
    getThreadContextSheet(nodeId),
```

Return it:

```ts
    threadContextSheet,
```

In `apps/platform/src/lib/agents/claude-prompt.ts`, render before attached contexts:

```ts
  const sheetItems = selectThreadSheetForPrompt(ctx.threadContextSheet);
  if (sheetItems.length > 0) {
    sections.push(
      [
        "# Thread Context Sheet",
        "",
        ...sheetItems.map((item) => `- ${item.statement}`),
      ].join("\n")
    );
  }
```

Update all `NodeContext` test fixtures to include:

```ts
  threadContextSheet: null,
```

Add a prompt assertion:

```ts
const sheetPrompt = renderClaudePrompt(
  {
    ...ctx,
    threadContextSheet: {
      id: "sheet-1",
      instance_id: "instance-1",
      thread_id: "active-card",
      active_working: [{ id: "aw", statement: "The current task is financial planning synthesis.", source_refs: [] }],
      short_term: [],
      long_term: [],
      markdown: "",
      metadata: {},
      created_at: "2026-06-30T12:00:00.000Z",
      updated_at: "2026-06-30T12:00:00.000Z",
    },
  },
  { targetPostId: "target", now: new Date("2026-06-22T16:43:00.000Z") }
);
assert.match(sheetPrompt.userMessage, /# Thread Context Sheet/);
assert.match(sheetPrompt.userMessage, /financial planning synthesis/);
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/thread-context-sheet.test.ts && npx --yes tsx src/lib/agents/claude-prompt.test.ts && npx tsc --noEmit
```

Expected: PASS and TypeScript clean.

Commit:

```bash
git add apps/platform/src/lib/thread-context-sheet.ts apps/platform/src/lib/thread-context-sheet.test.ts apps/platform/src/lib/actions/thread-context-sheet.ts apps/platform/src/lib/agents/node-context.ts apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts
git commit -m "feat(context): add thread context sheets"
```

---

### Task 4: Router V2 Types, Term Expansion, Budget, And Manifest

**Files:**
- Create: `apps/platform/src/lib/context-router/term-expansion.ts`
- Create: `apps/platform/src/lib/context-router/term-expansion.test.ts`
- Create: `apps/platform/src/lib/context-router/budget.ts`
- Create: `apps/platform/src/lib/context-router/budget.test.ts`
- Create: `apps/platform/src/lib/context-router/manifest.ts`
- Create: `apps/platform/src/lib/context-router/manifest.test.ts`
- Modify: `apps/platform/src/lib/context-router/types.ts`
- Modify: `apps/platform/src/lib/context-router/candidates.ts`
- Modify: `apps/platform/src/lib/context-router/candidates.test.ts`

- [ ] **Step 1: Add term expansion tests**

Create `apps/platform/src/lib/context-router/term-expansion.test.ts`:

```ts
import assert from "node:assert/strict";
import { expandContextQueryTerms, expandedTextMatchScore } from "./term-expansion.ts";

const financeTerms = expandContextQueryTerms("Help me with finance planning.");
assert.ok(financeTerms.includes("finance"));
assert.ok(financeTerms.includes("finances"));
assert.ok(financeTerms.includes("financial"));
assert.ok(financeTerms.includes("money"));
assert.ok(financeTerms.includes("tax"));
assert.ok(financeTerms.includes("retirement"));

assert.ok(
  expandedTextMatchScore({
    query: "finance",
    text: "Personal finances, retirement contributions, taxes, and budget.",
  }).score > 0
);

assert.ok(
  expandedTextMatchScore({
    query: "script from three months ago",
    text: "Python program to clean campaign exports and rebuild a dataset.",
  }).matchedTerms.includes("program")
);
```

- [ ] **Step 2: Implement term expansion**

Create `apps/platform/src/lib/context-router/term-expansion.ts`:

```ts
import { normalizeSearchText, tokenizeSearchText } from "../context-search";

const THEMATIC_TERMS: Record<string, string[]> = {
  finance: ["finances", "financial", "money", "budget", "cash", "tax", "taxes", "retirement", "asset", "assets", "runway"],
  finances: ["finance", "financial", "money", "budget", "cash", "tax", "taxes", "retirement", "asset", "assets", "runway"],
  financial: ["finance", "finances", "money", "budget", "cash", "tax", "taxes", "retirement", "asset", "assets", "runway"],
  script: ["program", "code", "automation", "python", "notebook", "analysis", "pipeline"],
  program: ["script", "code", "automation", "python", "notebook", "analysis", "pipeline"],
};

export function expandContextQueryTerms(query: string): string[] {
  const base = tokenizeSearchText(query);
  const terms = new Set<string>();
  for (const token of base) {
    if (token.length < 3) continue;
    for (const variant of tokenVariants(token)) terms.add(variant);
    for (const thematic of THEMATIC_TERMS[token] ?? []) terms.add(thematic);
  }
  return [...terms];
}

export function expandedTextMatchScore(input: {
  query: string;
  text: string;
}): { score: number; matchedTerms: string[] } {
  const terms = expandContextQueryTerms(input.query);
  const normalizedText = normalizeSearchText(input.text);
  const matchedTerms = terms.filter((term) => normalizedText.includes(term));
  return { score: matchedTerms.length, matchedTerms };
}

function tokenVariants(token: string): string[] {
  const variants = new Set([token]);
  if (token.endsWith("s") && token.length > 3) variants.add(token.slice(0, -1));
  if (!token.endsWith("s") && token.length > 2) variants.add(`${token}s`);
  if (token.endsWith("ies") && token.length > 4) variants.add(`${token.slice(0, -3)}y`);
  if (token.endsWith("y") && token.length > 3) variants.add(`${token.slice(0, -1)}ies`);
  if (token.endsWith("ing") && token.length > 5) variants.add(token.slice(0, -3));
  if (token.endsWith("ed") && token.length > 4) variants.add(token.slice(0, -2));
  return [...variants];
}
```

- [ ] **Step 3: Extend router types**

In `apps/platform/src/lib/context-router/types.ts`, keep V1 fields but add V2 fields:

```ts
export type ContextCandidateSourceKind =
  | "active"
  | "mention"
  | "family"
  | "attached"
  | "linked"
  | "imported"
  | "global"
  | "account-memory"
  | "thread-sheet"
  | "chunk";

export type ContextFidelity =
  | "none"
  | "metadata"
  | "compact_pack"
  | "compact_pack_with_snippet"
  | "selected_window"
  | "raw_excerpt";

export interface ContextRouterCandidate {
  id: string;
  title: string;
  sourceApp: SourceApp;
  updatedAt: string | null;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  snippet: string;
  lexicalScore: number;
  sourceKind?: ContextCandidateSourceKind;
  relation?: string;
  path?: string | null;
  previewFacts?: string[];
  freshnessHint?: string | null;
  sensitivityLabel?: string | null;
  estimatedChars?: number;
  priorWeight?: number;
  expandedMatchScore?: number;
}

export interface ContextPromptManifest {
  router_version: "context-router-v2";
  resolved_query: string;
  task_type: string;
  current_stage_label: string;
  context_budget_chars: number;
  estimated_prompt_chars: number;
  included_sources: Array<Record<string, unknown>>;
  omitted_sources: Array<Record<string, unknown>>;
  account_memory: {
    included: string[];
    omitted: string[];
    suppressed: string[];
  };
  thread_context_sheet_bands_used: string[];
  warnings: string[];
  timings_ms: Record<string, number>;
}
```

- [ ] **Step 4: Add budget and manifest tests**

Create `apps/platform/src/lib/context-router/budget.test.ts`:

```ts
import assert from "node:assert/strict";
import { chooseContextFidelity, contextBudgetForTask } from "./budget.ts";

assert.equal(contextBudgetForTask("ordinary").targetChars, 25_000);
assert.equal(contextBudgetForTask("source-heavy").warningChars, 120_000);

assert.equal(
  chooseContextFidelity({ score: 0.91, estimatedChars: 500, sourceSensitive: false }),
  "compact_pack_with_snippet"
);
assert.equal(
  chooseContextFidelity({ score: 0.95, estimatedChars: 20_000, sourceSensitive: false }),
  "compact_pack"
);
assert.equal(
  chooseContextFidelity({ score: 0.95, estimatedChars: 20_000, sourceSensitive: true }),
  "selected_window"
);
```

Create `apps/platform/src/lib/context-router/manifest.test.ts`:

```ts
import assert from "node:assert/strict";
import { createContextPromptManifest, updateManifestStage } from "./manifest.ts";

const manifest = createContextPromptManifest({
  resolvedQuery: "financial planning",
  taskType: "blank-thread context discovery",
  budgetChars: 25_000,
});

assert.equal(manifest.router_version, "context-router-v2");
assert.equal(manifest.current_stage_label, "Understanding the request...");

const updated = updateManifestStage(manifest, "Searching imported chats...");
assert.equal(updated.current_stage_label, "Searching imported chats...");
```

- [ ] **Step 5: Implement budget and manifest helpers**

Create `apps/platform/src/lib/context-router/budget.ts`:

```ts
import type { ContextFidelity } from "./types";

export interface ContextBudget {
  taskType: "ordinary" | "source-heavy";
  targetChars: number;
  warningChars: number;
}

export function contextBudgetForTask(taskType: "ordinary" | "source-heavy"): ContextBudget {
  return taskType === "source-heavy"
    ? { taskType, targetChars: 80_000, warningChars: 120_000 }
    : { taskType, targetChars: 25_000, warningChars: 50_000 };
}

export function chooseContextFidelity(input: {
  score: number;
  estimatedChars: number;
  sourceSensitive: boolean;
}): ContextFidelity {
  if (input.score < 0.5) return "none";
  if (input.score < 0.72) return "metadata";
  if (input.sourceSensitive && input.score >= 0.9) return "selected_window";
  if (input.estimatedChars > 8_000) return "compact_pack";
  return "compact_pack_with_snippet";
}
```

Create `apps/platform/src/lib/context-router/manifest.ts`:

```ts
import type { ContextPromptManifest } from "./types";

export function createContextPromptManifest(input: {
  resolvedQuery: string;
  taskType: string;
  budgetChars: number;
}): ContextPromptManifest {
  return {
    router_version: "context-router-v2",
    resolved_query: input.resolvedQuery,
    task_type: input.taskType,
    current_stage_label: "Understanding the request...",
    context_budget_chars: input.budgetChars,
    estimated_prompt_chars: 0,
    included_sources: [],
    omitted_sources: [],
    account_memory: { included: [], omitted: [], suppressed: [] },
    thread_context_sheet_bands_used: [],
    warnings: [],
    timings_ms: {},
  };
}

export function updateManifestStage(
  manifest: ContextPromptManifest,
  stage: string
): ContextPromptManifest {
  return { ...manifest, current_stage_label: stage };
}
```

- [ ] **Step 6: Update candidate scoring to use expansion and source priors**

In `apps/platform/src/lib/context-router/candidates.ts`, replace the body of `rankCandidateSnippets` with scoring that keeps broad recall:

```ts
export function rankCandidateSnippets(
  query: string,
  candidates: ContextRouterCandidate[],
  limit = 80
): ContextRouterCandidate[] {
  const timestamp = (value: string | null) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return candidates
    .map((candidate) => {
      const expanded = expandedTextMatchScore({
        query,
        text: `${candidate.title}\n${candidate.path ?? ""}\n${candidate.snippet}`,
      });
      return {
        ...candidate,
        expandedMatchScore: expanded.score,
        lexicalScore: Math.max(candidate.lexicalScore, expanded.score),
      };
    })
    .filter(
      (candidate) =>
        candidate.lexicalScore > 0 ||
        (candidate.priorWeight ?? 0) >= 4 ||
        candidate.sourceKind === "account-memory" ||
        candidate.sourceKind === "thread-sheet"
    )
    .sort(
      (a, b) =>
        (b.priorWeight ?? 0) - (a.priorWeight ?? 0) ||
        b.lexicalScore - a.lexicalScore ||
        timestamp(b.updatedAt) - timestamp(a.updatedAt)
    )
    .slice(0, limit);
}
```

Import `expandedTextMatchScore` at the top:

```ts
import { expandedTextMatchScore } from "./term-expansion";
```

Append a finance regression to `apps/platform/src/lib/context-router/candidates.test.ts`:

```ts
const financeRanked = rankCandidateSnippets("finance", [
  {
    id: "finances",
    title: "Personal finances and taxes",
    sourceApp: "claude",
    updatedAt: "2026-06-29T12:00:00.000Z",
    sourcePostId: "p-fin",
    sourceMessageId: "m-fin",
    snippet: "Retirement, taxes, budget, and cash flow.",
    lexicalScore: 0,
  },
]);

assert.deepEqual(financeRanked.map((item) => item.id), ["finances"]);
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/context-router/term-expansion.test.ts && npx --yes tsx src/lib/context-router/budget.test.ts && npx --yes tsx src/lib/context-router/manifest.test.ts && npx --yes tsx src/lib/context-router/candidates.test.ts && npx tsc --noEmit
```

Expected: PASS and TypeScript clean.

Commit:

```bash
git add apps/platform/src/lib/context-router/term-expansion.ts apps/platform/src/lib/context-router/term-expansion.test.ts apps/platform/src/lib/context-router/budget.ts apps/platform/src/lib/context-router/budget.test.ts apps/platform/src/lib/context-router/manifest.ts apps/platform/src/lib/context-router/manifest.test.ts apps/platform/src/lib/context-router/types.ts apps/platform/src/lib/context-router/candidates.ts apps/platform/src/lib/context-router/candidates.test.ts
git commit -m "feat(context): add router v2 scoring primitives"
```

---

### Task 5: Cheap Candidate Discovery And Router V2 Assembly

**Files:**
- Create: `apps/platform/src/lib/context-router/discovery.ts`
- Create: `apps/platform/src/lib/context-router/discovery.test.ts`
- Modify: `apps/platform/src/lib/context-router/reranker.ts`
- Modify: `apps/platform/src/lib/context-router/reranker.test.ts`
- Modify: `apps/platform/src/lib/context-router/router.ts`
- Modify: `apps/platform/src/lib/context-router/router.test.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`

- [ ] **Step 1: Write pure discovery/prior tests**

Create `apps/platform/src/lib/context-router/discovery.test.ts`:

```ts
import assert from "node:assert/strict";
import { prioritizeCheapCandidates } from "./discovery.ts";
import type { ContextRouterCandidate } from "./types.ts";

function candidate(id: string, sourceKind: ContextRouterCandidate["sourceKind"], priorWeight = 0): ContextRouterCandidate {
  return {
    id,
    title: id,
    sourceApp: "workos",
    updatedAt: "2026-06-30T12:00:00.000Z",
    sourcePostId: null,
    sourceMessageId: null,
    snippet: id,
    lexicalScore: 1,
    sourceKind,
    priorWeight,
  };
}

const prioritized = prioritizeCheapCandidates([
  candidate("global", "global", 1),
  candidate("family", "family", 5),
  candidate("attached", "attached", 6),
  candidate("mention", "mention", 8),
  candidate("account", "account-memory", 7),
]);

assert.deepEqual(
  prioritized.map((item) => item.id),
  ["mention", "account", "attached", "family", "global"]
);
```

- [ ] **Step 2: Implement discovery helpers**

Create `apps/platform/src/lib/context-router/discovery.ts`:

```ts
import type { ContextRouterCandidate } from "./types";

export function prioritizeCheapCandidates(
  candidates: ContextRouterCandidate[]
): ContextRouterCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      (b.priorWeight ?? 0) - (a.priorWeight ?? 0) ||
      b.lexicalScore - a.lexicalScore ||
      Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "")
  );
}

export function priorForSourceKind(kind: ContextRouterCandidate["sourceKind"]): number {
  switch (kind) {
    case "mention":
      return 8;
    case "account-memory":
      return 7;
    case "attached":
    case "linked":
      return 6;
    case "family":
      return 5;
    case "thread-sheet":
      return 4;
    case "imported":
    case "chunk":
      return 3;
    case "global":
      return 1;
    default:
      return 0;
  }
}
```

- [ ] **Step 3: Teach reranker richer metadata**

In `apps/platform/src/lib/context-router/reranker.ts`, include these fields in candidate JSON:

```ts
        source_kind: candidate.sourceKind ?? "global",
        relation: candidate.relation ?? null,
        path: candidate.path ?? null,
        freshness_hint: candidate.freshnessHint ?? null,
        sensitivity_label: candidate.sensitivityLabel ?? null,
        estimated_chars: candidate.estimatedChars ?? candidate.snippet.length,
        prior_weight: candidate.priorWeight ?? 0,
```

Update `apps/platform/src/lib/context-router/reranker.test.ts` with:

```ts
assert.match(prompt.user, /source_kind/);
assert.match(prompt.user, /prior_weight/);
```

- [ ] **Step 4: Return manifest from router**

Add to `apps/platform/src/lib/context-router/router.ts`:

```ts
export interface RouteAutomaticContextResult {
  decisions: ContextPackDecision[];
  manifest: ContextPromptManifest;
}

export async function routeAutomaticContextV2(
  input: RouteAutomaticContextInput,
  callers: RouteAutomaticContextCallers = {}
): Promise<RouteAutomaticContextResult> {
  const resolution =
    input.turnResolution ??
    (await (callers.resolveTurn ?? resolveContextTurn)({
      currentText: input.currentText,
      previousUserTexts: input.previousUserTexts,
      recentThreadTexts: input.recentThreadTexts,
      activeThreadTitle: input.activeThreadTitle,
    }));
  const budget = contextBudgetForTask("ordinary");
  let manifest = createContextPromptManifest({
    resolvedQuery: resolution.resolvedQuery,
    taskType: "blank-thread context discovery",
    budgetChars: budget.targetChars,
  });

  if (!resolution.shouldRetrieve || resolution.confidence < MIN_TURN_RESOLUTION_CONFIDENCE) {
    return { decisions: [], manifest };
  }

  manifest = updateManifestStage(manifest, "Ranking candidate context...");
  const rankedCandidates = rankCandidateSnippets(resolution.resolvedQuery, input.candidates);
  const decisions = await (callers.rerankCandidates ?? rerankContextCandidates)({
    resolvedQuery: resolution.resolvedQuery,
    candidates: rankedCandidates,
  });
  const packs = buildContextPacksForDecisions({
    resolvedQuery: resolution.resolvedQuery,
    candidates: rankedCandidates,
    decisions,
  });

  return {
    decisions: packs,
    manifest: {
      ...manifest,
      estimated_prompt_chars: packs.reduce((sum, item) => sum + item.pack.snippet.length, 0),
      included_sources: packs.map((item) => ({
        id: item.candidate.id,
        title: item.candidate.title,
        source_kind: item.candidate.sourceKind ?? "global",
        reason: item.inclusionReason,
      })),
      omitted_sources: rankedCandidates
        .filter((candidate) => !packs.some((pack) => pack.candidate.id === candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          source_kind: candidate.sourceKind ?? "global",
          reason: "Not selected by reranker or below confidence threshold.",
        })),
    },
  };
}
```

Keep existing `routeAutomaticContext` as a compatibility wrapper:

```ts
export async function routeAutomaticContext(
  input: RouteAutomaticContextInput,
  callers: RouteAutomaticContextCallers = {}
): Promise<ContextPackDecision[]> {
  return (await routeAutomaticContextV2(input, callers)).decisions;
}
```

- [ ] **Step 5: Update router tests**

In `apps/platform/src/lib/context-router/router.test.ts`, import `routeAutomaticContextV2` and add:

```ts
const routedV2 = await routeAutomaticContextV2(
  {
    currentText: "Help me with finance planning.",
    previousUserTexts: [],
    activeThreadTitle: "Blank",
    candidates: [
      {
        id: "finances",
        title: "Personal finances",
        sourceApp: "claude",
        updatedAt: "2026-06-29T12:00:00.000Z",
        sourcePostId: "p-fin",
        sourceMessageId: "m-fin",
        snippet: "Retirement, taxes, budget, and cash flow.",
        lexicalScore: 0,
        sourceKind: "imported",
        priorWeight: 3,
      },
    ],
  },
  {
    resolveTurn: async () => ({
      originalText: "Help me with finance planning.",
      resolvedQuery: "financial planning taxes budget retirement",
      shouldRetrieve: true,
      confidence: 0.95,
      reason: "Blank-thread discovery.",
    }),
    rerankCandidates: async (input) => [
      {
        candidateId: input.candidates[0].id,
        action: "include",
        confidence: 0.93,
        reason: "Finance planning context.",
        usefulFacts: ["Retirement and taxes were discussed."],
        sourcePostId: null,
        sourceMessageId: null,
      },
    ],
  }
);

assert.equal(routedV2.decisions.length, 1);
assert.equal(routedV2.manifest.router_version, "context-router-v2");
assert.equal(routedV2.manifest.included_sources[0].id, "finances");
```

- [ ] **Step 6: Wire posts action to V2 without changing prompt rendering yet**

In `apps/platform/src/lib/actions/posts.ts`, replace `routeAutomaticContext` import with `routeAutomaticContextV2`. In `attachAutomaticContextForPost`, change:

```ts
  const decisions = await routeAutomaticContext({
```

to:

```ts
  const routed = await routeAutomaticContextV2({
```

Then use:

```ts
  const decisions = routed.decisions;
  console.log("[context-router] manifest", routed.manifest);
```

Keep `attachThreadContext` persistence unchanged in this task.

- [ ] **Step 7: Verify and commit**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/context-router/discovery.test.ts && npx --yes tsx src/lib/context-router/reranker.test.ts && npx --yes tsx src/lib/context-router/router.test.ts && npx tsc --noEmit
```

Expected: PASS and TypeScript clean.

Commit:

```bash
git add apps/platform/src/lib/context-router/discovery.ts apps/platform/src/lib/context-router/discovery.test.ts apps/platform/src/lib/context-router/reranker.ts apps/platform/src/lib/context-router/reranker.test.ts apps/platform/src/lib/context-router/router.ts apps/platform/src/lib/context-router/router.test.ts apps/platform/src/lib/actions/posts.ts
git commit -m "feat(context): route automatic context with v2 manifest"
```

---

### Task 6: Prompt Assembly Stops Raw Family Floods

**Files:**
- Modify: `apps/platform/src/lib/agents/node-context.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.test.ts`

- [ ] **Step 1: Write prompt regression for raw family omission**

Append to `apps/platform/src/lib/agents/claude-prompt.test.ts`:

```ts
const familyBudgetPrompt = renderClaudePrompt(
  {
    ...ctx,
    parentThread: {
      node: { id: "parent-stack", title: "Big parent", type: "stack" },
      posts: [
        post(
          "parent-raw",
          "This giant raw parent payload should be omitted unless L3 is justified.",
          "2026-05-19T02:13:30.000Z"
        ),
      ],
      contextPack: {
        router_version: "context-router-v1",
        resolved_query: "context router v2",
        relevance_confidence: 0.8,
        reason: "Family thread was scanned and summarized.",
        useful_facts: ["Parent stack contains related architecture notes."],
        snippet: "Related architecture notes.",
      },
    },
    siblingThreads: [
      {
        node: { id: "sibling-card", title: "Sibling", type: "card" },
        posts: [
          post(
            "sibling-raw",
            "This giant raw sibling payload should be omitted.",
            "2026-05-19T02:13:45.000Z"
          ),
        ],
      },
    ],
  },
  { targetPostId: "target", now: new Date("2026-06-22T16:43:00.000Z") }
);

assert.match(familyBudgetPrompt.userMessage, /Family thread was scanned and summarized/);
assert.match(familyBudgetPrompt.userMessage, /Parent stack contains related architecture notes/);
assert.doesNotMatch(familyBudgetPrompt.userMessage, /giant raw parent payload/);
assert.doesNotMatch(familyBudgetPrompt.userMessage, /giant raw sibling payload/);
```

- [ ] **Step 2: Make `renderRelativeSection` compact-by-default for family threads**

In `apps/platform/src/lib/agents/claude-prompt.ts`, change `renderRelativeSection` to accept an options object:

```ts
function renderRelativeSection(
  heading: string,
  thread: RelativeThread,
  now: Date,
  options: { allowRawPosts: boolean } = { allowRawPosts: false }
): string | null {
  if (thread.contextPack) {
    const pack = thread.contextPack;
    return [
      heading,
      "",
      `Relevance: ${Math.round(pack.relevance_confidence * 100)}%`,
      `Why included: ${pack.reason}`,
      pack.useful_facts.length > 0
        ? `Useful facts:\n${pack.useful_facts.map((fact) => `- ${fact}`).join("\n")}`
        : null,
      pack.snippet ? `Source snippet:\n${pack.snippet}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trimEnd();
  }

  if (!options.allowRawPosts) return null;

  const lines: string[] = [heading, ``];
  lines.push(
    ...renderChronologicalPosts({
      posts: thread.posts,
      now,
      includeGapMarkers: true,
    })
  );
  return lines.join("\n").trimEnd();
}
```

Update call sites:

```ts
if (ctx.parentThread) {
  const rendered = renderRelativeSection(
    `# Stack thread (parent: "${ctx.parentThread.node.title}")`,
    ctx.parentThread,
    now
  );
  if (rendered) sections.push(rendered);
}
```

Use the same concrete pattern for sibling and child threads:

```ts
for (const s of ctx.siblingThreads) {
  const rendered = renderRelativeSection(`# Sibling card: "${s.node.title}"`, s, now);
  if (rendered) sections.push(rendered);
}

for (const c of ctx.childThreads) {
  const rendered = renderRelativeSection(`# Child card: "${c.node.title}"`, c, now);
  if (rendered) sections.push(rendered);
}
```

For explicitly attached contexts, preserve raw fallback only when there is no pack:

```ts
for (const attached of ctx.attachedContexts) {
  const rendered = renderRelativeSection(
    `# Attached context: "${attached.node.title}"`,
    attached,
    now,
    { allowRawPosts: true }
  );
  if (rendered) sections.push(rendered);
}
```

- [ ] **Step 3: Keep mentioned nodes privileged but capped**

Leave `renderMentionedNodeSection` raw recent posts in place for this experiment because explicit `#` mentions are user-authored. Add this assertion to the test to lock that behavior:

```ts
assert.match(prompt.userMessage, /Use the short-form pricing table/);
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/claude-prompt.test.ts && npx tsc --noEmit
```

Expected: PASS and TypeScript clean.

Commit:

```bash
git add apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts
git commit -m "feat(context): compact family context by default"
```

---

### Task 7: Durable In-Flight Stage Labels For Inline Claude

**Files:**
- Modify: `apps/platform/src/lib/agents/runs.ts`
- Modify: `apps/platform/src/lib/agents/runs.test.ts`
- Modify: `apps/platform/src/lib/agents/router.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Modify: `apps/platform/src/components/posts-tab-content.tsx`
- Modify: `apps/platform/src/components/posts-tab-content.test.ts`

- [ ] **Step 1: Add run helper tests**

Append to `apps/platform/src/lib/agents/runs.test.ts`:

```ts
import {
  buildInlineAgentRunInsert,
  isInlineRunActive,
} from "./runs.ts";

const inlineInsert = buildInlineAgentRunInsert({
  instanceId: "instance-1",
  workspaceId: "workspace-1",
  targetNodeId: "node-1",
  triggerPostId: "post-1",
  requesterActorId: "will",
  agentActorId: "claude",
  currentStage: "Understanding the request...",
});

assert.equal(inlineInsert.provider_key, "inline_claude");
assert.equal(inlineInsert.status, "running");
assert.equal(inlineInsert.current_stage, "Understanding the request...");
assert.equal(isInlineRunActive({ provider_key: "inline_claude", status: "running" }), true);
assert.equal(isInlineRunActive({ provider_key: "inline_claude", status: "completed" }), false);
```

- [ ] **Step 2: Implement inline run helpers**

In `apps/platform/src/lib/agents/runs.ts`, add:

```ts
export interface CreateInlineAgentRunInput {
  instanceId: string;
  workspaceId: string;
  targetNodeId: string;
  triggerPostId: string;
  requesterActorId: string;
  agentActorId: string;
  currentStage: string;
  metadata?: Record<string, unknown>;
}

export function buildInlineAgentRunInsert(input: CreateInlineAgentRunInput) {
  return {
    instance_id: input.instanceId,
    workspace_id: input.workspaceId,
    target_node_id: input.targetNodeId,
    trigger_post_id: input.triggerPostId,
    requester_actor_id: input.requesterActorId,
    agent_actor_id: input.agentActorId,
    provider_key: "inline_claude" as const,
    status: "running" as const,
    plan_body: "",
    current_stage: input.currentStage,
    metadata: input.metadata ?? {},
  };
}

export function isInlineRunActive(run: Pick<AgentRun, "provider_key" | "status">): boolean {
  return run.provider_key === "inline_claude" && (run.status === "running" || run.status === "planning");
}

export async function createInlineAgentRun(input: CreateInlineAgentRunInput): Promise<AgentRun> {
  const { revalidatePath, revalidateAgentRuns, supabase } = await loadAgentRunRuntime();
  const { data, error } = await supabase
    .from("agent_runs")
    .insert(buildInlineAgentRunInsert(input))
    .select("*")
    .single();
  if (error) throw error;
  const run = data as AgentRun;
  await appendAgentRunEvent(run.id, "stage", input.currentStage, {});
  revalidateAgentRuns(input.targetNodeId);
  revalidatePath(`/n/${input.workspaceId}`);
  return run;
}

export async function updateInlineAgentRunStage(runId: string, stage: string): Promise<void> {
  const { supabase, revalidateAgentRuns } = await loadAgentRunRuntime();
  const { data, error } = await supabase
    .from("agent_runs")
    .update({ current_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .select("target_node_id")
    .single();
  if (error) throw error;
  await appendAgentRunEvent(runId, "stage", stage, {});
  revalidateAgentRuns(data.target_node_id as string);
}

export async function completeInlineAgentRun(input: {
  runId: string;
  manifest: Record<string, unknown>;
  summary?: string | null;
}): Promise<void> {
  const { supabase, revalidateAgentRuns } = await loadAgentRunRuntime();
  const { data, error } = await supabase
    .from("agent_runs")
    .update({
      status: "completed",
      current_stage: "Writing the reply...",
      prompt_manifest: input.manifest,
      summary: input.summary ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .select("target_node_id")
    .single();
  if (error) throw error;
  await appendAgentRunEvent(input.runId, "completed", "Inline reply completed.", input.manifest);
  revalidateAgentRuns(data.target_node_id as string);
}
```

- [ ] **Step 3: Pass run id through inline Claude scheduling**

In `apps/platform/src/lib/agents/router.ts`, import `createInlineAgentRun`. In the inline chat route, create a run before rendering prompt:

```ts
const run = await createInlineAgentRun({
  instanceId: input.actor.instance_id,
  workspaceId: input.workspaceId,
  targetNodeId: input.nodeId,
  triggerPostId: input.targetPost.id,
  requesterActorId: input.actor.id,
  agentActorId: route.mention.id,
  currentStage: "Understanding the request...",
});
```

Change the `scheduleInlineClaude` signature to include `run.id`:

```ts
scheduleInlineClaude: (
  agent: MentionedAgent,
  prompt: ClaudePrompt,
  modelSelection: AgentModelSelection | null,
  runId: string
) => void;
```

Update call:

```ts
input.scheduleInlineClaude(route.mention, prompt, selectedModel, run.id);
```

- [ ] **Step 4: Update stages in posts action**

In `apps/platform/src/lib/actions/posts.ts`, update `streamInlineClaudeReply` input:

```ts
  runId: string;
  promptManifest?: Record<string, unknown>;
```

Before the provider call:

```ts
await updateInlineAgentRunStage(input.runId, "Waiting for Claude...");
```

On first delta:

```ts
await updateInlineAgentRunStage(input.runId, "Writing the reply...");
```

After final flush:

```ts
await completeInlineAgentRun({
  runId: input.runId,
  manifest: input.promptManifest ?? {},
  summary: `${input.agent.name} completed an inline reply.`,
});
```

On catch:

```ts
await updateInlineAgentRunStage(input.runId, "Reply failed.");
```

Import the helpers from `../agents/runs`.

- [ ] **Step 5: Update Posts UI to use durable active run stages**

Add a small read helper in the same task if one does not exist:

```ts
export async function getActiveInlineAgentRuns(nodeId: string): Promise<AgentRun[]> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("target_node_id", nodeId)
    .eq("provider_key", "inline_claude")
    .in("status", ["running", "planning"])
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentRun[];
}
```

Pass those active runs into `PostsTabContent` from the thread surface/page that already loads posts. In `apps/platform/src/components/posts-tab-content.tsx`, replace the hardcoded text in `ClaudeThinkingIndicator` with a `stage` prop:

```tsx
function ClaudeThinkingIndicator({ name, stage }: { name: string; stage: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "C";
  return (
    <div className="px-5 py-3 bg-bg-secondary/40" aria-live="polite" aria-label={stage}>
      <div className="flex items-center gap-2">
        <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-hover text-[10px] font-semibold text-text-secondary ring-2 ring-agent-accent animate-pulse">
          {initial}
        </div>
        <span className="text-xs font-medium text-text-primary">{name}</span>
        <span className="text-[11px] text-text-tertiary">{stage}</span>
      </div>
    </div>
  );
}
```

The stage strings must be real values from `agent_runs.current_stage`, such as:

```ts
"Understanding the request..."
"Checking account memory..."
"Checking this thread's working memory..."
"Searching related WorkOS threads..."
"Searching imported chats..."
"Ranking candidate context..."
"Loading source snippets..."
"Assembling a compact prompt..."
"Waiting for Claude..."
"Writing the reply..."
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/runs.test.ts && npx --yes tsx src/components/posts-tab-content.test.ts && npx tsc --noEmit
```

Expected: PASS and TypeScript clean.

Commit:

```bash
git add apps/platform/src/lib/agents/runs.ts apps/platform/src/lib/agents/runs.test.ts apps/platform/src/lib/agents/router.ts apps/platform/src/lib/actions/posts.ts apps/platform/src/components/posts-tab-content.tsx apps/platform/src/components/posts-tab-content.test.ts
git commit -m "feat(context): show durable inline agent stages"
```

---

### Task 8: Golden Tests And Manual Validation

**Files:**
- Create: `apps/platform/src/lib/context-router/golden.test.ts`
- Modify: any files touched by failed golden assertions.

- [ ] **Step 1: Write pure golden tests**

Create `apps/platform/src/lib/context-router/golden.test.ts`:

```ts
import assert from "node:assert/strict";
import { routeAutomaticContextV2 } from "./router.ts";
import type { ContextRouterCandidate } from "./types.ts";

function candidate(input: Partial<ContextRouterCandidate> & Pick<ContextRouterCandidate, "id" | "title" | "snippet">): ContextRouterCandidate {
  return {
    sourceApp: "claude",
    updatedAt: "2026-06-01T12:00:00.000Z",
    sourcePostId: `${input.id}-post`,
    sourceMessageId: `${input.id}-message`,
    lexicalScore: input.lexicalScore ?? 0,
    sourceKind: input.sourceKind ?? "imported",
    priorWeight: input.priorWeight ?? 3,
    ...input,
  };
}

async function main() {
  const finance = await routeAutomaticContextV2(
    {
      currentText: "Help me think through my financial planning situation.",
      previousUserTexts: [],
      activeThreadTitle: "New thread",
      candidates: [
        candidate({
          id: "personal-finances",
          title: "Personal finances and taxes",
          snippet: "Retirement, tax strategy, housing, cash flow, and stale balances.",
        }),
        candidate({
          id: "vacation",
          title: "Vacation ideas",
          snippet: "Hotels and restaurants.",
        }),
      ],
      turnResolution: {
        originalText: "Help me think through my financial planning situation.",
        resolvedQuery: "financial planning taxes retirement budget cash flow",
        shouldRetrieve: true,
        confidence: 0.95,
        reason: "Blank-thread financial planning request.",
      },
    },
    {
      rerankCandidates: async (input) =>
        input.candidates.map((item) => ({
          candidateId: item.id,
          action: item.id === "personal-finances" ? "include" : "exclude",
          confidence: item.id === "personal-finances" ? 0.94 : 0.9,
          reason: item.id === "personal-finances" ? "Financial planning context." : "Unrelated.",
          usefulFacts: item.id === "personal-finances" ? ["Balances may be stale."] : [],
          sourcePostId: null,
          sourceMessageId: null,
        })),
    }
  );

  assert.deepEqual(finance.decisions.map((item) => item.candidate.id), ["personal-finances"]);
  assert.equal(finance.manifest.included_sources.length, 1);
  assert.equal(finance.manifest.omitted_sources.some((item) => item.id === "vacation"), true);

  const lulu = await routeAutomaticContextV2(
    {
      currentText: "I was working a script about 3 months ago to do ABC. I need a new version that does XYZ.",
      previousUserTexts: [],
      activeThreadTitle: "New thread",
      candidates: [
        candidate({
          id: "campaign-script",
          title: "Campaign export Python program",
          snippet: "Python script to transform ABC export into a clean dataset.",
        }),
      ],
      turnResolution: {
        originalText: "I was working a script about 3 months ago to do ABC. I need a new version that does XYZ.",
        resolvedQuery: "script program code three months ago ABC XYZ Python",
        shouldRetrieve: true,
        confidence: 0.92,
        reason: "Old project revival.",
      },
    },
    {
      rerankCandidates: async (input) => [
        {
          candidateId: input.candidates[0].id,
          action: "include",
          confidence: 0.91,
          reason: "Likely old script context.",
          usefulFacts: ["Only discussion context is available; source file may still be needed."],
          sourcePostId: null,
          sourceMessageId: null,
        },
      ],
    }
  );

  assert.deepEqual(lulu.decisions.map((item) => item.candidate.id), ["campaign-script"]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run golden tests**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/context-router/golden.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused suite**

Run:

```bash
cd apps/platform && \
npx --yes tsx supabase/migrations/context-memory-and-sheets.test.ts && \
npx --yes tsx src/lib/account-memory.test.ts && \
npx --yes tsx src/lib/settings-nav.test.ts && \
npx --yes tsx src/lib/thread-context-sheet.test.ts && \
npx --yes tsx src/lib/context-router/term-expansion.test.ts && \
npx --yes tsx src/lib/context-router/budget.test.ts && \
npx --yes tsx src/lib/context-router/manifest.test.ts && \
npx --yes tsx src/lib/context-router/candidates.test.ts && \
npx --yes tsx src/lib/context-router/discovery.test.ts && \
npx --yes tsx src/lib/context-router/reranker.test.ts && \
npx --yes tsx src/lib/context-router/router.test.ts && \
npx --yes tsx src/lib/context-router/golden.test.ts && \
npx --yes tsx src/lib/agents/claude-prompt.test.ts && \
npx --yes tsx src/lib/agents/runs.test.ts && \
npx --yes tsx src/components/posts-tab-content.test.ts && \
npx tsc --noEmit
```

Expected: all PASS.

- [ ] **Step 4: Manual validation in WorkOS**

Run the dev server:

```bash
cd apps/platform && npm run dev
```

Manual checks:

- Open `http://localhost:3000/settings/memory`; add one normal memory, one communication-style memory, and one financial memory.
- Start a brand-new thread and ask: `Help me think through my financial planning situation.`
- Confirm the visible in-flight status changes before Claude streams.
- Confirm the reply uses relevant imported financial context and does not dump unrelated account memory.
- Start another brand-new thread and ask: `I was working a script about 3 months ago to do ABC. I need to make a new version that instead does XYZ. Help?`
- Confirm the reply finds plausible script/project context, distinguishes conversation context from source files, and asks for the file/repo when needed.
- In a large family-thread card, ask a retry/simple continuation prompt.
- Confirm the prompt log is far below incident-scale raw payloads and family threads are scanned/packed rather than replayed raw.

- [ ] **Step 5: Commit final validation**

Commit:

```bash
git add apps/platform/src/lib/context-router/golden.test.ts
git commit -m "test(context): add router v2 golden coverage"
```

---

## Self-Review Notes

- Spec coverage: Account-level memory, Settings Memory tab, thread context sheets, family/hashtag/attachment privilege, expanded lexical matching, broad cheap discovery, budget/fidelity, manifests, in-flight status, and golden finance/Lulu/latency tests are all mapped to tasks.
- Intentional exclusions: embeddings, Graphiti, team/multi-user permissions, polished manifest UI, and BrainShare service integration are deferred because the approved experiment is WorkOS inline-agent context assembly.
- Debt retirement: Task 6 removes the most dangerous raw family-thread prompt path. Later cleanup should delete old one-turn-only routing helpers once the V2 path owns all automatic context attachment.
- Risk: Task 7 touches agent run plumbing and posts UI. Keep it after prompt/router work so rollback is isolated if stage UI needs a smaller patch.
