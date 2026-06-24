# Import And Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 import-and-continuation flow: Claude/ChatGPT exports become historical WorkOS threads, past context can be found and attached reliably, and board moves to a global optional page.

**Architecture:** Preserve the existing recursive node/post/memory/field substrate. Add source metadata, import sessions, durable thread-context attachments, reliable shared search scoring, imported-chat sidebar surfaces, context timeline events, and a structured context panel. Implement the first retrieval pass with deterministic recency/title/content matching; leave full graph extraction as progressive internal Context work after the product loop is real.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Server Components, Server Actions, Supabase/Postgres migrations, BlockNote, Tailwind CSS v4, existing WorkOS node/post/board helpers.

---

## Scope Check

This spec touches data, import, sidebar, search, thread UI, context assembly, and board. Keep it as one vertical plan because each piece is required for the first usable product loop: import chats, find/attach context, continue work, and keep board available without per-thread tab clutter.

The plan intentionally avoids the removed cluster-review path. Do not restore the deleted `apps/platform/src/components/import/cluster-review-*` files or the old `import-preview` materialization helpers.

## File Structure

Create:

- `apps/platform/supabase/migrations/0028_import_and_continuation.sql` - source/import/session/context-attachment schema.
- `apps/platform/supabase/migrations/import-continuation.test.ts` - migration contract test.
- `apps/platform/src/lib/context-search.ts` - shared search normalization, scoring, sorting.
- `apps/platform/src/lib/context-search.test.ts` - exact title and unordered token scoring tests.
- `apps/platform/src/lib/import-sources.ts` - Claude/ChatGPT export normalization.
- `apps/platform/src/lib/import-sources.test.ts` - parser tests with minimal Claude and ChatGPT fixtures.
- `apps/platform/src/lib/import-materialize.ts` - pure mapping from normalized import to node/post insert payloads.
- `apps/platform/src/lib/import-materialize.test.ts` - materialization unit tests.
- `apps/platform/src/lib/imported-chats.ts` - read helpers for imported chat sidebar rows and source management.
- `apps/platform/src/lib/thread-context.ts` - context attachment models, event metadata, retrieval candidates.
- `apps/platform/src/lib/thread-context.test.ts` - persistence/event/deep-link helper tests.
- `apps/platform/src/lib/actions/import-sources.ts` - server action to materialize import sessions.
- `apps/platform/src/lib/actions/thread-context.ts` - server actions for attach/remove/ignore/allow.
- `apps/platform/src/app/import/page.tsx` - import entry page.
- `apps/platform/src/components/import/import-session-workspace.tsx` - batch upload/inventory/import UI.
- `apps/platform/src/components/thread/context-panel.tsx` - structured thread context panel.
- `apps/platform/src/components/thread/context-event.tsx` - compact timeline context event renderer.
- `apps/platform/src/app/board/page.tsx` - global board page.
- `apps/platform/src/lib/global-board.ts` - global board read helpers.
- `apps/platform/src/lib/global-board.test.ts` - global board helper tests.

Modify:

- `apps/platform/src/lib/types.ts` - source/import/context types and event types.
- `apps/platform/src/lib/posts.ts` - post metadata typing and imported-message display support.
- `apps/platform/src/lib/node-mentions.ts` - use shared reliable search and expose source metadata in mention results.
- `apps/platform/src/lib/app-search.ts` - use shared reliable search.
- `apps/platform/src/components/post-editor.tsx` - render source-logo `#` search results and open context links in a new tab.
- `apps/platform/src/components/post-item.tsx` - imported-message actor display, handoff/context-event rendering, post anchors/deep links.
- `apps/platform/src/lib/post-order.ts` - keep imported transcript and context events chronologically stable.
- `apps/platform/src/lib/nodes.ts` - sidebar data, imported chat reads, mention candidate metadata.
- `apps/platform/src/components/app-shell.tsx` - load new sidebar data.
- `apps/platform/src/components/mobile-app-shell.tsx` - pass new sidebar data.
- `apps/platform/src/components/sidebar.tsx` - top nav Board, Imported Chats section, row menus.
- `apps/platform/src/lib/actions/nodes.ts` - hide/allow/ignore imported chat actions and cache invalidation.
- `apps/platform/src/components/thread/thread-surface.tsx` - remove board tab, add context panel data.
- `apps/platform/src/components/node-detail-tabs.tsx` - move toward Chat + context panel rather than Board/Fields/Memory/Tree peer tabs.
- `apps/platform/src/lib/thread-surface.ts` - include thread context attachments.
- `apps/platform/src/lib/agents/node-context.ts` - include active thread-context attachments in model context.
- `apps/platform/src/lib/agents/claude-prompt.ts` - render attached context with source links and temporal notes.
- `apps/platform/src/lib/cache.ts` - cache tags for imported chats and thread context.
- `apps/platform/src/app/settings/layout.tsx`, `apps/platform/src/lib/settings-nav.ts`, and settings components - add Sources settings entry.

---

### Task 1: Shared Reliable Context Search

**Files:**
- Create: `apps/platform/src/lib/context-search.ts`
- Create: `apps/platform/src/lib/context-search.test.ts`
- Modify: `apps/platform/src/lib/node-mentions.ts`
- Modify: `apps/platform/src/lib/node-mentions.test.ts`
- Modify: `apps/platform/src/lib/app-search.ts`
- Modify: `apps/platform/src/lib/app-search.test.ts`

- [ ] **Step 1: Write the failing shared-search test**

Create `apps/platform/src/lib/context-search.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildContextSearchResults,
  normalizeSearchText,
  tokenizeSearchText,
  type ContextSearchCandidate,
} from "./context-search.ts";

const candidates: ContextSearchCandidate[] = [
  {
    id: "claude-script",
    title: "Campaign Reporting SQL Cleanup",
    path: "Imported Chats / Campaign Reporting SQL Cleanup",
    type: "stack",
    sourceApp: "claude",
    href: "/n/claude-script",
  },
  {
    id: "workos-script",
    title: "SQL Script Followup",
    path: "WorkOS / SQL Script Followup",
    type: "card",
    sourceApp: "workos",
    href: "/n/workos-script",
  },
  {
    id: "unrelated",
    title: "Personal Finance",
    path: "Imported Chats / Personal Finance",
    type: "stack",
    sourceApp: "chatgpt",
    href: "/n/unrelated",
  },
];

assert.equal(normalizeSearchText("Campaign—Reporting   SQL"), "campaign reporting sql");
assert.deepEqual(tokenizeSearchText("sql cleanup campaign"), ["sql", "cleanup", "campaign"]);

assert.deepEqual(
  buildContextSearchResults(candidates, "cleanup campaign", 5).map((item) => item.id),
  ["claude-script"]
);

assert.deepEqual(
  buildContextSearchResults(candidates, "SQL Campaign Reporting Cleanup", 5).map((item) => item.id),
  ["claude-script"]
);

assert.equal(
  buildContextSearchResults(candidates, "campaign cleanup", 1)[0].sourceApp,
  "claude"
);

assert.deepEqual(buildContextSearchResults(candidates, "missing topic", 5), []);
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/context-search.test.ts
```

Expected: FAIL with module-not-found for `./context-search.ts`.

- [ ] **Step 3: Implement the shared search helper**

Create `apps/platform/src/lib/context-search.ts`:

```ts
import type { NodeType } from "./types";

export type ContextSourceApp = "workos" | "claude" | "chatgpt" | "unknown";

export interface ContextSearchCandidate {
  id: string;
  title: string;
  path: string;
  type: NodeType;
  href: string;
  sourceApp?: ContextSourceApp;
  updatedAt?: string | null;
  bodyPreview?: string | null;
}

export interface ContextSearchResult extends ContextSearchCandidate {
  score: number;
  matchedTokens: string[];
}

const PUNCTUATION_RE = /[\u2018\u2019\u201c\u201d"'`.,:;!?()[\]{}<>/@#$%^&*_+=|\\~]/g;
const DASH_RE = /[\u2010-\u2015-]/g;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DASH_RE, " ")
    .replace(PUNCTUATION_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return [...new Set(normalized.split(" ").filter(Boolean))];
}

function includesAllTokens(haystackTokens: Set<string>, queryTokens: string[]): boolean {
  return queryTokens.every((token) => haystackTokens.has(token));
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenizeSearchText(value));
}

function scoreCandidate(candidate: ContextSearchCandidate, query: string): ContextSearchResult | null {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) return null;

  const normalizedTitle = normalizeSearchText(candidate.title);
  const normalizedPath = normalizeSearchText(candidate.path);
  const normalizedPreview = normalizeSearchText(candidate.bodyPreview ?? "");
  const titleTokens = tokenSet(candidate.title);
  const pathTokens = tokenSet(candidate.path);
  const previewTokens = tokenSet(candidate.bodyPreview ?? "");

  const matchedTokens = queryTokens.filter(
    (token) => titleTokens.has(token) || pathTokens.has(token) || previewTokens.has(token)
  );
  if (matchedTokens.length !== queryTokens.length) return null;

  let score = 0;
  if (normalizedTitle === normalizedQuery) score += 1000;
  if (includesAllTokens(titleTokens, queryTokens)) score += 500;
  if (normalizedTitle.includes(normalizedQuery)) score += 250;
  if (includesAllTokens(pathTokens, queryTokens)) score += 90;
  if (normalizedPath.includes(normalizedQuery)) score += 60;
  if (includesAllTokens(previewTokens, queryTokens)) score += 25;
  score += matchedTokens.length * 10;
  score -= Math.max(0, tokenizeSearchText(candidate.title).length - queryTokens.length);

  return { ...candidate, score, matchedTokens };
}

export function buildContextSearchResults(
  candidates: ContextSearchCandidate[],
  query: string,
  limit: number
): ContextSearchResult[] {
  if (limit <= 0) return [];
  return candidates
    .map((candidate) => scoreCandidate(candidate, query))
    .filter((candidate): candidate is ContextSearchResult => candidate !== null)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
```

- [ ] **Step 4: Update node mention search tests**

Append this to `apps/platform/src/lib/node-mentions.test.ts`:

```ts
const mentionRows: NodeMentionSearchRow[] = [
  { id: "script", title: "Campaign Reporting SQL Cleanup", type: "stack", parent_id: null },
  { id: "other-script", title: "SQL Export Draft", type: "stack", parent_id: null },
];

assert.equal(
  buildNodeMentionCandidates(mentionRows, "cleanup campaign", 5)[0].id,
  "script"
);
assert.equal(
  buildNodeMentionCandidates(mentionRows, "SQL Campaign Reporting Cleanup", 5)[0].id,
  "script"
);
```

- [ ] **Step 5: Modify node mention search to use shared scoring**

In `apps/platform/src/lib/node-mentions.ts`, add:

```ts
import { buildContextSearchResults } from "./context-search";
```

Replace `buildNodeMentionCandidates` with:

```ts
export function buildNodeMentionCandidates(
  rows: NodeMentionSearchRow[],
  query: string,
  limit: number
): NodeMentionCandidate[] {
  const pathsById = buildPathMap(rows);
  const candidates = rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    href: `/n/${row.id}`,
    path: pathsById.get(row.id) ?? row.title,
  }));

  if (!query.trim()) return candidates.slice(0, limit);

  return buildContextSearchResults(candidates, query, limit).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    type: candidate.type,
    path: candidate.path,
  }));
}
```

- [ ] **Step 6: Update app search to use shared scoring**

Replace `apps/platform/src/lib/app-search.ts` with:

```ts
import type { NodeType } from "./types";
import type { SidebarTreeNode } from "./sidebar-tree";
import { buildContextSearchResults, type ContextSourceApp } from "./context-search";

export interface AppSearchResult {
  id: string;
  title: string;
  type: NodeType;
  href: string;
  path: string;
  sourceApp?: ContextSourceApp;
}

export function buildAppSearchResults(
  tree: SidebarTreeNode[],
  query: string,
  limit: number
): AppSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed || limit <= 0) return [];

  const candidates: AppSearchResult[] = [];

  function visit(node: SidebarTreeNode, ancestors: string[]) {
    const pathParts = [...ancestors, node.title];
    const path = pathParts.join(" / ");
    candidates.push({
      id: node.id,
      title: node.title,
      type: node.type,
      href: `/n/${node.id}`,
      path,
      sourceApp: node.source_app ?? "workos",
    });
    for (const child of node.children) visit(child, pathParts);
  }

  for (const node of tree) visit(node, []);
  return buildContextSearchResults(candidates, trimmed, limit).map(
    ({ score: _score, matchedTokens: _matchedTokens, ...result }) => result
  );
}
```

- [ ] **Step 7: Run search tests**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/context-search.test.ts && npx --yes tsx src/lib/node-mentions.test.ts && npx --yes tsx src/lib/app-search.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/src/lib/context-search.ts apps/platform/src/lib/context-search.test.ts apps/platform/src/lib/node-mentions.ts apps/platform/src/lib/node-mentions.test.ts apps/platform/src/lib/app-search.ts apps/platform/src/lib/app-search.test.ts
git commit -m "feat(search): improve context lookup reliability"
```

---

### Task 2: Import And Context Schema

**Files:**
- Create: `apps/platform/supabase/migrations/0028_import_and_continuation.sql`
- Create: `apps/platform/supabase/migrations/import-continuation.test.ts`
- Modify: `apps/platform/src/lib/types.ts`
- Modify: `apps/platform/src/lib/cache.ts`
- Modify: `apps/platform/supabase/migrations/0026_rls_security_hardening.sql`

- [ ] **Step 1: Write the migration contract test**

Create `apps/platform/supabase/migrations/import-continuation.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dirname, "0028_import_and_continuation.sql"),
  "utf8"
);

assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+import_sessions/i);
assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+thread_context_attachments/i);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*source_kind/i);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*source_app/i);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*imported_visibility/i);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*suggestion_status/i);
assert.match(sql, /source_app\s+text\s+not\s+null\s+check\s+\(source_app\s+in\s+\('claude',\s*'chatgpt',\s*'unknown'\)\)/i);
assert.match(sql, /status\s+text\s+not\s+null\s+default\s+'active'/i);
assert.match(sql, /unique\s*\(thread_id,\s*context_source_node_id\)/i);
assert.match(sql, /create\s+index\s+if\s+not\s+exists\s+nodes_imported_chats_idx/i);
assert.match(sql, /create\s+index\s+if\s+not\s+exists\s+thread_context_active_idx/i);
assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i);
```

- [ ] **Step 2: Run the failing schema test**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/import-continuation.test.ts
```

Expected: FAIL because `0028_import_and_continuation.sql` does not exist.

- [ ] **Step 3: Add the schema migration**

Create `apps/platform/supabase/migrations/0028_import_and_continuation.sql`:

```sql
create table if not exists import_sessions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  actor_id uuid references actors(id) on delete set null,
  source_apps text[] not null default '{}'::text[],
  import_name text,
  status text not null default 'completed'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  source_counts jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table nodes
  add column if not exists source_kind text
    check (source_kind is null or source_kind in ('native', 'imported_ai_chat')),
  add column if not exists source_app text
    check (source_app is null or source_app in ('workos', 'claude', 'chatgpt', 'unknown')),
  add column if not exists source_import_session_id uuid references import_sessions(id) on delete set null,
  add column if not exists source_conversation_id text,
  add column if not exists source_title text,
  add column if not exists source_hash text,
  add column if not exists source_created_at timestamptz,
  add column if not exists source_updated_at timestamptz,
  add column if not exists imported_visibility text not null default 'visible'
    check (imported_visibility in ('visible', 'hidden_from_imported_chats')),
  add column if not exists suggestion_status text not null default 'allowed'
    check (suggestion_status in ('allowed', 'ignored'));

create table if not exists thread_context_attachments (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  context_source_node_id uuid not null references nodes(id) on delete cascade,
  attached_by text not null
    check (attached_by in ('automatic', 'conversational', 'hashtag', 'side_panel', 'user')),
  status text not null default 'active'
    check (status in ('active', 'removed', 'ignored_for_suggestions')),
  reason text,
  source_post_id uuid references posts(id) on delete set null,
  source_message_id text,
  source_span jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  unique(thread_id, context_source_node_id)
);

create index if not exists import_sessions_instance_created_idx
  on import_sessions(instance_id, created_at desc);

create index if not exists nodes_imported_chats_idx
  on nodes(instance_id, source_app, updated_at desc)
  where source_kind = 'imported_ai_chat' and archived_at is null;

create index if not exists nodes_imported_visibility_idx
  on nodes(instance_id, imported_visibility, updated_at desc)
  where source_kind = 'imported_ai_chat';

create index if not exists nodes_source_conversation_idx
  on nodes(instance_id, source_app, source_conversation_id)
  where source_kind = 'imported_ai_chat';

create index if not exists thread_context_active_idx
  on thread_context_attachments(thread_id, status, created_at desc);

create index if not exists thread_context_source_idx
  on thread_context_attachments(context_source_node_id, status, created_at desc);

drop trigger if exists import_sessions_set_updated_at on import_sessions;
create trigger import_sessions_set_updated_at
  before update on import_sessions
  for each row execute function set_updated_at();

drop trigger if exists thread_context_attachments_set_updated_at on thread_context_attachments;
create trigger thread_context_attachments_set_updated_at
  before update on thread_context_attachments
  for each row execute function set_updated_at();

alter table import_sessions enable row level security;
alter table thread_context_attachments enable row level security;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Update RLS hardening migration for new tables**

In `apps/platform/supabase/migrations/0026_rls_security_hardening.sql`, add these lines next to the other `alter table ... enable row level security` statements:

```sql
alter table import_sessions enable row level security;
alter table thread_context_attachments enable row level security;
```

- [ ] **Step 5: Update TypeScript domain types**

In `apps/platform/src/lib/types.ts`, add:

```ts
export type SourceApp = "workos" | "claude" | "chatgpt" | "unknown";
export type SourceKind = "native" | "imported_ai_chat";
export type ImportedVisibility = "visible" | "hidden_from_imported_chats";
export type SuggestionStatus = "allowed" | "ignored";
export type ContextAttachedBy =
  | "automatic"
  | "conversational"
  | "hashtag"
  | "side_panel"
  | "user";
export type ThreadContextAttachmentStatus =
  | "active"
  | "removed"
  | "ignored_for_suggestions";

export interface ImportSession {
  id: string;
  instance_id: string;
  actor_id: string | null;
  source_apps: SourceApp[];
  import_name: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  source_counts: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ThreadContextAttachment {
  id: string;
  instance_id: string;
  thread_id: string;
  context_source_node_id: string;
  attached_by: ContextAttachedBy;
  status: ThreadContextAttachmentStatus;
  reason: string | null;
  source_post_id: string | null;
  source_message_id: string | null;
  source_span: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
}
```

Extend `WorkNode` with:

```ts
  source_kind: SourceKind | null;
  source_app: SourceApp | null;
  source_import_session_id: string | null;
  source_conversation_id: string | null;
  source_title: string | null;
  source_hash: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  imported_visibility: ImportedVisibility;
  suggestion_status: SuggestionStatus;
```

Extend `WorkOSEventType` with:

```ts
  | "context.attached"
  | "context.removed"
  | "context.ignored"
  | "context.allowed"
```

- [ ] **Step 6: Add cache tags**

In `apps/platform/src/lib/cache.ts`, add:

```ts
  importedChats: (instanceId: string) => `imported-chats:${instanceId}`,
  importSessions: (instanceId: string) => `import-sessions:${instanceId}`,
  threadContext: (threadId: string) => `thread-context:${threadId}`,
```

Add revalidation helpers:

```ts
export function revalidateImportedChats(instanceId: string) {
  revalidateTag(cacheTags.importedChats(instanceId), PROFILE);
}

export function revalidateImportSessions(instanceId: string) {
  revalidateTag(cacheTags.importSessions(instanceId), PROFILE);
}

export function revalidateThreadContext(threadId: string) {
  revalidateTag(cacheTags.threadContext(threadId), IMMEDIATE);
}
```

- [ ] **Step 7: Run schema/type tests**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/import-continuation.test.ts && npx tsc --noEmit
```

Expected: PASS after updating test fixture builders that construct `WorkNode` objects with the new fields.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/supabase/migrations/0028_import_and_continuation.sql apps/platform/supabase/migrations/import-continuation.test.ts apps/platform/supabase/migrations/0026_rls_security_hardening.sql apps/platform/src/lib/types.ts apps/platform/src/lib/cache.ts apps/platform/src/lib/app-search.test.ts apps/platform/src/lib/nodes.test.ts apps/platform/src/lib/recursive-board.test.ts apps/platform/src/lib/sidebar-tree-dnd.test.ts
git commit -m "feat(import): add continuation schema"
```

---

### Task 3: Claude And ChatGPT Export Normalization

**Files:**
- Create: `apps/platform/src/lib/import-sources.ts`
- Create: `apps/platform/src/lib/import-sources.test.ts`

- [ ] **Step 1: Write parser tests**

Create `apps/platform/src/lib/import-sources.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  normalizeImportFiles,
  stableConversationHash,
  type RawImportFile,
} from "./import-sources.ts";

const claudeFile: RawImportFile = {
  fileName: "claude-conversations.json",
  text: JSON.stringify([
    {
      uuid: "claude-1",
      name: "Campaign reporting script",
      created_at: "2026-06-21T10:00:00Z",
      updated_at: "2026-06-21T10:20:00Z",
      chat_messages: [
        {
          uuid: "m1",
          sender: "human",
          text: "Let's clean up the SQL parsing issue.",
          created_at: "2026-06-21T10:00:00Z",
        },
        {
          uuid: "m2",
          sender: "assistant",
          text: "The parser is splitting campaign names too early.",
          created_at: "2026-06-21T10:01:00Z",
        },
      ],
    },
  ]),
};

const chatgptFile: RawImportFile = {
  fileName: "conversations.json",
  text: JSON.stringify([
    {
      id: "chatgpt-1",
      title: "Python export script",
      create_time: 1782021600,
      update_time: 1782025200,
      mapping: {
        root: { id: "root", parent: null, children: ["a"] },
        a: {
          id: "a",
          parent: "root",
          children: ["b"],
          message: {
            id: "a",
            author: { role: "user", name: "Will" },
            create_time: 1782021600,
            content: { content_type: "text", parts: ["Help me process exports."] },
          },
        },
        b: {
          id: "b",
          parent: "a",
          children: [],
          message: {
            id: "b",
            author: { role: "assistant", name: "ChatGPT" },
            create_time: 1782021660,
            content: { content_type: "text", parts: ["Use pandas with explicit date parsing."] },
          },
        },
      },
    },
  ]),
};

const result = normalizeImportFiles([claudeFile, chatgptFile]);
assert.equal(result.conversations.length, 2);
assert.deepEqual(result.inventory, [
  { fileName: "claude-conversations.json", sourceApp: "claude", conversationCount: 1, error: null },
  { fileName: "conversations.json", sourceApp: "chatgpt", conversationCount: 1, error: null },
]);

const claude = result.conversations.find((item) => item.sourceApp === "claude");
assert.equal(claude?.title, "Campaign reporting script");
assert.equal(claude?.messages[0].role, "human");
assert.equal(claude?.messages[1].role, "assistant");

const chatgpt = result.conversations.find((item) => item.sourceApp === "chatgpt");
assert.equal(chatgpt?.title, "Python export script");
assert.deepEqual(chatgpt?.messages.map((message) => message.role), ["human", "assistant"]);

assert.equal(stableConversationHash(claude!), stableConversationHash({ ...claude!, title: "Campaign reporting script" }));
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/import-sources.test.ts
```

Expected: FAIL with module-not-found for `./import-sources.ts`.

- [ ] **Step 3: Implement normalized import types and parsers**

Create `apps/platform/src/lib/import-sources.ts`:

```ts
import { createHash } from "node:crypto";
import type { SourceApp } from "./types";

export interface RawImportFile {
  fileName: string;
  text: string;
}

export type ImportedMessageRole = "human" | "assistant" | "system" | "tool" | "unknown";

export interface NormalizedImportedMessage {
  sourceMessageId: string;
  role: ImportedMessageRole;
  authorName: string | null;
  text: string;
  createdAt: string | null;
  sourceIndex: number;
}

export interface NormalizedImportedConversation {
  sourceApp: Exclude<SourceApp, "workos">;
  sourceConversationId: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  messages: NormalizedImportedMessage[];
}

export interface ImportInventoryItem {
  fileName: string;
  sourceApp: Exclude<SourceApp, "workos">;
  conversationCount: number;
  error: string | null;
}

export interface NormalizedImportBatch {
  inventory: ImportInventoryItem[];
  conversations: NormalizedImportedConversation[];
}

export function normalizeImportFiles(files: RawImportFile[]): NormalizedImportBatch {
  const inventory: ImportInventoryItem[] = [];
  const conversations: NormalizedImportedConversation[] = [];

  for (const file of files) {
    const parsed = parseJson(file.text);
    const sourceApp = detectSourceApp(file.fileName, parsed);
    if (!parsed || !sourceApp) {
      inventory.push({
        fileName: file.fileName,
        sourceApp: "unknown",
        conversationCount: 0,
        error: "File was not recognized as a Claude or ChatGPT conversation export.",
      });
      continue;
    }

    const normalized =
      sourceApp === "claude"
        ? normalizeClaudeConversations(parsed)
        : normalizeChatGPTConversations(parsed);
    inventory.push({
      fileName: file.fileName,
      sourceApp,
      conversationCount: normalized.length,
      error: null,
    });
    conversations.push(...normalized);
  }

  return { inventory, conversations };
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function detectSourceApp(
  fileName: string,
  parsed: unknown
): "claude" | "chatgpt" | null {
  if (!Array.isArray(parsed)) return null;
  const first = parsed[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  if ("chat_messages" in first || fileName.toLowerCase().includes("claude")) return "claude";
  if ("mapping" in first || fileName.toLowerCase().includes("conversations")) return "chatgpt";
  return null;
}

function normalizeClaudeConversations(parsed: unknown): NormalizedImportedConversation[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    const messages = Array.isArray(row.chat_messages) ? row.chat_messages : [];
    return {
      sourceApp: "claude",
      sourceConversationId: stringValue(row.uuid) || `claude:${index}`,
      title: stringValue(row.name) || "Untitled Claude chat",
      createdAt: stringValue(row.created_at),
      updatedAt: stringValue(row.updated_at),
      messages: messages
        .map((message, sourceIndex) => normalizeClaudeMessage(message, sourceIndex))
        .filter((message) => message.text.length > 0),
    };
  });
}

function normalizeClaudeMessage(message: unknown, sourceIndex: number): NormalizedImportedMessage {
  const row = message as Record<string, unknown>;
  const sender = stringValue(row.sender);
  return {
    sourceMessageId: stringValue(row.uuid) || `claude-message:${sourceIndex}`,
    role: sender === "human" ? "human" : sender === "assistant" ? "assistant" : "unknown",
    authorName: sender === "human" ? "Human" : sender === "assistant" ? "Claude" : null,
    text: stringValue(row.text),
    createdAt: stringValue(row.created_at),
    sourceIndex,
  };
}

function normalizeChatGPTConversations(parsed: unknown): NormalizedImportedConversation[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    const messages = flattenChatGPTMessages(row.mapping);
    return {
      sourceApp: "chatgpt",
      sourceConversationId: stringValue(row.id) || `chatgpt:${index}`,
      title: stringValue(row.title) || "Untitled ChatGPT chat",
      createdAt: unixToIso(row.create_time),
      updatedAt: unixToIso(row.update_time),
      messages,
    };
  });
}

function flattenChatGPTMessages(mapping: unknown): NormalizedImportedMessage[] {
  if (!mapping || typeof mapping !== "object") return [];
  const rows = Object.values(mapping as Record<string, Record<string, unknown>>);
  return rows
    .map((row) => row.message as Record<string, unknown> | null)
    .filter((message): message is Record<string, unknown> => !!message)
    .map((message, sourceIndex) => {
      const author = (message.author ?? {}) as Record<string, unknown>;
      const role = stringValue(author.role);
      return {
        sourceMessageId: stringValue(message.id) || `chatgpt-message:${sourceIndex}`,
        role: role === "user" ? "human" : role === "assistant" ? "assistant" : role === "system" ? "system" : "unknown",
        authorName: stringValue(author.name) || (role === "assistant" ? "ChatGPT" : null),
        text: chatGptText(message.content),
        createdAt: unixToIso(message.create_time),
        sourceIndex,
      };
    })
    .filter((message) => message.text.length > 0)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.sourceIndex - b.sourceIndex)
    .map((message, sourceIndex) => ({ ...message, sourceIndex }));
}

function chatGptText(content: unknown): string {
  const row = content as Record<string, unknown> | null;
  const parts = Array.isArray(row?.parts) ? row.parts : [];
  return parts.map((part) => (typeof part === "string" ? part : "")).filter(Boolean).join("\n").trim();
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function stableConversationHash(conversation: NormalizedImportedConversation): string {
  const hash = createHash("sha256");
  hash.update(conversation.sourceApp);
  hash.update("\0");
  hash.update(conversation.sourceConversationId);
  hash.update("\0");
  for (const message of conversation.messages) {
    hash.update(message.sourceMessageId);
    hash.update("\0");
    hash.update(message.role);
    hash.update("\0");
    hash.update(message.text);
    hash.update("\0");
  }
  return hash.digest("hex");
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/import-sources.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/import-sources.ts apps/platform/src/lib/import-sources.test.ts
git commit -m "feat(import): normalize AI conversation exports"
```

---

### Task 4: Import Materialization

**Files:**
- Create: `apps/platform/src/lib/import-materialize.ts`
- Create: `apps/platform/src/lib/import-materialize.test.ts`
- Create: `apps/platform/src/lib/actions/import-sources.ts`
- Modify: `apps/platform/src/lib/posts.ts`

- [ ] **Step 1: Write materialization tests**

Create `apps/platform/src/lib/import-materialize.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildImportMaterializationPlan,
  importedMessageMetadata,
  handoffPostMetadata,
} from "./import-materialize.ts";
import type { NormalizedImportedConversation } from "./import-sources.ts";

const conversation: NormalizedImportedConversation = {
  sourceApp: "claude",
  sourceConversationId: "claude-1",
  title: "Campaign reporting script",
  createdAt: "2026-06-21T10:00:00.000Z",
  updatedAt: "2026-06-21T10:10:00.000Z",
  messages: [
    {
      sourceMessageId: "m1",
      role: "human",
      authorName: "Human",
      text: "Let's fix parsing.",
      createdAt: "2026-06-21T10:00:00.000Z",
      sourceIndex: 0,
    },
    {
      sourceMessageId: "m2",
      role: "assistant",
      authorName: "Claude",
      text: "The delimiter is ambiguous.",
      createdAt: "2026-06-21T10:01:00.000Z",
      sourceIndex: 1,
    },
  ],
};

const plan = buildImportMaterializationPlan({
  instanceId: "instance-1",
  importSessionId: "session-1",
  conversations: [conversation],
  firstPosition: 100,
});

assert.equal(plan.nodes.length, 1);
assert.equal(plan.nodes[0].type, "stack");
assert.equal(plan.nodes[0].source_kind, "imported_ai_chat");
assert.equal(plan.nodes[0].source_app, "claude");
assert.equal(plan.nodes[0].title, "Campaign reporting script");
assert.equal(plan.posts.length, 2);
assert.equal(plan.posts[0].metadata.source_message_id, "m1");
assert.equal(plan.posts[1].metadata.source_role, "assistant");

assert.deepEqual(importedMessageMetadata(conversation, conversation.messages[0]), {
  imported_message: true,
  source_app: "claude",
  source_conversation_id: "claude-1",
  source_message_id: "m1",
  source_role: "human",
  source_author: "Human",
  source_index: 0,
  source_timestamp: "2026-06-21T10:00:00.000Z",
});

assert.equal(handoffPostMetadata("claude").import_handoff, true);
```

- [ ] **Step 2: Run failing materialization test**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/import-materialize.test.ts
```

Expected: FAIL with module-not-found for `./import-materialize.ts`.

- [ ] **Step 3: Implement pure materialization helpers**

Create `apps/platform/src/lib/import-materialize.ts`:

```ts
import type { NormalizedImportedConversation, NormalizedImportedMessage } from "./import-sources";
import { stableConversationHash } from "./import-sources";
import type { SourceApp } from "./types";

export interface ImportNodeInsert {
  instance_id: string;
  parent_id: string | null;
  type: "stack";
  title: string;
  description: string | null;
  position: number;
  source_kind: "imported_ai_chat";
  source_app: "claude" | "chatgpt";
  source_import_session_id: string;
  source_conversation_id: string;
  source_title: string;
  source_hash: string;
  source_created_at: string | null;
  source_updated_at: string | null;
  imported_visibility: "visible";
  suggestion_status: "allowed";
}

export interface ImportPostInsert {
  node_client_key: string;
  actor_id: null;
  post_type: "post";
  body: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

export interface ImportMaterializationPlan {
  nodes: Array<ImportNodeInsert & { client_key: string }>;
  posts: ImportPostInsert[];
}

export function buildImportMaterializationPlan(input: {
  instanceId: string;
  importSessionId: string;
  conversations: NormalizedImportedConversation[];
  firstPosition: number;
}): ImportMaterializationPlan {
  const nodes = input.conversations.map((conversation, index) => ({
    client_key: conversationKey(conversation),
    instance_id: input.instanceId,
    parent_id: null,
    type: "stack" as const,
    title: conversation.title || "Untitled imported chat",
    description: null,
    position: input.firstPosition + index,
    source_kind: "imported_ai_chat" as const,
    source_app: conversation.sourceApp,
    source_import_session_id: input.importSessionId,
    source_conversation_id: conversation.sourceConversationId,
    source_title: conversation.title,
    source_hash: stableConversationHash(conversation),
    source_created_at: conversation.createdAt,
    source_updated_at: conversation.updatedAt,
    imported_visibility: "visible" as const,
    suggestion_status: "allowed" as const,
  }));

  const posts = input.conversations.flatMap((conversation) =>
    conversation.messages.map((message) => ({
      node_client_key: conversationKey(conversation),
      actor_id: null,
      post_type: "post" as const,
      body: message.text,
      metadata: importedMessageMetadata(conversation, message),
      created_at: message.createdAt,
    }))
  );

  return { nodes, posts };
}

export function importedMessageMetadata(
  conversation: NormalizedImportedConversation,
  message: NormalizedImportedMessage
): Record<string, unknown> {
  return {
    imported_message: true,
    source_app: conversation.sourceApp,
    source_conversation_id: conversation.sourceConversationId,
    source_message_id: message.sourceMessageId,
    source_role: message.role,
    source_author: message.authorName,
    source_index: message.sourceIndex,
    source_timestamp: message.createdAt,
  };
}

export function handoffPostMetadata(sourceApp: SourceApp): Record<string, unknown> {
  return {
    import_handoff: true,
    source_app: sourceApp,
  };
}

function conversationKey(conversation: NormalizedImportedConversation): string {
  return `${conversation.sourceApp}:${conversation.sourceConversationId}`;
}
```

- [ ] **Step 4: Widen post metadata type**

In `apps/platform/src/lib/posts.ts`, change:

```ts
metadata: Record<string, string> | null;
```

to:

```ts
metadata: Record<string, unknown> | null;
```

Update activity renderers with safe string conversions:

```ts
function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
```

Use `metadataString(post.metadata.card_title) ?? "Untitled"` and the same pattern for other metadata reads.

- [ ] **Step 5: Add server action to create import sessions**

Create `apps/platform/src/lib/actions/import-sources.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateImportedChats, revalidateImportSessions, revalidateRootNodes } from "../cache";
import { normalizeImportFiles, type RawImportFile } from "../import-sources";
import { buildImportMaterializationPlan } from "../import-materialize";
import { supabase } from "../supabase";

export interface ImportSourcesResult {
  importSessionId: string;
  importedCount: number;
  inventory: ReturnType<typeof normalizeImportFiles>["inventory"];
}

export async function importAISourceFiles(files: RawImportFile[]): Promise<ImportSourcesResult> {
  const actor = await getCurrentActor();
  const normalized = normalizeImportFiles(files);
  const sourceApps = [...new Set(normalized.conversations.map((conversation) => conversation.sourceApp))];

  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .insert({
      instance_id: actor.instance_id,
      actor_id: actor.id,
      source_apps: sourceApps,
      import_name: "AI chat import",
      status: "completed",
      source_counts: Object.fromEntries(
        normalized.inventory.map((item) => [item.sourceApp, item.conversationCount])
      ),
      metadata: { inventory: normalized.inventory },
    })
    .select("id")
    .single();
  if (sessionError) throw sessionError;

  const firstPosition = await nextRootPosition(actor.instance_id);
  const plan = buildImportMaterializationPlan({
    instanceId: actor.instance_id,
    importSessionId: session.id,
    conversations: normalized.conversations,
    firstPosition,
  });

  const nodeIdByClientKey = new Map<string, string>();
  for (const node of plan.nodes) {
    const { client_key, ...insert } = node;
    const { data, error } = await supabase
      .from("nodes")
      .upsert(insert, {
        onConflict: "instance_id,source_app,source_conversation_id",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    nodeIdByClientKey.set(client_key, data.id);
  }

  for (const post of plan.posts) {
    const nodeId = nodeIdByClientKey.get(post.node_client_key);
    if (!nodeId) continue;
    const sourceMessageId = String(post.metadata.source_message_id ?? "");
    const { error } = await supabase.from("posts").upsert(
      {
        node_id: nodeId,
        actor_id: null,
        post_type: "post",
        body: post.body,
        metadata: post.metadata,
        created_at: post.created_at ?? undefined,
      },
      { onConflict: "node_id,metadata->>source_message_id" }
    );
    if (error && sourceMessageId) throw error;
    if (error) throw error;
  }

  revalidateImportedChats(actor.instance_id);
  revalidateImportSessions(actor.instance_id);
  revalidateRootNodes();
  revalidatePath("/", "layout");

  return {
    importSessionId: session.id,
    importedCount: plan.nodes.length,
    inventory: normalized.inventory,
  };
}

async function nextRootPosition(instanceId: string): Promise<number> {
  const { data, error } = await supabase
    .from("nodes")
    .select("position")
    .eq("instance_id", instanceId)
    .is("parent_id", null)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data?.[0]?.position as number | undefined) ?? 0) + 1000;
}
```

- [ ] **Step 6: Add unique post source index**

Add this to `0028_import_and_continuation.sql`:

```sql
create unique index if not exists posts_imported_source_message_idx
  on posts(node_id, ((metadata->>'source_message_id')))
  where metadata ? 'imported_message';
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/import-materialize.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/src/lib/import-materialize.ts apps/platform/src/lib/import-materialize.test.ts apps/platform/src/lib/actions/import-sources.ts apps/platform/src/lib/posts.ts apps/platform/supabase/migrations/0028_import_and_continuation.sql
git commit -m "feat(import): materialize imported chats"
```

---

### Task 5: Batch Import UI

**Files:**
- Create: `apps/platform/src/app/import/page.tsx`
- Create: `apps/platform/src/components/import/import-session-workspace.tsx`
- Modify: `apps/platform/src/components/sidebar.tsx`

- [ ] **Step 1: Create import page**

Create `apps/platform/src/app/import/page.tsx`:

```tsx
import { ImportSessionWorkspace } from "@/components/import/import-session-workspace";

export default function ImportPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Sources</div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
          Import Chats
        </h1>
      </div>
      <ImportSessionWorkspace />
    </div>
  );
}
```

- [ ] **Step 2: Create batch upload client**

Create `apps/platform/src/components/import/import-session-workspace.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { importAISourceFiles } from "@/lib/actions/import-sources";
import { normalizeImportFiles, type RawImportFile } from "@/lib/import-sources";

export function ImportSessionWorkspace() {
  const [files, setFiles] = useState<RawImportFile[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const preview = useMemo(() => normalizeImportFiles(files), [files]);

  async function readFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next: RawImportFile[] = [];
    for (const file of Array.from(fileList)) {
      next.push({ fileName: file.name, text: await file.text() });
    }
    setFiles((current) => [...current, ...next]);
  }

  function runImport() {
    setError(null);
    startTransition(async () => {
      try {
        await importAISourceFiles(files);
        router.push("/");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  const readableCount = preview.inventory.reduce((sum, item) => sum + item.conversationCount, 0);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
      <div className="max-w-2xl">
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-card px-6 py-8 text-center transition-colors hover:bg-bg-hover">
          <Upload size={22} className="text-text-tertiary" />
          <span className="mt-3 text-sm font-medium text-text-primary">
            Add Claude and ChatGPT exports
          </span>
          <span className="mt-1 text-sm text-text-secondary">
            Add one or both now. You can import more whenever you need.
          </span>
          <input
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(event) => readFiles(event.target.files)}
          />
        </label>

        {files.length > 0 && (
          <div className="mt-5 rounded-lg border border-border bg-bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
              Import inventory
            </div>
            <div className="divide-y divide-border">
              {preview.inventory.map((item, index) => (
                <div key={`${item.fileName}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text-primary">{item.fileName}</div>
                    <div className="text-xs text-text-tertiary">
                      {item.error ?? `${item.sourceApp} · ${item.conversationCount} chats`}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${item.fileName}`}
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || readableCount === 0}
            onClick={runImport}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {pending ? "Importing..." : `Import ${readableCount} chats`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add sidebar Import nav link**

In `apps/platform/src/components/sidebar.tsx`, import `Upload` from `lucide-react` and add a nav item in the top section:

```tsx
<NavLink
  href="/import"
  label="Import"
  icon={<Upload size={15} />}
  active={pathname === "/import"}
  collapsed={effectiveCollapsed}
  onNavigate={onNavigate}
/>
```

- [ ] **Step 4: Run lint on import files**

Run:

```bash
cd apps/platform && npx eslint src/app/import/page.tsx src/components/import/import-session-workspace.tsx src/components/sidebar.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/app/import/page.tsx apps/platform/src/components/import/import-session-workspace.tsx apps/platform/src/components/sidebar.tsx
git commit -m "feat(import): add batch import UI"
```

---

### Task 6: Imported Chats Sidebar Section And Actions

**Files:**
- Create or Modify: `apps/platform/src/lib/imported-chats.ts`
- Modify: `apps/platform/src/lib/nodes.ts`
- Modify: `apps/platform/src/components/app-shell.tsx`
- Modify: `apps/platform/src/components/mobile-app-shell.tsx`
- Modify: `apps/platform/src/components/sidebar.tsx`
- Modify: `apps/platform/src/lib/actions/nodes.ts`

- [ ] **Step 1: Add imported chat read helper**

Create `apps/platform/src/lib/imported-chats.ts`:

```ts
import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { SourceApp, WorkNode } from "./types";

export interface ImportedChatRow extends WorkNode {
  source_app: Exclude<SourceApp, "workos">;
}

export async function getImportedChats(instanceId: string): Promise<ImportedChatRow[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("source_kind", "imported_ai_chat")
        .eq("imported_visibility", "visible")
        .is("archived_at", null)
        .order("source_updated_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImportedChatRow[];
    },
    [`imported-chats-${instanceId}`],
    { tags: [cacheTags.importedChats(instanceId)], revalidate: 300 }
  )();
}
```

- [ ] **Step 2: Add sidebar data loader**

In `apps/platform/src/lib/nodes.ts`, add:

```ts
import { getCurrentActor } from "./actor";
import { getImportedChats, type ImportedChatRow } from "./imported-chats";
```

Add:

```ts
export interface SidebarData {
  projectTree: SidebarTreeNode[];
  pinnedNodes: PinnedSidebarNode[];
  importedChats: ImportedChatRow[];
}

export async function getSidebarData(): Promise<SidebarData> {
  const [projectTree, actor] = await Promise.all([getSidebarTree(), getCurrentActor()]);
  const [pinnedNodes, importedChats] = await Promise.all([
    getSidebarPins(projectTree),
    getImportedChats(actor.instance_id),
  ]);
  return { projectTree, pinnedNodes, importedChats };
}
```

- [ ] **Step 3: Pass sidebar data through shell**

In `apps/platform/src/components/app-shell.tsx`, replace the sidebar reads:

```ts
import { getSidebarData } from "@/lib/nodes";
```

and:

```tsx
const sidebarData = await getSidebarData();

return (
  <MobileAppShell sidebarData={sidebarData}>
    {children}
  </MobileAppShell>
);
```

In `apps/platform/src/components/mobile-app-shell.tsx`, change props to:

```ts
import type { SidebarData } from "@/lib/nodes";
```

and:

```tsx
export function MobileAppShell({
  sidebarData,
  children,
}: {
  sidebarData: SidebarData;
  children: ReactNode;
}) {
```

Pass `sidebarData` into both `Sidebar` instances.

- [ ] **Step 4: Add imported chat row actions**

In `apps/platform/src/lib/actions/nodes.ts`, add:

```ts
import { revalidateImportedChats } from "../cache";
```

Add actions:

```ts
export async function hideImportedChat(nodeId: string): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("nodes")
    .update({ imported_visibility: "hidden_from_imported_chats" })
    .eq("id", nodeId)
    .eq("source_kind", "imported_ai_chat");
  if (error) throw error;
  revalidateImportedChats(actor.instance_id);
  revalidatePath("/", "layout");
}

export async function setImportedChatSuggestionStatus(
  nodeId: string,
  status: "allowed" | "ignored"
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("nodes")
    .update({ suggestion_status: status })
    .eq("id", nodeId)
    .eq("source_kind", "imported_ai_chat");
  if (error) throw error;
  revalidateImportedChats(actor.instance_id);
  revalidatePath("/", "layout");
}
```

- [ ] **Step 5: Render Imported Chats section**

In `apps/platform/src/components/sidebar.tsx`, change props to accept `sidebarData: SidebarData`.

Destructure:

```ts
const { projectTree, pinnedNodes, importedChats } = sidebarData;
```

Add this section below Projects:

```tsx
{importedChats.length > 0 && (
  <SidebarSection label="Imported Chats" collapsed={effectiveCollapsed}>
    {importedChats.map((node) => (
      <ImportedChatRow
        key={node.id}
        node={node}
        collapsed={effectiveCollapsed}
        isActive={pathname === `/n/${node.id}`}
        onNavigate={onNavigate}
      />
    ))}
  </SidebarSection>
)}
```

Add a row component:

```tsx
function ImportedChatRow({
  node,
  collapsed,
  isActive,
  onNavigate,
}: {
  node: import("@/lib/imported-chats").ImportedChatRow;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div className="group relative">
      <Link
        href={`/n/${node.id}`}
        onClick={onNavigate}
        className={[
          "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive ? "bg-bg-hover text-text-primary" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
          collapsed ? "justify-center" : "",
        ].join(" ")}
      >
        <SourceLogo sourceApp={node.source_app} />
        {!collapsed && <span className="truncate">{node.title}</span>}
      </Link>
      {!collapsed && (
        <button
          type="button"
          aria-label={`Actions for ${node.title}`}
          onClick={() => setMenuOpen((open) => !open)}
          className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary opacity-0 transition-opacity hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100"
        >
          <MoreHorizontal size={14} />
        </button>
      )}
      {menuOpen && (
        <div className="absolute right-1 top-8 z-50 w-48 rounded-md border border-border bg-bg-card p-1 shadow-lg">
          <button className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-bg-hover" onClick={() => router.push(`/n/${node.id}`)}>
            Open
          </button>
          <button className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-bg-hover" onClick={() => startTransition(async () => { await hideImportedChat(node.id); router.refresh(); })}>
            Hide from Imported Chats
          </button>
          <button className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-bg-hover" onClick={() => startTransition(async () => { await setImportedChatSuggestionStatus(node.id, node.suggestion_status === "ignored" ? "allowed" : "ignored"); router.refresh(); })}>
            {node.suggestion_status === "ignored" ? "Allow in suggestions" : "Ignore in suggestions"}
          </button>
          <button className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-bg-hover" onClick={() => startTransition(async () => { await archiveNode(node.id, node.id, node.parent_id); router.refresh(); })}>
            Archive
          </button>
          <button className="w-full rounded px-2 py-1.5 text-left text-sm text-red-500 hover:bg-bg-hover" onClick={() => setConfirmDelete(true)}>
            Delete forever
          </button>
        </div>
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Delete imported chat?"
          body="This permanently deletes the imported chat and its transcript from WorkOS."
          confirmLabel="Delete forever"
          onConfirm={() => startTransition(async () => { await deleteNode(node.id, node.id, node.parent_id); setConfirmDelete(false); router.refresh(); })}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function SourceLogo({ sourceApp }: { sourceApp: "claude" | "chatgpt" | "unknown" }) {
  const label = sourceApp === "claude" ? "C" : sourceApp === "chatgpt" ? "G" : "?";
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card text-[9px] font-semibold text-text-tertiary">
      {label}
    </span>
  );
}
```

For this row component, add local state:

```tsx
const [confirmDelete, setConfirmDelete] = useState(false);
```

and import:

```tsx
import { archiveNode, deleteNode, hideImportedChat, setImportedChatSuggestionStatus } from "@/lib/actions/nodes";
```

- [ ] **Step 6: Run lint**

Run:

```bash
cd apps/platform && npx eslint src/lib/imported-chats.ts src/lib/nodes.ts src/components/app-shell.tsx src/components/mobile-app-shell.tsx src/components/sidebar.tsx src/lib/actions/nodes.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/imported-chats.ts apps/platform/src/lib/nodes.ts apps/platform/src/components/app-shell.tsx apps/platform/src/components/mobile-app-shell.tsx apps/platform/src/components/sidebar.tsx apps/platform/src/lib/actions/nodes.ts
git commit -m "feat(import): show imported chats in sidebar"
```

---

### Task 7: Imported Transcript Rendering And Deep Links

**Files:**
- Modify: `apps/platform/src/components/post-item.tsx`
- Modify: `apps/platform/src/lib/posts.ts`
- Modify: `apps/platform/src/components/post-editor.tsx`
- Create: `apps/platform/src/lib/post-source-links.ts`
- Create: `apps/platform/src/lib/post-source-links.test.ts`

- [ ] **Step 1: Write source-link helper tests**

Create `apps/platform/src/lib/post-source-links.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  messageAnchorId,
  sourceThreadHref,
  sourceAppLabel,
} from "./post-source-links.ts";

assert.equal(messageAnchorId("post-1"), "message-post-1");
assert.equal(sourceThreadHref("thread-1"), "/n/thread-1");
assert.equal(sourceThreadHref("thread-1", "post-1"), "/n/thread-1#message-post-1");
assert.equal(sourceAppLabel("claude"), "Claude");
assert.equal(sourceAppLabel("chatgpt"), "ChatGPT");
assert.equal(sourceAppLabel("unknown"), "Unknown");
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/post-source-links.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement source-link helper**

Create `apps/platform/src/lib/post-source-links.ts`:

```ts
import type { SourceApp } from "./types";

export function messageAnchorId(postId: string): string {
  return `message-${postId}`;
}

export function sourceThreadHref(threadId: string, postId?: string | null): string {
  return postId ? `/n/${threadId}#${messageAnchorId(postId)}` : `/n/${threadId}`;
}

export function sourceAppLabel(sourceApp: SourceApp | null | undefined): string {
  if (sourceApp === "claude") return "Claude";
  if (sourceApp === "chatgpt") return "ChatGPT";
  if (sourceApp === "workos") return "WorkOS";
  return "Unknown";
}
```

- [ ] **Step 4: Add imported-message display helpers**

In `apps/platform/src/components/post-item.tsx`, import:

```ts
import { messageAnchorId, sourceAppLabel } from "@/lib/post-source-links";
```

Add:

```ts
function postMetadataString(post: PostRecord, key: string): string | null {
  const value = post.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function isImportedMessage(post: PostRecord): boolean {
  return post.metadata?.imported_message === true;
}

function displayActorName(post: PostRecord): string {
  return post.actor?.name ?? postMetadataString(post, "source_author") ?? "Unknown";
}
```

Change:

```ts
const actorName = post.actor?.name ?? "Unknown";
```

to:

```ts
const actorName = displayActorName(post);
```

Add an `id` on the outer post row:

```tsx
<div id={messageAnchorId(post.id)} className="group relative px-5 py-3 hover:bg-bg-hover/40 transition-colors scroll-mt-16">
```

Add a source badge in the header after the time:

```tsx
{isImportedMessage(post) && (
  <span className="rounded border border-border bg-bg-card px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">
    {sourceAppLabel(postMetadataString(post, "source_app") as never)}
  </span>
)}
```

- [ ] **Step 5: Render handoff activity posts**

Add to `ActivityBody` before the fallback:

```tsx
if (post.post_type === "import_handoff" && post.metadata) {
  const source = sourceAppLabel(postMetadataString(post, "source_app") as never);
  return (
    <p className="text-sm text-text-secondary">
      Imported from {source} · Continued in WorkOS
    </p>
  );
}
```

- [ ] **Step 6: Make node mentions open without replacing current place**

In `apps/platform/src/components/post-editor.tsx`, update `NodeMentionSpec` render anchor:

```tsx
<a
  href={`/n/${id}`}
  target="_blank"
  rel="noreferrer"
  className="inline-flex items-center rounded-[3px] bg-accent/10 px-[3px] text-[0.9em] font-medium text-accent no-underline hover:bg-accent/15"
  data-node-mention-id={id}
>
  #{title}
</a>
```

- [ ] **Step 7: Run tests and lint**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/post-source-links.test.ts && npx eslint src/components/post-item.tsx src/components/post-editor.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/src/lib/post-source-links.ts apps/platform/src/lib/post-source-links.test.ts apps/platform/src/components/post-item.tsx apps/platform/src/components/post-editor.tsx
git commit -m "feat(thread): render imported transcript provenance"
```

---

### Task 8: Persistent Thread Context Attachments And Timeline Events

**Files:**
- Create: `apps/platform/src/lib/thread-context.ts`
- Create: `apps/platform/src/lib/thread-context.test.ts`
- Create: `apps/platform/src/lib/actions/thread-context.ts`
- Create: `apps/platform/src/components/thread/context-event.tsx`
- Modify: `apps/platform/src/components/post-item.tsx`
- Modify: `apps/platform/src/lib/thread-surface.ts`
- Modify: `apps/platform/src/components/thread/thread-surface.tsx`

- [ ] **Step 1: Write thread-context tests**

Create `apps/platform/src/lib/thread-context.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildContextEventMetadata,
  contextEventSummary,
  isContextEventPost,
} from "./thread-context.ts";

const metadata = buildContextEventMetadata({
  action: "attached",
  sourceNodeId: "source-1",
  sourceTitle: "Campaign reporting script",
  sourceApp: "claude",
  sourcePostId: "post-1",
  reason: "Matched campaign, reporting, and script.",
});

assert.deepEqual(metadata, {
  context_event: true,
  action: "attached",
  source_node_id: "source-1",
  source_title: "Campaign reporting script",
  source_app: "claude",
  source_post_id: "post-1",
  reason: "Matched campaign, reporting, and script.",
});

assert.equal(contextEventSummary(metadata), "Added context from Claude: Campaign reporting script");
assert.equal(isContextEventPost({ post_type: "context_event", metadata }), true);
assert.equal(isContextEventPost({ post_type: "post", metadata: {} }), false);
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/thread-context.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement thread-context helpers**

Create `apps/platform/src/lib/thread-context.ts`:

```ts
import type { SourceApp } from "./types";
import { sourceAppLabel } from "./post-source-links";

export type ContextEventAction = "attached" | "removed" | "ignored" | "allowed";

export interface ContextEventInput {
  action: ContextEventAction;
  sourceNodeId: string;
  sourceTitle: string;
  sourceApp: SourceApp;
  sourcePostId?: string | null;
  reason?: string | null;
}

export interface ContextEventMetadata {
  context_event: true;
  action: ContextEventAction;
  source_node_id: string;
  source_title: string;
  source_app: SourceApp;
  source_post_id: string | null;
  reason: string | null;
}

export function buildContextEventMetadata(input: ContextEventInput): ContextEventMetadata {
  return {
    context_event: true,
    action: input.action,
    source_node_id: input.sourceNodeId,
    source_title: input.sourceTitle,
    source_app: input.sourceApp,
    source_post_id: input.sourcePostId ?? null,
    reason: input.reason ?? null,
  };
}

export function isContextEventPost(post: { post_type: string; metadata: Record<string, unknown> | null }): boolean {
  return post.post_type === "context_event" && post.metadata?.context_event === true;
}

export function contextEventSummary(metadata: Record<string, unknown>): string {
  const action = typeof metadata.action === "string" ? metadata.action : "attached";
  const title = typeof metadata.source_title === "string" ? metadata.source_title : "Untitled";
  const app = sourceAppLabel(metadata.source_app as SourceApp);
  if (action === "removed") return `Removed context from this thread: ${title}`;
  if (action === "ignored") return `Ignored ${app}: ${title} in suggestions`;
  if (action === "allowed") return `Allowed ${app}: ${title} in suggestions`;
  return `Added context from ${app}: ${title}`;
}
```

- [ ] **Step 4: Add thread context server actions**

Create `apps/platform/src/lib/actions/thread-context.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateNodePosts, revalidateThreadContext } from "../cache";
import { buildContextEventMetadata, type ContextEventAction } from "../thread-context";
import { supabase } from "../supabase";
import type { ContextAttachedBy, SourceApp } from "../types";

export async function attachThreadContext(input: {
  threadId: string;
  sourceNodeId: string;
  attachedBy: ContextAttachedBy;
  reason?: string | null;
  sourcePostId?: string | null;
}): Promise<void> {
  const actor = await getCurrentActor();
  const source = await getSourceNode(input.sourceNodeId);
  const { error } = await supabase.from("thread_context_attachments").upsert(
    {
      instance_id: actor.instance_id,
      thread_id: input.threadId,
      context_source_node_id: input.sourceNodeId,
      attached_by: input.attachedBy,
      status: "active",
      reason: input.reason ?? null,
      source_post_id: input.sourcePostId ?? null,
      removed_at: null,
    },
    { onConflict: "thread_id,context_source_node_id" }
  );
  if (error) throw error;
  await insertContextEvent(input.threadId, {
    action: "attached",
    sourceNodeId: input.sourceNodeId,
    sourceTitle: source.title,
    sourceApp: source.source_app ?? "workos",
    sourcePostId: input.sourcePostId ?? null,
    reason: input.reason ?? null,
  });
}

export async function removeThreadContext(threadId: string, sourceNodeId: string): Promise<void> {
  await updateAttachment(threadId, sourceNodeId, "removed");
}

export async function ignoreThreadContext(threadId: string, sourceNodeId: string): Promise<void> {
  await updateAttachment(threadId, sourceNodeId, "ignored");
}

export async function allowThreadContext(threadId: string, sourceNodeId: string): Promise<void> {
  await updateAttachment(threadId, sourceNodeId, "allowed");
}

async function updateAttachment(
  threadId: string,
  sourceNodeId: string,
  action: ContextEventAction
): Promise<void> {
  const source = await getSourceNode(sourceNodeId);
  const status = action === "removed" ? "removed" : action === "ignored" ? "ignored_for_suggestions" : "active";
  const { error } = await supabase
    .from("thread_context_attachments")
    .update({ status, removed_at: status === "active" ? null : new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("context_source_node_id", sourceNodeId);
  if (error) throw error;
  await insertContextEvent(threadId, {
    action,
    sourceNodeId,
    sourceTitle: source.title,
    sourceApp: source.source_app ?? "workos",
  });
}

async function getSourceNode(nodeId: string): Promise<{ title: string; source_app: SourceApp | null }> {
  const { data, error } = await supabase
    .from("nodes")
    .select("title,source_app")
    .eq("id", nodeId)
    .single();
  if (error) throw error;
  return data as { title: string; source_app: SourceApp | null };
}

async function insertContextEvent(
  threadId: string,
  event: Parameters<typeof buildContextEventMetadata>[0]
): Promise<void> {
  const metadata = buildContextEventMetadata(event);
  const { error } = await supabase.from("posts").insert({
    node_id: threadId,
    actor_id: null,
    post_type: "context_event",
    body: null,
    metadata,
  });
  if (error) throw error;
  revalidateThreadContext(threadId);
  revalidateNodePosts(threadId);
  revalidatePath(`/n/${threadId}`);
}
```

- [ ] **Step 5: Render context events**

Create `apps/platform/src/components/thread/context-event.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { PostRecord } from "@/lib/posts";
import { sourceThreadHref } from "@/lib/post-source-links";
import { contextEventSummary } from "@/lib/thread-context";
import {
  allowThreadContext,
  ignoreThreadContext,
  removeThreadContext,
} from "@/lib/actions/thread-context";

export function ContextEvent({
  post,
  threadId,
}: {
  post: PostRecord;
  threadId: string;
}) {
  const [pending, startTransition] = useTransition();
  const metadata = post.metadata ?? {};
  const sourceNodeId = typeof metadata.source_node_id === "string" ? metadata.source_node_id : null;
  const sourcePostId = typeof metadata.source_post_id === "string" ? metadata.source_post_id : null;
  const href = sourceNodeId ? sourceThreadHref(sourceNodeId, sourcePostId) : null;

  return (
    <div className="rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-secondary">
      <div className="flex flex-wrap items-center gap-2">
        <span>{contextEventSummary(metadata)}</span>
        {href && (
          <Link href={href} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            Open
          </Link>
        )}
        {sourceNodeId && (
          <>
            <button type="button" disabled={pending} onClick={() => startTransition(() => removeThreadContext(threadId, sourceNodeId))} className="font-medium text-text-tertiary hover:text-text-primary">
              Remove from thread
            </button>
            <button type="button" disabled={pending} onClick={() => startTransition(() => ignoreThreadContext(threadId, sourceNodeId))} className="font-medium text-text-tertiary hover:text-text-primary">
              Ignore in suggestions
            </button>
            <button type="button" disabled={pending} onClick={() => startTransition(() => allowThreadContext(threadId, sourceNodeId))} className="font-medium text-text-tertiary hover:text-text-primary">
              Allow
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

In `PostItem`, render `ContextEvent` when `post_type === "context_event"` and pass `nodeId` as `threadId`.

- [ ] **Step 6: Run tests and lint**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/thread-context.test.ts && npx eslint src/lib/thread-context.ts src/lib/actions/thread-context.ts src/components/thread/context-event.tsx src/components/post-item.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/thread-context.ts apps/platform/src/lib/thread-context.test.ts apps/platform/src/lib/actions/thread-context.ts apps/platform/src/components/thread/context-event.tsx apps/platform/src/components/post-item.tsx
git commit -m "feat(context): persist thread context events"
```

---

### Task 9: Context-Aware Prompt Assembly And Simple Automatic Retrieval

**Files:**
- Modify: `apps/platform/src/lib/thread-context.ts`
- Modify: `apps/platform/src/lib/thread-context.test.ts`
- Modify: `apps/platform/src/lib/thread-surface.ts`
- Modify: `apps/platform/src/lib/agents/node-context.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`

- [ ] **Step 1: Add retrieval candidate tests**

Append to `apps/platform/src/lib/thread-context.test.ts`:

```ts
import { chooseAutomaticContextCandidates } from "./thread-context.ts";

const candidates = [
  {
    id: "recent-script",
    title: "Campaign reporting script",
    sourceApp: "claude" as const,
    updatedAt: "2026-06-23T10:00:00Z",
    bodyPreview: "SQL parsing date cleanup campaign reporting",
  },
  {
    id: "old-finance",
    title: "Finance plan",
    sourceApp: "chatgpt" as const,
    updatedAt: "2026-05-01T10:00:00Z",
    bodyPreview: "budget runway taxes",
  },
];

assert.deepEqual(
  chooseAutomaticContextCandidates({
    userText: "I want to keep working on the reporting SQL parser",
    candidates,
    limit: 2,
  }).map((item) => item.id),
  ["recent-script"]
);
```

- [ ] **Step 2: Implement deterministic retrieval helper**

Add to `apps/platform/src/lib/thread-context.ts`:

```ts
import { buildContextSearchResults, type ContextSearchCandidate } from "./context-search";

export function chooseAutomaticContextCandidates(input: {
  userText: string;
  candidates: Array<ContextSearchCandidate & { sourceApp: "workos" | "claude" | "chatgpt" | "unknown" }>;
  limit: number;
}) {
  return buildContextSearchResults(input.candidates, input.userText, input.limit).filter(
    (candidate) => candidate.score >= 100
  );
}
```

- [ ] **Step 3: Include active attachments in node context**

In `apps/platform/src/lib/agents/node-context.ts`, extend `NodeContext`:

```ts
  attachedContexts: RelativeThread[];
```

Fetch active attachments in `gatherNodeContext`:

```ts
const { data: attachmentRows, error: attachmentErr } = await supabase
  .from("thread_context_attachments")
  .select("context_source_node_id, source:nodes!thread_context_attachments_context_source_node_id_fkey(id,title,type)")
  .eq("thread_id", nodeId)
  .eq("status", "active");
if (attachmentErr) throw attachmentErr;
```

Fetch posts for those source nodes and map them into `attachedContexts`.

- [ ] **Step 4: Render attached context in Claude prompt**

In `apps/platform/src/lib/agents/claude-prompt.ts`, before parent/sibling sections in `buildUserMessage`, add:

```ts
for (const attached of ctx.attachedContexts) {
  sections.push(
    renderRelativeSection(`# Attached context: "${attached.node.title}"`, attached, now)
  );
}
```

- [ ] **Step 5: Add automatic attach before agent response**

In `apps/platform/src/lib/actions/posts.ts`, after inserting the user post and before `routeAgentMentions`, call a new helper `attachAutomaticContextForPost`.

Add helper:

```ts
async function attachAutomaticContextForPost(input: {
  nodeId: string;
  actorInstanceId: string;
  plainText: string;
}): Promise<void> {
  if (input.plainText.length < 8) return;
  const { data, error } = await supabase
    .from("nodes")
    .select("id,title,type,source_app,updated_at")
    .eq("instance_id", input.actorInstanceId)
    .eq("suggestion_status", "allowed")
    .is("archived_at", null)
    .neq("id", input.nodeId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const candidates = chooseAutomaticContextCandidates({
    userText: input.plainText,
    candidates: (data ?? []).map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      path: node.title,
      href: `/n/${node.id}`,
      sourceApp: node.source_app ?? "workos",
      updatedAt: node.updated_at,
    })),
    limit: 1,
  });
  const best = candidates[0];
  if (!best) return;
  await attachThreadContext({
    threadId: input.nodeId,
    sourceNodeId: best.id,
    attachedBy: "automatic",
    reason: `Matched ${best.matchedTokens.join(", ")}.`,
  });
}
```

Import `chooseAutomaticContextCandidates` and `attachThreadContext`. This deterministic v1 avoids LLM-wide archive scans while making the product loop real.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/thread-context.test.ts && npx eslint src/lib/actions/posts.ts src/lib/agents/node-context.ts src/lib/agents/claude-prompt.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/thread-context.ts apps/platform/src/lib/thread-context.test.ts apps/platform/src/lib/thread-surface.ts apps/platform/src/lib/agents/node-context.ts apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/actions/posts.ts
git commit -m "feat(context): attach relevant thread context"
```

---

### Task 10: Structured Context Panel And Thread Surface Redistribution

**Files:**
- Create: `apps/platform/src/components/thread/context-panel.tsx`
- Modify: `apps/platform/src/components/thread/thread-surface.tsx`
- Modify: `apps/platform/src/components/node-detail-tabs.tsx`
- Modify: `apps/platform/src/lib/thread-surface.ts`

- [ ] **Step 1: Add thread surface data**

In `apps/platform/src/lib/thread-surface.ts`, add `contextAttachments` to `ThreadSurfaceData` and fetch:

```ts
const contextAttachmentsPromise = supabase
  .from("thread_context_attachments")
  .select("*, source:nodes!thread_context_attachments_context_source_node_id_fkey(id,title,type,source_app)")
  .eq("thread_id", nodeId)
  .order("created_at", { ascending: false });
```

Include it in the returned data as:

```ts
contextAttachments: contextRows.data ?? [],
```

- [ ] **Step 2: Create context panel component**

Create `apps/platform/src/components/thread/context-panel.tsx`:

```tsx
import Link from "next/link";
import { sourceThreadHref, sourceAppLabel } from "@/lib/post-source-links";
import type { ThreadContextAttachment } from "@/lib/types";

interface ContextAttachmentRow extends ThreadContextAttachment {
  source?: {
    id: string;
    title: string;
    type: string;
    source_app: "workos" | "claude" | "chatgpt" | "unknown" | null;
  } | null;
}

export function ContextPanel({
  attachments,
  fieldsContent,
  memoryContent,
  treeContent,
}: {
  attachments: ContextAttachmentRow[];
  fieldsContent: React.ReactNode;
  memoryContent: React.ReactNode;
  treeContent: React.ReactNode;
}) {
  const active = attachments.filter((attachment) => attachment.status === "active");
  return (
    <aside className="hidden w-[360px] shrink-0 overflow-auto border-l border-border bg-bg-secondary/60 md:block">
      <section className="border-b border-border px-4 py-4">
        <div className="section-label">Context</div>
        <h2 className="mt-1 text-sm font-semibold text-text-primary">Attached context</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-text-tertiary">No attached context yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {active.map((attachment) => (
              <Link
                key={attachment.id}
                href={sourceThreadHref(attachment.context_source_node_id, attachment.source_post_id)}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
              >
                <div className="font-medium text-text-primary">{attachment.source?.title ?? "Untitled"}</div>
                <div className="mt-0.5 text-xs text-text-tertiary">
                  {sourceAppLabel(attachment.source?.source_app ?? "workos")} · {attachment.attached_by}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="border-b border-border px-4 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Memory</h2>
        <div className="mt-2">{memoryContent}</div>
      </section>
      <section className="border-b border-border px-4 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Fields</h2>
        <div className="mt-2">{fieldsContent}</div>
      </section>
      <section className="px-4 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Child threads</h2>
        <div className="mt-2">{treeContent}</div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 3: Compose thread surface as chat plus side panel**

In `ThreadSurface`, stop passing `boardContent` to `NodeDetailTabs` and render:

```tsx
return (
  <main className="flex h-full min-h-0 bg-bg-primary">
    <div className="min-w-0 flex-1">
      <NodeDetailTabs
        identity={{ ... }}
        postsContent={postsContent}
        fieldsContent={fieldsContent}
        memoryContent={memoryContent}
        treeContent={treeContent}
        paddingClassName="px-6"
      />
    </div>
    <ContextPanel
      attachments={data.contextAttachments}
      fieldsContent={fieldsContent}
      memoryContent={memoryContent}
      treeContent={treeContent}
    />
  </main>
);
```

- [ ] **Step 4: Remove Board tab from node detail tabs**

In `apps/platform/src/components/node-detail-tabs.tsx`, remove the `boardContent` prop and the `"board"` tab. Keep mobile Details for fields/memory/tree.

- [ ] **Step 5: Run lint**

Run:

```bash
cd apps/platform && npx eslint src/components/thread/context-panel.tsx src/components/thread/thread-surface.tsx src/components/node-detail-tabs.tsx src/lib/thread-surface.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/components/thread/context-panel.tsx apps/platform/src/components/thread/thread-surface.tsx apps/platform/src/components/node-detail-tabs.tsx apps/platform/src/lib/thread-surface.ts
git commit -m "feat(thread): add structured context panel"
```

---

### Task 11: Global Board Page

**Files:**
- Create: `apps/platform/src/app/board/page.tsx`
- Create: `apps/platform/src/lib/global-board.ts`
- Create: `apps/platform/src/lib/global-board.test.ts`
- Modify: `apps/platform/src/components/sidebar.tsx`
- Modify: `apps/platform/src/app/n/[id]/page.tsx`

- [ ] **Step 1: Write global board helper test**

Create `apps/platform/src/lib/global-board.test.ts`:

```ts
import assert from "node:assert/strict";
import { chooseGlobalBoardRoot } from "./global-board.ts";
import type { WorkNode } from "./types";

const now = "2026-06-24T10:00:00.000Z";
const base = {
  instance_id: "instance-1",
  parent_id: null,
  type: "workspace" as const,
  description: null,
  owner_id: null,
  position: 0,
  stack_lifecycle_status: "prioritized" as const,
  thread_resolution_status: "active" as const,
  resolved_at: null,
  resolved_by_actor_id: null,
  resolution_summary: null,
  resolution_source_post_id: null,
  archived_at: null,
  created_at: now,
  updated_at: now,
  source_kind: null,
  source_app: null,
  source_import_session_id: null,
  source_conversation_id: null,
  source_title: null,
  source_hash: null,
  source_created_at: null,
  source_updated_at: null,
  imported_visibility: "visible" as const,
  suggestion_status: "allowed" as const,
};

const roots: WorkNode[] = [
  { ...base, id: "imported", title: "Imported", source_kind: "imported_ai_chat", source_app: "claude" },
  { ...base, id: "native", title: "Workspace" },
];

assert.equal(chooseGlobalBoardRoot(roots)?.id, "native");
```

- [ ] **Step 2: Implement global board helper**

Create `apps/platform/src/lib/global-board.ts`:

```ts
import { getWorkspaceBoard } from "./board";
import { getRootNodes } from "./nodes";
import { getWorkspaceViews } from "./views";
import type { WorkNode } from "./types";

export function chooseGlobalBoardRoot(roots: WorkNode[]): WorkNode | null {
  return roots.find((node) => node.source_kind !== "imported_ai_chat" && node.type === "workspace") ?? null;
}

export async function getGlobalBoardData() {
  const roots = await getRootNodes();
  const root = chooseGlobalBoardRoot(roots);
  if (!root) return null;
  const [board, views] = await Promise.all([
    getWorkspaceBoard(root.id),
    getWorkspaceViews(root.id),
  ]);
  if (!board) return null;
  return { board, views, root };
}
```

- [ ] **Step 3: Create global board route**

Create `apps/platform/src/app/board/page.tsx`:

```tsx
import { Board } from "@/components/board/board";
import { getGlobalBoardData } from "@/lib/global-board";

export default async function GlobalBoardPage() {
  const data = await getGlobalBoardData();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="section-label">Global</div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-text-primary">
          Board
        </h1>
      </div>
      <div className="min-h-0 flex-1">
        {data ? (
          <Board data={data.board} views={data.views} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-sm text-text-tertiary">
            No board root available.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add sidebar Board nav and remove per-thread board branch**

In `Sidebar`, add a `Board` nav link near Feed:

```tsx
<NavLink
  href="/board"
  label="Board"
  icon={<LayoutGrid size={15} />}
  active={pathname === "/board"}
  collapsed={effectiveCollapsed}
  onNavigate={onNavigate}
/>
```

In `apps/platform/src/app/n/[id]/page.tsx`, remove the `view=board` branch. Keep `detailId` redirect behavior:

```ts
if (detailId) {
  redirect(`/n/${detailId}`);
}
```

- [ ] **Step 5: Run tests and lint**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/global-board.test.ts && npx eslint src/app/board/page.tsx src/lib/global-board.ts src/components/sidebar.tsx 'src/app/n/[id]/page.tsx'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/app/board/page.tsx apps/platform/src/lib/global-board.ts apps/platform/src/lib/global-board.test.ts apps/platform/src/components/sidebar.tsx 'apps/platform/src/app/n/[id]/page.tsx'
git commit -m "feat(board): move board to global page"
```

---

### Task 12: Settings Sources Surface

**Files:**
- Modify: `apps/platform/src/lib/settings-nav.ts`
- Create: `apps/platform/src/app/settings/sources/page.tsx`
- Create: `apps/platform/src/components/settings/sources-settings.tsx`
- Modify: `apps/platform/src/lib/imported-chats.ts`

- [ ] **Step 1: Add settings nav entry**

In `apps/platform/src/lib/settings-nav.ts`, add:

```ts
{
  href: "/settings/sources",
  label: "Sources",
}
```

- [ ] **Step 2: Add source settings read helper**

In `apps/platform/src/lib/imported-chats.ts`, add:

```ts
export async function getImportedChatsForSettings(instanceId: string): Promise<ImportedChatRow[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .eq("instance_id", instanceId)
    .eq("source_kind", "imported_ai_chat")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ImportedChatRow[];
}
```

- [ ] **Step 3: Create settings page**

Create `apps/platform/src/app/settings/sources/page.tsx`:

```tsx
import { getCurrentActor } from "@/lib/actor";
import { getImportedChatsForSettings } from "@/lib/imported-chats";
import { SourcesSettings } from "@/components/settings/sources-settings";

export default async function SourcesSettingsPage() {
  const actor = await getCurrentActor();
  const importedChats = await getImportedChatsForSettings(actor.instance_id);
  return <SourcesSettings importedChats={importedChats} />;
}
```

- [ ] **Step 4: Create source settings component**

Create `apps/platform/src/components/settings/sources-settings.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ImportedChatRow } from "@/lib/imported-chats";
import { setImportedChatSuggestionStatus } from "@/lib/actions/nodes";
import { sourceAppLabel } from "@/lib/post-source-links";

export function SourcesSettings({ importedChats }: { importedChats: ImportedChatRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Sources</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage imported chats and context suggestions.
        </p>
      </div>
      <Link href="/import" className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent/90">
        Import chats
      </Link>
      <div className="divide-y divide-border rounded-lg border border-border bg-bg-card">
        {importedChats.map((chat) => (
          <div key={chat.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-primary">{chat.title}</div>
              <div className="text-xs text-text-tertiary">
                {sourceAppLabel(chat.source_app)} · {chat.suggestion_status === "ignored" ? "Ignored in suggestions" : "Allowed in suggestions"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => startTransition(async () => {
                await setImportedChatSuggestionStatus(chat.id, chat.suggestion_status === "ignored" ? "allowed" : "ignored");
                router.refresh();
              })}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              {chat.suggestion_status === "ignored" ? "Allow" : "Ignore"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run lint**

Run:

```bash
cd apps/platform && npx eslint src/lib/settings-nav.ts src/app/settings/sources/page.tsx src/components/settings/sources-settings.tsx src/lib/imported-chats.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/settings-nav.ts apps/platform/src/app/settings/sources/page.tsx apps/platform/src/components/settings/sources-settings.tsx apps/platform/src/lib/imported-chats.ts
git commit -m "feat(settings): add source management"
```

---

### Task 13: Final Verification

**Files:**
- Verify all files touched above.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/context-search.test.ts && npx --yes tsx src/lib/node-mentions.test.ts && npx --yes tsx src/lib/app-search.test.ts && npx --yes tsx src/lib/import-sources.test.ts && npx --yes tsx src/lib/import-materialize.test.ts && npx --yes tsx src/lib/thread-context.test.ts && npx --yes tsx src/lib/post-source-links.test.ts && npx --yes tsx src/lib/global-board.test.ts && npx --yes tsx supabase/migrations/import-continuation.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
cd apps/platform && npx eslint
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd apps/platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run build**

Run:

```bash
cd apps/platform && npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual browser verification**

Run:

```bash
cd apps/platform && npm run dev
```

Open `http://localhost:3000/import` and verify:

- Claude and ChatGPT JSON files can be added before importing.
- Inventory shows both files and total readable chats.
- Import creates Imported Chats in the left rail.
- Imported chat rows show source logos and titles.
- Imported chats open as normal threads with full transcript inline.
- Source message anchors work by visiting `/n/<imported-thread-id>#message-<post-id>`.
- `#` mention search finds exact titles and unordered title words.
- Attaching context creates a timeline context event.
- Context event `Open` opens the source in a new tab and deep-links when a source post exists.
- `/board` opens the global board page.
- Normal `/n/<id>` thread pages do not show Board as a peer tab.

- [ ] **Step 6: Commit verification fixes**

When verification changes files, inspect the exact changed paths:

```bash
git status --short
```

Stage only files changed by Tasks 1-12, then commit them:

```bash
git commit -m "fix(import): finish continuation verification"
```

Expected: commit only if files changed during verification.
