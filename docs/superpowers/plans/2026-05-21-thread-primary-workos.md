# Thread-Primary WorkOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WorkOS thread-primary by turning the existing detail-panel experience into the default full-page node surface, while preserving boards as alternate views and adding first-pass sub-thread creation, resolution summaries, and findability.

**Architecture:** This is a v0 implementation slice of `docs/superpowers/specs/2026-05-21-thread-primary-workos-design.md`. It keeps the current recursive `nodes` table and current `workspace` / `stack` / `card` labels for compatibility, but changes the user-facing surface to "threads" and "sub-threads." The existing detail panel is refactored into reusable server/client pieces so the full-page thread surface and legacy board detail panel share the same behavior.

**Tech Stack:** Next.js 16 App Router, React Server Components, TypeScript, Supabase/Postgres migrations, Tailwind CSS v4 tokens, BlockNote posts, existing server actions and cache tag helpers.

---

## Scope

Build now:

- Full-page thread surface for `/n/[id]`.
- Board view preserved behind `?view=board` for workspace nodes.
- Existing detail panel behavior reused, not reinvented.
- Sub-thread creation under any node.
- First-pass unresolved sub-thread blocks and resolved summary blocks.
- Path header based on full ancestry, not just parent/grandparent.
- Basic tree/search safety so unpinned work remains discoverable.

Defer:

- Full Finiti workflow builder.
- LLM-driven adaptive pinning suggestions.
- Mixed-altitude board query builder.
- Rich visual mini-map animations.
- Complete migration away from `workspace` / `stack` / `card` internal type labels.

## File Structure

- Create `apps/platform/supabase/migrations/0021_thread_primary.sql`
  - Adds thread resolution fields to `nodes`.
  - Adds indexes for active/resolved sub-thread queries.

- Modify `apps/platform/src/lib/types.ts`
  - Adds `ThreadResolutionStatus` and nullable resolution fields to `WorkNode`.

- Create `apps/platform/src/lib/node-path.ts`
  - Pure path helpers for tests.
  - Supabase-backed `getNodePath(nodeId)` for full breadcrumbs.

- Create `apps/platform/src/lib/node-path.test.ts`
  - Assertion tests for path ordering and cycle guard behavior.

- Create `apps/platform/src/lib/thread-surface.ts`
  - Server read model for the full-page thread surface.
  - Composes node detail, posts, children, fields, actors, links, memory, and path data.

- Create `apps/platform/src/lib/thread-status.ts`
  - Pure helpers for resolution metadata and labels.

- Create `apps/platform/src/lib/thread-status.test.ts`
  - Assertion tests for summary metadata and status labels.

- Modify `apps/platform/src/lib/cache.ts`
  - Adds a cache tag/helper for full thread surfaces and full node paths.

- Modify `apps/platform/src/lib/actions/nodes.ts`
  - Adds `createSubThread`, `resolveSubThread`, and `reopenSubThread`.
  - Revalidates parent, child, posts, board, thread surface, and path reads.

- Create `apps/platform/src/components/thread/thread-surface.tsx`
  - Server component for the full-page thread surface.

- Create `apps/platform/src/components/thread/thread-header.tsx`
  - Header path, title, badges, owner/member row, view switcher.

- Create `apps/platform/src/components/thread/thread-tabs.tsx`
  - Full-page tabs adapted from `DetailPanelTabs`.

- Create `apps/platform/src/components/thread/sub-thread-list.tsx`
  - Shows unresolved/resolved sub-thread blocks and create affordance.

- Create `apps/platform/src/components/thread/sub-thread-actions.tsx`
  - Client controls for resolving/reopening and creating sub-threads.

- Create `apps/platform/src/components/thread/thread-tree.tsx`
  - Lightweight current-area tree/outline.

- Create `apps/platform/src/components/thread/thread-search.tsx`
  - Client-side search over the current tree slice for the first pass.

- Modify `apps/platform/src/components/detail-panel.tsx`
  - Reuses shared thread header/tabs where practical.
  - Keeps close button and panel sizing behavior.

- Modify `apps/platform/src/components/detail-panel-tabs.tsx`
  - Generalizes labels from card/field panel language where needed.

- Modify `apps/platform/src/app/n/[id]/page.tsx`
  - Makes thread surface the default.
  - Keeps workspace board at `/n/[id]?view=board`.
  - Keeps `?d=<nodeId>` detail panel behavior inside board view.

- Modify `apps/platform/src/components/sidebar.tsx`
  - User-facing copy shifts from workspace-first to thread-first where visible.
  - Existing root node behavior remains.

---

### Task 1: Add Full Node Path Helpers

**Files:**
- Create: `apps/platform/src/lib/node-path.ts`
- Create: `apps/platform/src/lib/node-path.test.ts`
- Modify: `apps/platform/src/lib/cache.ts`

- [ ] **Step 1: Write the failing path helper test**

Create `apps/platform/src/lib/node-path.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildNodePathFromRows,
  type NodePathRow,
} from "./node-path";

const rows: NodePathRow[] = [
  { id: "pricing", title: "Pricing", type: "card", parent_id: "scope" },
  { id: "general", title: "General", type: "workspace", parent_id: null },
  { id: "scope", title: "Scope Design", type: "card", parent_id: "bugs" },
  { id: "bugs", title: "Bugs & Feature Requests", type: "stack", parent_id: "general" },
];

assert.deepEqual(
  buildNodePathFromRows("pricing", rows).map((row) => row.title),
  ["General", "Bugs & Feature Requests", "Scope Design", "Pricing"]
);

assert.deepEqual(buildNodePathFromRows("missing", rows), []);

const cyclicRows: NodePathRow[] = [
  { id: "a", title: "A", type: "card", parent_id: "b" },
  { id: "b", title: "B", type: "card", parent_id: "a" },
];

assert.throws(
  () => buildNodePathFromRows("a", cyclicRows),
  /Cycle detected while building node path/
);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx tsx apps/platform/src/lib/node-path.test.ts
```

Expected: fail because `apps/platform/src/lib/node-path.ts` does not exist.

- [ ] **Step 3: Implement path helper and cached read**

Create `apps/platform/src/lib/node-path.ts`:

```ts
import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";

export interface NodePathRow {
  id: string;
  title: string;
  type: string;
  parent_id: string | null;
}

export interface NodePathItem {
  id: string;
  title: string;
  type: string;
}

export function buildNodePathFromRows(
  nodeId: string,
  rows: NodePathRow[]
): NodePathItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: NodePathItem[] = [];
  const seen = new Set<string>();
  let cursor: string | null = nodeId;

  while (cursor) {
    if (seen.has(cursor)) {
      throw new Error("Cycle detected while building node path");
    }
    seen.add(cursor);

    const row = byId.get(cursor);
    if (!row) return [];
    path.push({ id: row.id, title: row.title, type: row.type });
    cursor = row.parent_id;
  }

  return path.reverse();
}

export async function getNodePath(nodeId: string): Promise<NodePathItem[]> {
  const cached = unstable_cache(
    async (): Promise<NodePathItem[]> => {
      const rows: NodePathRow[] = [];
      const seen = new Set<string>();
      let cursor: string | null = nodeId;

      while (cursor) {
        if (seen.has(cursor)) {
          throw new Error("Cycle detected while fetching node path");
        }
        seen.add(cursor);

        const { data, error } = await supabase
          .from("nodes")
          .select("id, title, type, parent_id")
          .eq("id", cursor)
          .maybeSingle();
        if (error) throw error;
        if (!data) return [];

        rows.push(data as NodePathRow);
        cursor = data.parent_id;
      }

      return rows
        .map(({ id, title, type }) => ({ id, title, type }))
        .reverse();
    },
    ["node-path", nodeId],
    {
      tags: [cacheTags.nodePath(nodeId)],
      revalidate: 300,
    }
  );

  return cached();
}
```

Modify `apps/platform/src/lib/cache.ts`:

```ts
export const cacheTags = {
  rootNodes: () => "root-nodes",
  node: (id: string) => `node:${id}`,
  nodePath: (id: string) => `node-path:${id}`,
  children: (parentId: string) => `node-children:${parentId}`,
  workspaceBoard: (workspaceId: string) => `workspace-board:${workspaceId}`,
  instanceFields: (instanceId: string) => `instance-fields:${instanceId}`,
  aiStandards: (instanceId: string) => `ai-standards:${instanceId}`,
  workspaceViews: (workspaceId: string) => `workspace-views:${workspaceId}`,
  nodePosts: (nodeId: string) => `posts:${nodeId}`,
  workspaceFeed: (workspaceId: string) => `workspace-feed:${workspaceId}`,
  nodeLinks: (nodeId: string) => `links:${nodeId}`,
  nodeMemoryPrimitives: (nodeId: string) => `memory-primitives:${nodeId}`,
};
```

Add this helper near `revalidateNode`:

```ts
export function revalidateNodePath(id: string) {
  revalidateTag(cacheTags.nodePath(id), PROFILE);
}
```

- [ ] **Step 4: Run the path helper test**

Run:

```bash
npx tsx apps/platform/src/lib/node-path.test.ts
```

Expected: pass with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/cache.ts apps/platform/src/lib/node-path.ts apps/platform/src/lib/node-path.test.ts
git commit -m "feat(platform): add node path helpers"
```

---

### Task 2: Add Thread Resolution Data

**Files:**
- Create: `apps/platform/supabase/migrations/0021_thread_primary.sql`
- Modify: `apps/platform/src/lib/types.ts`

- [ ] **Step 1: Write the migration**

Create `apps/platform/supabase/migrations/0021_thread_primary.sql`:

```sql
alter table nodes
  add column if not exists thread_resolution_status text not null default 'active'
    check (thread_resolution_status in ('active', 'resolved', 'reopened', 'superseded')),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_actor_id uuid references actors(id) on delete set null,
  add column if not exists resolution_summary text,
  add column if not exists resolution_source_post_id uuid references posts(id) on delete set null;

create index if not exists nodes_parent_thread_status_idx
  on nodes(parent_id, thread_resolution_status, updated_at desc);

create index if not exists nodes_resolution_source_post_idx
  on nodes(resolution_source_post_id)
  where resolution_source_post_id is not null;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Update TypeScript node types**

Modify `apps/platform/src/lib/types.ts`:

```ts
export type ThreadResolutionStatus =
  | "active"
  | "resolved"
  | "reopened"
  | "superseded";
```

Update `WorkNode`:

```ts
export interface WorkNode {
  id: string;
  instance_id: string;
  parent_id: string | null;
  type: NodeType;
  title: string;
  description: string | null;
  owner_id: string | null;
  position: number;
  stack_lifecycle_status: StackLifecycleStatus;
  thread_resolution_status: ThreadResolutionStatus;
  resolved_at: string | null;
  resolved_by_actor_id: string | null;
  resolution_summary: string | null;
  resolution_source_post_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass. If fixture objects in tests fail because new `WorkNode` fields are missing, add the four new nullable fields plus `thread_resolution_status: "active"` to those fixtures.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/supabase/migrations/0021_thread_primary.sql apps/platform/src/lib/types.ts
git commit -m "feat(platform): add thread resolution fields"
```

---

### Task 3: Add Thread Status Helpers

**Files:**
- Create: `apps/platform/src/lib/thread-status.ts`
- Create: `apps/platform/src/lib/thread-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/platform/src/lib/thread-status.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildSubThreadResolvedMetadata,
  getThreadStatusLabel,
  normalizeResolutionSummary,
} from "./thread-status";

assert.equal(getThreadStatusLabel("active"), "Unresolved");
assert.equal(getThreadStatusLabel("resolved"), "Resolved");
assert.equal(getThreadStatusLabel("reopened"), "Reopened");
assert.equal(getThreadStatusLabel("superseded"), "Superseded");

assert.equal(
  normalizeResolutionSummary("  Pricing resolved: $12k fixed fee.  "),
  "Pricing resolved: $12k fixed fee."
);

assert.throws(() => normalizeResolutionSummary("   "), /Resolution summary is required/);

assert.deepEqual(
  buildSubThreadResolvedMetadata({
    subThreadId: "pricing",
    subThreadTitle: "Pricing",
    summary: "Pricing resolved: $12k fixed fee.",
  }),
  {
    sub_thread_id: "pricing",
    sub_thread_title: "Pricing",
    summary: "Pricing resolved: $12k fixed fee.",
  }
);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx tsx apps/platform/src/lib/thread-status.test.ts
```

Expected: fail because `apps/platform/src/lib/thread-status.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Create `apps/platform/src/lib/thread-status.ts`:

```ts
import type { ThreadResolutionStatus } from "./types";

export function getThreadStatusLabel(status: ThreadResolutionStatus): string {
  switch (status) {
    case "active":
      return "Unresolved";
    case "resolved":
      return "Resolved";
    case "reopened":
      return "Reopened";
    case "superseded":
      return "Superseded";
  }
}

export function normalizeResolutionSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) throw new Error("Resolution summary is required");
  return trimmed;
}

export function buildSubThreadResolvedMetadata({
  subThreadId,
  subThreadTitle,
  summary,
}: {
  subThreadId: string;
  subThreadTitle: string;
  summary: string;
}) {
  return {
    sub_thread_id: subThreadId,
    sub_thread_title: subThreadTitle,
    summary: normalizeResolutionSummary(summary),
  };
}
```

- [ ] **Step 4: Run the helper test**

Run:

```bash
npx tsx apps/platform/src/lib/thread-status.test.ts
```

Expected: pass with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/thread-status.ts apps/platform/src/lib/thread-status.test.ts
git commit -m "feat(platform): add thread status helpers"
```

---

### Task 4: Add Sub-Thread Server Actions

**Files:**
- Modify: `apps/platform/src/lib/cache.ts`
- Modify: `apps/platform/src/lib/actions/nodes.ts`

- [ ] **Step 1: Add thread-surface cache tag**

Modify `apps/platform/src/lib/cache.ts`:

```ts
export const cacheTags = {
  rootNodes: () => "root-nodes",
  node: (id: string) => `node:${id}`,
  nodePath: (id: string) => `node-path:${id}`,
  threadSurface: (id: string) => `thread-surface:${id}`,
  children: (parentId: string) => `node-children:${parentId}`,
  workspaceBoard: (workspaceId: string) => `workspace-board:${workspaceId}`,
  instanceFields: (instanceId: string) => `instance-fields:${instanceId}`,
  aiStandards: (instanceId: string) => `ai-standards:${instanceId}`,
  workspaceViews: (workspaceId: string) => `workspace-views:${workspaceId}`,
  nodePosts: (nodeId: string) => `posts:${nodeId}`,
  workspaceFeed: (workspaceId: string) => `workspace-feed:${workspaceId}`,
  nodeLinks: (nodeId: string) => `links:${nodeId}`,
  nodeMemoryPrimitives: (nodeId: string) => `memory-primitives:${nodeId}`,
};
```

Add:

```ts
export function revalidateThreadSurface(nodeId: string) {
  revalidateTag(cacheTags.threadSurface(nodeId), PROFILE);
}
```

- [ ] **Step 2: Add action imports**

Modify the import from `../cache` in `apps/platform/src/lib/actions/nodes.ts`:

```ts
import {
  revalidateRootNodes,
  revalidateNode,
  revalidateNodePath,
  revalidateThreadSurface,
  revalidateWorkspaceBoard,
  revalidateNodePosts,
  revalidateWorkspaceFeed,
} from "../cache";
```

Add below existing imports:

```ts
import {
  buildSubThreadResolvedMetadata,
  normalizeResolutionSummary,
} from "../thread-status";
```

- [ ] **Step 3: Add `createSubThread`**

Add after `createCard`:

```ts
export interface CreateSubThreadResult {
  id: string;
}

export async function createSubThread(
  parentThreadId: string,
  workspaceId: string,
  title: string,
  sourcePostId?: string | null
): Promise<CreateSubThreadResult> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Sub-thread title is required");
  const actor = await getCurrentActor();
  await ensureDefaultPlanningFields(actor.instance_id);

  const position = await nextPositionForSibling(parentThreadId);

  const { data: subThread, error } = await supabase
    .from("nodes")
    .insert({
      instance_id: actor.instance_id,
      parent_id: parentThreadId,
      type: "card",
      title: trimmed,
      owner_id: actor.id,
      position,
      thread_resolution_status: "active",
      resolution_source_post_id: sourcePostId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("posts").insert({
    node_id: parentThreadId,
    actor_id: actor.id,
    post_type: "sub_thread_created",
    metadata: {
      sub_thread_id: subThread.id,
      sub_thread_title: trimmed,
      source_post_id: sourcePostId ?? null,
    },
  });

  revalidateNode(parentThreadId, null);
  revalidateNodePath(subThread.id);
  revalidateThreadSurface(parentThreadId);
  revalidateThreadSurface(subThread.id);
  revalidateNodePosts(parentThreadId);
  revalidateWorkspaceBoard(workspaceId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${parentThreadId}`);
  revalidatePath(`/n/${workspaceId}`);
  return { id: subThread.id };
}
```

- [ ] **Step 4: Add resolve/reopen actions**

Add after `createSubThread`:

```ts
export async function resolveSubThread(
  subThreadId: string,
  parentThreadId: string,
  workspaceId: string,
  summary: string
): Promise<void> {
  const normalizedSummary = normalizeResolutionSummary(summary);
  const actor = await getCurrentActor();

  const { data: subThread, error: fetchErr } = await supabase
    .from("nodes")
    .select("id, title, parent_id")
    .eq("id", subThreadId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!subThread) throw new Error("Sub-thread not found");
  if (subThread.parent_id !== parentThreadId) {
    throw new Error("Sub-thread does not belong to this parent thread");
  }

  const { error: updateErr } = await supabase
    .from("nodes")
    .update({
      thread_resolution_status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by_actor_id: actor.id,
      resolution_summary: normalizedSummary,
    })
    .eq("id", subThreadId);
  if (updateErr) throw updateErr;

  await supabase.from("posts").insert({
    node_id: parentThreadId,
    actor_id: actor.id,
    post_type: "sub_thread_resolved",
    metadata: buildSubThreadResolvedMetadata({
      subThreadId,
      subThreadTitle: subThread.title,
      summary: normalizedSummary,
    }),
  });

  revalidateNode(subThreadId, parentThreadId);
  revalidateThreadSurface(parentThreadId);
  revalidateThreadSurface(subThreadId);
  revalidateNodePosts(parentThreadId);
  revalidateWorkspaceBoard(workspaceId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${parentThreadId}`);
  revalidatePath(`/n/${workspaceId}`);
}

export async function reopenSubThread(
  subThreadId: string,
  parentThreadId: string,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase
    .from("nodes")
    .update({
      thread_resolution_status: "reopened",
      resolved_at: null,
    })
    .eq("id", subThreadId)
    .eq("parent_id", parentThreadId);
  if (error) throw error;

  revalidateNode(subThreadId, parentThreadId);
  revalidateThreadSurface(parentThreadId);
  revalidateThreadSurface(subThreadId);
  revalidateWorkspaceBoard(workspaceId);
  revalidateWorkspaceFeed(workspaceId);
  revalidatePath(`/n/${parentThreadId}`);
  revalidatePath(`/n/${workspaceId}`);
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/cache.ts apps/platform/src/lib/actions/nodes.ts
git commit -m "feat(platform): add sub-thread actions"
```

---

### Task 5: Build Thread Surface Read Model

**Files:**
- Create: `apps/platform/src/lib/thread-surface.ts`
- Modify: `apps/platform/src/lib/node-detail.ts`

- [ ] **Step 1: Modify child loading in node detail**

In `apps/platform/src/lib/node-detail.ts`, replace the children query condition that only fetches stack children:

```ts
node.type === "stack"
  ? supabase
      .from("nodes")
      .select("*")
      .eq("parent_id", nodeId)
      .order("position", { ascending: true })
  : Promise.resolve({ data: [] as WorkNode[], error: null }),
```

with:

```ts
supabase
  .from("nodes")
  .select("*")
  .eq("parent_id", nodeId)
  .order("position", { ascending: true }),
```

- [ ] **Step 2: Create thread surface read model**

Create `apps/platform/src/lib/thread-surface.ts`:

```ts
import { unstable_cache } from "next/cache";
import { getActors, getCurrentActor } from "./actor";
import { cacheTags } from "./cache";
import { getNodeLinks, type NodeLinks } from "./links";
import { getNodeMemoryPrimitives } from "./memory-primitives";
import { getNodeDetail, getMirrorTargets } from "./node-detail";
import { getNodePath, type NodePathItem } from "./node-path";
import { getNodePosts, type PostRecord } from "./posts";

export interface ThreadSurfaceData {
  detail: NonNullable<Awaited<ReturnType<typeof getNodeDetail>>>;
  path: NodePathItem[];
  workspaceId: string;
  mirrorTargets: { id: string; title: string; type: string }[];
  posts: PostRecord[];
  links: NodeLinks;
  memoryPrimitives: Awaited<ReturnType<typeof getNodeMemoryPrimitives>>;
  actor: Awaited<ReturnType<typeof getCurrentActor>>;
  actors: Awaited<ReturnType<typeof getActors>>;
}

export async function getThreadSurface(
  nodeId: string
): Promise<ThreadSurfaceData | null> {
  const cached = unstable_cache(
    async (): Promise<ThreadSurfaceData | null> => {
      const [detail, path, actor, actors] = await Promise.all([
        getNodeDetail(nodeId),
        getNodePath(nodeId),
        getCurrentActor(),
        getActors(),
      ]);
      if (!detail) return null;

      const workspaceId = path[0]?.id ?? detail.node.id;
      const mirrorTargetsPromise =
        detail.node.type === "stack" || detail.node.type === "card"
          ? getMirrorTargets(detail.node.instance_id, detail.node.type)
          : Promise.resolve([]);

      const [mirrorTargets, posts, links, memoryPrimitives] = await Promise.all([
        mirrorTargetsPromise,
        getNodePosts(nodeId),
        getNodeLinks(nodeId),
        getNodeMemoryPrimitives(nodeId),
      ]);

      return {
        detail,
        path,
        workspaceId,
        mirrorTargets,
        posts,
        links,
        memoryPrimitives,
        actor,
        actors,
      };
    },
    ["thread-surface", nodeId],
    {
      tags: [cacheTags.threadSurface(nodeId)],
      revalidate: 300,
    }
  );

  return cached();
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/lib/node-detail.ts apps/platform/src/lib/thread-surface.ts
git commit -m "feat(platform): add thread surface read model"
```

---

### Task 6: Extract Reusable Thread Header And Tabs

**Files:**
- Create: `apps/platform/src/components/thread/thread-header.tsx`
- Create: `apps/platform/src/components/thread/thread-tabs.tsx`
- Modify: `apps/platform/src/components/detail-panel.tsx`
- Modify: `apps/platform/src/components/detail-panel-tabs.tsx`

- [ ] **Step 1: Create shared header shell**

Create `apps/platform/src/components/thread/thread-header.tsx`:

```tsx
import Link from "next/link";
import { User } from "lucide-react";
import type { NodePathItem } from "@/lib/node-path";
import type { DetailField, DetailFieldValue } from "@/lib/node-detail";
import type { WorkNode } from "@/lib/types";
import { EditableTitle } from "../editable-title";
import { FieldBadge } from "../field-badge";

export interface ThreadHeaderProps {
  node: WorkNode;
  path: NodePathItem[];
  fields: DetailField[];
  values: DetailFieldValue[];
  owner: { id: string; name: string; kind: string } | null;
  members: { id: string; name: string; kind: string }[];
  workspaceId: string;
  actions?: React.ReactNode;
  viewSwitcher?: React.ReactNode;
}

export function ThreadHeader({
  node,
  path,
  fields,
  values,
  owner,
  members,
  workspaceId,
  actions,
  viewSwitcher,
}: ThreadHeaderProps) {
  const headerBadges = getHeaderBadges(fields, values);

  return (
    <div className="shrink-0 border-b border-border px-6 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <ThreadPath path={path} workspaceId={workspaceId} />
          {node.archived_at && (
            <span className="mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-bg-hover text-text-tertiary">
              Archived
            </span>
          )}
          <div className="mt-1">
            <EditableTitle
              nodeId={node.id}
              workspaceId={workspaceId}
              parentId={node.parent_id}
              initialTitle={node.title}
            />
          </div>
          {headerBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {headerBadges.map((badge) => (
                <FieldBadge key={badge.id} name={badge.name} color={badge.color} />
              ))}
            </div>
          )}
          <OwnerMembersRow owner={owner} members={members} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewSwitcher}
          {actions}
        </div>
      </div>
    </div>
  );
}

function ThreadPath({
  path,
  workspaceId,
}: {
  path: NodePathItem[];
  workspaceId: string;
}) {
  if (path.length === 0) return null;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-text-tertiary">
      {path.map((item, index) => {
        const isLast = index === path.length - 1;
        return (
          <span key={item.id} className="flex items-center gap-1">
            {index > 0 && <span>/</span>}
            {isLast ? (
              <span className="max-w-[180px] truncate font-medium text-text-secondary">
                {item.title}
              </span>
            ) : (
              <Link
                href={`/n/${item.id}`}
                className="max-w-[180px] truncate transition-colors hover:text-text-primary"
                scroll={false}
              >
                {item.title}
              </Link>
            )}
          </span>
        );
      })}
      {path.length === 1 && (
        <Link
          href={`/n/${workspaceId}?view=board`}
          className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          Board
        </Link>
      )}
    </nav>
  );
}

function OwnerMembersRow({
  owner,
  members,
}: {
  owner: { id: string; name: string; kind: string } | null;
  members: { id: string; name: string; kind: string }[];
}) {
  const all = [
    ...(owner ? [{ ...owner, isOwner: true }] : []),
    ...members.filter((member) => member.id !== owner?.id).map((member) => ({ ...member, isOwner: false })),
  ];
  if (all.length === 0) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {all.map((actor) => (
        <ActorChip
          key={actor.id}
          name={actor.name}
          kind={actor.kind}
          isOwner={actor.isOwner}
        />
      ))}
    </div>
  );
}

function ActorChip({
  name,
  kind,
  isOwner,
}: {
  name: string;
  kind: string;
  isOwner: boolean;
}) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      title={`${name}${isOwner ? " (owner)" : ""}`}
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
        kind === "agent"
          ? "ring-2 ring-agent-accent bg-bg-hover text-text-secondary"
          : "bg-bg-hover text-text-secondary",
      ].join(" ")}
    >
      {initials || <User size={10} />}
    </div>
  );
}

function getHeaderBadges(fields: DetailField[], values: DetailFieldValue[]) {
  const valuesByField = new Map<string, DetailFieldValue[]>();
  for (const value of values) {
    const fieldValues = valuesByField.get(value.field_id) ?? [];
    fieldValues.push(value);
    valuesByField.set(value.field_id, fieldValues);
  }

  const badges: { id: string; name: string; color: string }[] = [];
  for (const field of fields) {
    const fieldValues = valuesByField.get(field.id) ?? [];
    for (const value of fieldValues) {
      if (!value.option_id) continue;
      const option = field.options.find((candidate) => candidate.id === value.option_id);
      if (option) badges.push({ id: `${field.id}:${option.id}`, name: option.name, color: field.color });
    }
  }
  return badges;
}
```

- [ ] **Step 2: Create full-page tab wrapper**

Create `apps/platform/src/components/thread/thread-tabs.tsx`:

```tsx
"use client";

import { useState } from "react";

type TabId = "posts" | "subthreads" | "fields" | "memory" | "tree";

export interface ThreadTabsProps {
  postsContent: React.ReactNode;
  subThreadsContent: React.ReactNode;
  fieldsContent: React.ReactNode;
  memoryContent: React.ReactNode;
  treeContent: React.ReactNode;
}

export function ThreadTabs({
  postsContent,
  subThreadsContent,
  fieldsContent,
  memoryContent,
  treeContent,
}: ThreadTabsProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "posts", label: "Thread" },
    { id: "subthreads", label: "Sub-threads" },
    { id: "fields", label: "Fields" },
    { id: "memory", label: "Memory" },
    { id: "tree", label: "Tree" },
  ];

  const [active, setActive] = useState<TabId>("posts");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex gap-0 border-b border-border px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={[
              "border-b-2 -mb-px px-3 py-2 text-sm font-medium transition-colors",
              active === tab.id
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={active === "posts" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-auto"}>
        {active === "posts" && postsContent}
        {active === "subthreads" && subThreadsContent}
        {active === "fields" && fieldsContent}
        {active === "memory" && memoryContent}
        {active === "tree" && treeContent}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Compile before wiring**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/components/thread/thread-header.tsx apps/platform/src/components/thread/thread-tabs.tsx
git commit -m "feat(platform): add thread header and tabs"
```

---

### Task 7: Build Sub-Thread List And Actions

**Files:**
- Create: `apps/platform/src/components/thread/sub-thread-actions.tsx`
- Create: `apps/platform/src/components/thread/sub-thread-list.tsx`

- [ ] **Step 1: Create client actions**

Create `apps/platform/src/components/thread/sub-thread-actions.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, GitBranchPlus, RotateCcw } from "lucide-react";
import {
  createSubThread,
  reopenSubThread,
  resolveSubThread,
} from "@/lib/actions/nodes";

export function AddSubThreadInline({
  parentThreadId,
  workspaceId,
}: {
  parentThreadId: string;
  workspaceId: string;
}) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="flex items-center gap-2 rounded-md border border-border bg-bg-card px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        startTransition(async () => {
          const result = await createSubThread(parentThreadId, workspaceId, trimmed);
          setTitle("");
          router.push(`/n/${result.id}`);
        });
      }}
    >
      <GitBranchPlus size={14} className="text-text-tertiary" />
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Start sub-thread"
        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
      />
      <button
        type="submit"
        disabled={pending || title.trim().length === 0}
        className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Start
      </button>
    </form>
  );
}

export function ResolveSubThreadButton({
  subThreadId,
  parentThreadId,
  workspaceId,
  defaultSummary,
}: {
  subThreadId: string;
  parentThreadId: string;
  workspaceId: string;
  defaultSummary: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const summary = window.prompt("Resolution summary", defaultSummary);
        if (!summary) return;
        startTransition(async () => {
          await resolveSubThread(subThreadId, parentThreadId, workspaceId, summary);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
    >
      <CheckCircle2 size={13} />
      Resolve
    </button>
  );
}

export function ReopenSubThreadButton({
  subThreadId,
  parentThreadId,
  workspaceId,
}: {
  subThreadId: string;
  parentThreadId: string;
  workspaceId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await reopenSubThread(subThreadId, parentThreadId, workspaceId);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
    >
      <RotateCcw size={13} />
      Reopen
    </button>
  );
}
```

- [ ] **Step 2: Create sub-thread list**

Create `apps/platform/src/components/thread/sub-thread-list.tsx`:

```tsx
import Link from "next/link";
import { GitBranch, Clock3 } from "lucide-react";
import type { WorkNode } from "@/lib/types";
import { getThreadStatusLabel } from "@/lib/thread-status";
import {
  AddSubThreadInline,
  ReopenSubThreadButton,
  ResolveSubThreadButton,
} from "./sub-thread-actions";

export function SubThreadList({
  parentThreadId,
  workspaceId,
  subThreads,
}: {
  parentThreadId: string;
  workspaceId: string;
  subThreads: WorkNode[];
}) {
  const visible = subThreads.filter((thread) => !thread.archived_at);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-5">
      <AddSubThreadInline parentThreadId={parentThreadId} workspaceId={workspaceId} />
      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
          No sub-threads yet.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((thread) => (
            <SubThreadBlock
              key={thread.id}
              thread={thread}
              parentThreadId={parentThreadId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubThreadBlock({
  thread,
  parentThreadId,
  workspaceId,
}: {
  thread: WorkNode;
  parentThreadId: string;
  workspaceId: string;
}) {
  const isResolved = thread.thread_resolution_status === "resolved";
  const timestamp = new Date(thread.updated_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article className="group rounded-md border border-border bg-bg-card transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <Link href={`/n/${thread.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GitBranch
              size={14}
              className={isResolved ? "text-status-done" : "text-accent"}
            />
            <h3 className="truncate text-sm font-medium text-text-primary">
              {thread.title}
            </h3>
            <span
              className={[
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                isResolved
                  ? "bg-status-done/10 text-status-done"
                  : "bg-accent-subtle text-accent",
              ].join(" ")}
            >
              {getThreadStatusLabel(thread.thread_resolution_status)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-text-tertiary">
            <Clock3 size={11} />
            <span>{timestamp}</span>
          </div>
          {thread.resolution_summary && (
            <p className="mt-2 text-sm text-text-secondary">
              {thread.resolution_summary}
            </p>
          )}
        </Link>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {isResolved ? (
            <ReopenSubThreadButton
              subThreadId={thread.id}
              parentThreadId={parentThreadId}
              workspaceId={workspaceId}
            />
          ) : (
            <ResolveSubThreadButton
              subThreadId={thread.id}
              parentThreadId={parentThreadId}
              workspaceId={workspaceId}
              defaultSummary={`${thread.title} resolved:`}
            />
          )}
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/components/thread/sub-thread-actions.tsx apps/platform/src/components/thread/sub-thread-list.tsx
git commit -m "feat(platform): add sub-thread list"
```

---

### Task 8: Add Tree And Search Safety Net

**Files:**
- Create: `apps/platform/src/components/thread/thread-tree.tsx`
- Create: `apps/platform/src/components/thread/thread-search.tsx`

- [ ] **Step 1: Create current-slice tree component**

Create `apps/platform/src/components/thread/thread-tree.tsx`:

```tsx
import Link from "next/link";
import { Search } from "lucide-react";
import type { WorkNode } from "@/lib/types";
import { ThreadSearch } from "./thread-search";

export function ThreadTree({
  currentThreadId,
  children,
}: {
  currentThreadId: string;
  children: WorkNode[];
}) {
  const visible = children.filter((child) => !child.archived_at);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-text-primary">
        <Search size={15} className="text-text-tertiary" />
        Find work in this thread
      </div>
      <ThreadSearch currentThreadId={currentThreadId} items={visible} />
      <div className="mt-5">
        <div className="section-label">Sub-threads</div>
        {visible.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
            Nothing nested here yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-bg-card">
            {visible.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/n/${child.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-bg-hover"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                    {child.title}
                  </span>
                  <span className="shrink-0 text-xs text-text-tertiary">
                    {child.thread_resolution_status === "resolved" ? "Resolved" : "Unresolved"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create client-side current-slice search**

Create `apps/platform/src/components/thread/thread-search.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WorkNode } from "@/lib/types";

export function ThreadSearch({
  currentThreadId,
  items,
}: {
  currentThreadId: string;
  items: WorkNode[];
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return [];
    return items.filter((item) =>
      [item.title, item.description ?? ""].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    );
  }, [items, normalized]);

  return (
    <div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search this thread"
        className="w-full rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent"
      />
      {normalized && (
        <div className="mt-2 rounded-md border border-border bg-bg-card">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-secondary">
              No matches in this thread.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {matches.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/n/${item.id}`}
                    className="block px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-hover"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!normalized && (
        <p className="mt-2 text-xs text-text-tertiary">
          Showing work nested directly under this thread.
        </p>
      )}
      <Link
        href={`/n/${currentThreadId}`}
        className="sr-only"
      >
        Current thread
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/components/thread/thread-tree.tsx apps/platform/src/components/thread/thread-search.tsx
git commit -m "feat(platform): add thread tree search"
```

---

### Task 9: Build Full-Page Thread Surface

**Files:**
- Create: `apps/platform/src/components/thread/thread-surface.tsx`
- Modify: `apps/platform/src/components/detail-panel.tsx`

- [ ] **Step 1: Export field content helpers from detail panel**

In `apps/platform/src/components/detail-panel.tsx`, export `FieldsTabContent`:

```tsx
export function FieldsTabContent({
  node,
  owner,
  fields,
  values,
  workspaceId,
  mirrorPlacements,
  mirrorTargets,
  homeWorkspaceId,
  links,
}: {
  node: WorkNode;
  owner: { name: string } | null;
  fields: DetailField[];
  values: DetailFieldValue[];
  workspaceId: string;
  mirrorPlacements: NodeMirrorPlacement[];
  mirrorTargets: { id: string; title: string; type: string }[];
  homeWorkspaceId: string;
  links: NodeLinks;
}) {
```

Keep the function body unchanged.

- [ ] **Step 2: Create thread surface**

Create `apps/platform/src/components/thread/thread-surface.tsx`:

```tsx
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { getThreadSurface } from "@/lib/thread-surface";
import { MemoryPrimitivesTabContent } from "../memory-primitives-tab-content";
import { PostsTabContent } from "../posts-tab-content";
import { FieldsTabContent } from "../detail-panel";
import { NodeActions } from "../node-actions";
import { ThreadHeader } from "./thread-header";
import { ThreadTabs } from "./thread-tabs";
import { SubThreadList } from "./sub-thread-list";
import { ThreadTree } from "./thread-tree";

export async function ThreadSurface({ nodeId }: { nodeId: string }) {
  const data = await getThreadSurface(nodeId);

  if (!data) {
    return (
      <main className="flex h-full items-center justify-center px-6 text-sm text-text-secondary">
        Thread not found.
      </main>
    );
  }

  const {
    detail,
    path,
    workspaceId,
    mirrorTargets,
    posts,
    links,
    memoryPrimitives,
    actor,
    actors,
  } = data;
  const { node, owner, members, fields, values, children, childFieldValues, mirrorPlacements } = detail;
  const homePlacement = mirrorPlacements.find((placement) => placement.is_home);
  const homeWorkspaceId = homePlacement?.parent.id ?? workspaceId;
  const isHomeContext = homeWorkspaceId === workspaceId;
  const isMirrored = mirrorPlacements.length > 1;

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary">
      <ThreadHeader
        node={node}
        path={path}
        fields={fields}
        values={values}
        owner={owner}
        members={members}
        workspaceId={workspaceId}
        viewSwitcher={
          path.length === 1 ? (
            <Link
              href={`/n/${node.id}?view=board`}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <LayoutGrid size={14} />
              Board
            </Link>
          ) : null
        }
        actions={
          node.type === "workspace" ? null : (
            <NodeActions
              nodeId={node.id}
              workspaceId={workspaceId}
              parentId={node.parent_id}
              nodeType={node.type as "card" | "stack"}
              isArchived={!!node.archived_at}
              closeHref={`/n/${workspaceId}`}
              isHomeContext={isHomeContext}
              isMirrored={isMirrored}
              homeWorkspaceId={homeWorkspaceId}
            />
          )
        }
      />
      <ThreadTabs
        postsContent={
          <PostsTabContent
            nodeId={node.id}
            workspaceId={workspaceId}
            initialPosts={posts}
            currentActorId={actor.id}
            currentActorName={actor.name}
            actors={actors}
          />
        }
        subThreadsContent={
          <SubThreadList
            parentThreadId={node.id}
            workspaceId={workspaceId}
            subThreads={children}
          />
        }
        fieldsContent={
          <FieldsTabContent
            node={node}
            owner={owner}
            fields={fields}
            values={values}
            workspaceId={workspaceId}
            mirrorPlacements={mirrorPlacements}
            mirrorTargets={mirrorTargets}
            homeWorkspaceId={homeWorkspaceId}
            links={links}
          />
        }
        memoryContent={
          <MemoryPrimitivesTabContent
            nodeId={node.id}
            workspaceId={workspaceId}
            initialPrimitives={memoryPrimitives}
          />
        }
        treeContent={
          <ThreadTree
            currentThreadId={node.id}
            children={children}
          />
        }
      />
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/components/detail-panel.tsx apps/platform/src/components/thread/thread-surface.tsx
git commit -m "feat(platform): add full-page thread surface"
```

---

### Task 10: Make Thread Surface The Default Route

**Files:**
- Modify: `apps/platform/src/app/n/[id]/page.tsx`

- [ ] **Step 1: Update route search params type**

In `apps/platform/src/app/n/[id]/page.tsx`, change:

```ts
searchParams: Promise<{ d?: string }>;
```

to:

```ts
searchParams: Promise<{ d?: string; view?: string }>;
```

- [ ] **Step 2: Import thread surface**

Add:

```ts
import { ThreadSurface } from "@/components/thread/thread-surface";
```

- [ ] **Step 3: Render thread surface by default**

Replace the `if (node.type === "workspace")` block and the non-workspace fallback with this structure:

```tsx
const { d: detailId, view } = await searchParams;
const node = await getNode(id);
if (!node) notFound();

if (node.type === "workspace" && view === "board") {
  const [board, views] = await Promise.all([
    getWorkspaceBoard(id),
    getWorkspaceViews(id),
  ]);
  if (!board) notFound();
  return (
    <div className="h-full min-h-0">
      <ResizablePanelGroup
        board={
          <div className="flex h-full min-h-0 flex-col">
            <WorkspaceHeader title={node.title} description={node.description} />
            <div className="min-h-0 flex-1">
              <Board data={board} views={views} />
            </div>
          </div>
        }
        detail={
          detailId ? (
            <Suspense key={detailId} fallback={<DetailPanelSkeleton />}>
              <DetailPanel nodeId={detailId} workspaceId={id} closeHref={`/n/${id}?view=board`} />
            </Suspense>
          ) : null
        }
      />
    </div>
  );
}

return <ThreadSurface nodeId={id} />;
```

Remove the old non-workspace children-list JSX because `ThreadSurface` replaces it.

- [ ] **Step 4: Remove unused imports**

Remove imports that become unused:

```ts
import Link from "next/link";
import { getChildren } from "@/lib/nodes";
```

Keep:

```ts
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getNode } from "@/lib/nodes";
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add 'apps/platform/src/app/n/[id]/page.tsx'
git commit -m "feat(platform): make threads the default node view"
```

---

### Task 11: Update User-Facing Sidebar Copy

**Files:**
- Modify: `apps/platform/src/components/sidebar.tsx`

- [ ] **Step 1: Replace visible workspace-only labels**

In `apps/platform/src/components/sidebar.tsx`, make these user-facing changes while preserving data behavior:

```tsx
// Before visible copy examples:
"Workspaces"
"Add workspace"
"New workspace"

// After:
"Threads"
"Add thread"
"New thread"
```

Do not rename functions or variables in this task unless TypeScript requires it. The goal is product language, not a structural rewrite.

- [ ] **Step 2: Keep root-node creation behavior**

Ensure the inline create action still calls `createWorkspace(title)` for root items. Add this code comment above the call if the mismatch is confusing:

```ts
// Root threads are still stored as workspace-type nodes for compatibility.
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/components/sidebar.tsx
git commit -m "feat(platform): update sidebar thread language"
```

---

### Task 12: Verify Thread-Primary Flow

**Files:**
- Test commands only.

- [ ] **Step 1: Run focused assertion tests**

Run:

```bash
npx tsx apps/platform/src/lib/node-path.test.ts
npx tsx apps/platform/src/lib/thread-status.test.ts
npx tsx apps/platform/src/lib/panel-resize.test.ts
npx tsx apps/platform/src/components/posts-tab-content.test.ts
```

Expected: each command exits 0 with no output.

- [ ] **Step 2: Run full platform typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: pass.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm --workspace @workos/platform run dev
```

Expected: Next dev server starts and prints a local URL.

- [ ] **Step 4: Manual smoke test in browser**

Open the local URL and verify:

- `/n/<root-thread-id>` shows the full-page thread surface.
- Header path is visible.
- The `Thread` tab shows existing posts and composer.
- The `Sub-threads` tab lists existing children.
- Creating a sub-thread navigates to `/n/<new-sub-thread-id>`.
- Resolving a sub-thread marks it resolved and leaves a summary visible on the parent.
- `/n/<workspace-id>?view=board` still shows the existing board.
- Opening a card from board view still uses the right-side detail panel.
- The `Tree` tab lets the user find directly nested work.

- [ ] **Step 5: Commit any smoke-test fixes**

If the smoke test required changes:

```bash
git add apps/platform/src
git commit -m "fix(platform): polish thread-primary smoke flow"
```

If no changes were needed, do not create an empty commit.

---

## Self-Review Notes

Spec coverage:

- Thread-primary main surface: Tasks 5, 6, 9, 10.
- Existing side panel as foundation: Tasks 6 and 9.
- Sub-thread creation and unresolved blocks: Tasks 4 and 7.
- Resolved linked summaries: Tasks 2, 3, 4, 7.
- Path navigation: Tasks 1, 6, 10.
- Board preserved as alternate view: Task 10.
- Findability/tree safety: Task 8.
- User-facing thread language: Task 11.
- Finiti compatibility: preserved by keeping threads, sub-threads, actions, fields, artifacts, and summaries composable; no workflow builder work is included in this v0.

Known limits:

- Search is current-slice only, not global.
- Resolved summaries are visible in sub-thread blocks and parent activity posts; richer inline stream rendering can be designed after v0.
- Mixed-altitude board composition remains future work.
- LLM adaptive pinning suggestions remain future work.
