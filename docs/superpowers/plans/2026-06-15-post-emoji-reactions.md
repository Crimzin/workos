# Post Emoji Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dense, Slack-style emoji reactions to normal WorkOS posts without adding any new rows or vertical chrome.

**Architecture:** Store reactions in a normalized `post_reactions` table, read raw rows with posts, and group them into summaries in TypeScript. Render reaction chips and the add-emoji picker trigger inside the existing `PostItem` bottom-right action row only.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Tailwind CSS tokens, `emoji-picker-react`, Node assert tests.

---

## File Structure

- Create `apps/platform/supabase/migrations/0025_post_reactions.sql`: normalized reaction table and indexes.
- Create `apps/platform/src/lib/post-reactions.ts`: pure types and grouping/validation helpers.
- Create `apps/platform/src/lib/post-reactions.test.ts`: Node assert tests for grouping and validation.
- Modify `apps/platform/src/lib/posts.ts`: extend `PostRecord`, fetch raw reactions, group summaries.
- Modify `apps/platform/src/lib/actions/posts.ts`: pass current actor into polling and add `togglePostReaction`.
- Modify `apps/platform/src/components/post-item.tsx`: render inline reaction chips and add-emoji trigger in the existing action row.
- Modify `apps/platform/src/components/posts-tab-content.tsx`: keep post list state coherent after reaction toggles.
- Modify `apps/platform/src/components/workspace-feed.tsx`: pass reaction updates into `PostItem` in feed surfaces.
- Modify UI-facing post callers in `apps/platform/src/components/detail-panel.tsx`, `apps/platform/src/lib/thread-surface.ts`, and `apps/platform/src/app/feed/page.tsx` to pass `currentActorId`.
- Modify `apps/platform/package.json` and root `package-lock.json`: add `emoji-picker-react`.

## Task 1: Pure Reaction Helpers

**Files:**
- Create: `apps/platform/src/lib/post-reactions.test.ts`
- Create: `apps/platform/src/lib/post-reactions.ts`

- [ ] **Step 1: Write failing grouping and validation tests**

Create `apps/platform/src/lib/post-reactions.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  groupPostReactions,
  isValidReactionEmoji,
  type RawPostReaction,
} from "./post-reactions";

const rows: RawPostReaction[] = [
  {
    id: "reaction-1",
    post_id: "post-1",
    actor_id: "actor-1",
    emoji: "👍",
    created_at: "2026-06-15T10:00:00.000Z",
    actor: { id: "actor-1", name: "Will", kind: "human" },
  },
  {
    id: "reaction-2",
    post_id: "post-1",
    actor_id: "actor-2",
    emoji: "👍",
    created_at: "2026-06-15T10:02:00.000Z",
    actor: { id: "actor-2", name: "Claude", kind: "agent" },
  },
  {
    id: "reaction-3",
    post_id: "post-1",
    actor_id: "actor-3",
    emoji: "✅",
    created_at: "2026-06-15T10:01:00.000Z",
    actor: { id: "actor-3", name: "Sam", kind: "human" },
  },
];

assert.deepEqual(groupPostReactions(rows, "actor-2"), [
  {
    emoji: "👍",
    count: 2,
    actorIds: ["actor-1", "actor-2"],
    actorNames: ["Will", "Claude"],
    reactedByCurrentActor: true,
  },
  {
    emoji: "✅",
    count: 1,
    actorIds: ["actor-3"],
    actorNames: ["Sam"],
    reactedByCurrentActor: false,
  },
]);

assert.equal(isValidReactionEmoji("👍"), true);
assert.equal(isValidReactionEmoji("✅"), true);
assert.equal(isValidReactionEmoji("not-an-emoji"), false);
assert.equal(isValidReactionEmoji(""), false);
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd apps/platform
npx tsx src/lib/post-reactions.test.ts
```

Expected: FAIL because `./post-reactions` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `apps/platform/src/lib/post-reactions.ts`:

```ts
export interface RawPostReaction {
  id: string;
  post_id: string;
  actor_id: string;
  emoji: string;
  created_at: string;
  actor: { id: string; name: string; kind: string } | null;
}

export interface PostReactionSummary {
  emoji: string;
  count: number;
  actorIds: string[];
  actorNames: string[];
  reactedByCurrentActor: boolean;
}

interface ReactionGroup {
  emoji: string;
  firstCreatedAt: string;
  actorIds: string[];
  actorNames: string[];
}

export function groupPostReactions(
  reactions: RawPostReaction[] | null | undefined,
  currentActorId: string | null = null
): PostReactionSummary[] {
  const groups = new Map<string, ReactionGroup>();

  for (const reaction of reactions ?? []) {
    const existing = groups.get(reaction.emoji);
    const actorName = reaction.actor?.name ?? "Unknown";

    if (!existing) {
      groups.set(reaction.emoji, {
        emoji: reaction.emoji,
        firstCreatedAt: reaction.created_at,
        actorIds: [reaction.actor_id],
        actorNames: [actorName],
      });
      continue;
    }

    existing.actorIds.push(reaction.actor_id);
    existing.actorNames.push(actorName);
    if (reaction.created_at < existing.firstCreatedAt) {
      existing.firstCreatedAt = reaction.created_at;
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.firstCreatedAt.localeCompare(b.firstCreatedAt))
    .map((group) => ({
      emoji: group.emoji,
      count: group.actorIds.length,
      actorIds: group.actorIds,
      actorNames: group.actorNames,
      reactedByCurrentActor: currentActorId
        ? group.actorIds.includes(currentActorId)
        : false,
    }));
}

export function isValidReactionEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return false;
  return /\p{Extended_Pictographic}/u.test(trimmed);
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
cd apps/platform
npx tsx src/lib/post-reactions.test.ts
```

Expected: PASS with no output.

## Task 2: Database Migration

**Files:**
- Create: `apps/platform/supabase/migrations/0025_post_reactions.sql`

- [ ] **Step 1: Create the migration**

Create `apps/platform/supabase/migrations/0025_post_reactions.sql`:

```sql
create table if not exists post_reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  actor_id   uuid not null references actors(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, actor_id, emoji)
);

create index if not exists post_reactions_post_id_emoji_idx
  on post_reactions(post_id, emoji);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Verify migration numbering**

Run:

```bash
find apps/platform/supabase/migrations -maxdepth 1 -type f | sort | tail -n 3
```

Expected: includes `0023_seed_codex_agent.sql`, `0024_node_pins.sql`, and `0025_post_reactions.sql`.

## Task 3: Read Reactions With Posts

**Files:**
- Modify: `apps/platform/src/lib/posts.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Modify: `apps/platform/src/components/detail-panel.tsx`
- Modify: `apps/platform/src/lib/thread-surface.ts`
- Modify: `apps/platform/src/app/feed/page.tsx`

- [ ] **Step 1: Update post types and selectors**

In `apps/platform/src/lib/posts.ts`, import the helper types and extend `PostRecord`:

```ts
import {
  groupPostReactions,
  type PostReactionSummary,
  type RawPostReaction,
} from "./post-reactions";

export interface PostRecord {
  // existing fields...
  actor: { id: string; name: string; kind: string } | null;
  reactions: PostReactionSummary[];
}
```

Add a selector constant:

```ts
const POST_WITH_RELATIONS_SELECT =
  "*, actor:actors(id,name,kind), reactions:post_reactions(id,post_id,actor_id,emoji,created_at,actor:actors(id,name,kind))";
```

Add a mapper:

```ts
type PostWithRawReactions = Omit<PostRecord, "reactions"> & {
  reactions?: RawPostReaction[] | null;
};

function withGroupedReactions<T extends PostWithRawReactions>(
  posts: T[],
  currentActorId: string | null = null
): Array<Omit<T, "reactions"> & { reactions: PostReactionSummary[] }> {
  return posts.map((post) => ({
    ...post,
    reactions: groupPostReactions(post.reactions, currentActorId),
  }));
}
```

- [ ] **Step 2: Thread currentActorId through reads**

Change signatures and selects:

```ts
export async function getNodePosts(
  nodeId: string,
  currentActorId: string | null = null
): Promise<PostRecord[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_WITH_RELATIONS_SELECT)
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withGroupedReactions((data ?? []) as PostWithRawReactions[], currentActorId) as PostRecord[];
}
```

Update `getWorkspaceFeed(workspaceId, scope, currentActorId = null)` similarly, using:

```ts
"*, actor:actors(id,name,kind), node:nodes!posts_node_id_fkey(id,title,type), reactions:post_reactions(id,post_id,actor_id,emoji,created_at,actor:actors(id,name,kind))"
```

- [ ] **Step 3: Update UI-facing callers**

Pass `actor.id` into UI reads:

```ts
detail ? getNodePosts(nodeId, actor.id) : Promise.resolve([])
```

```ts
getNodePosts(nodeId, actor.id)
```

```ts
await getWorkspaceFeed(fallbackWorkspaceId, "all", actor.id)
```

Leave non-UI agent context calls as `getNodePosts(nodeId)`.

- [ ] **Step 4: Update polling server action**

In `apps/platform/src/lib/actions/posts.ts`, change `pollNodePosts`:

```ts
export async function pollNodePosts(nodeId: string): Promise<PostRecord[]> {
  const actor = await getCurrentActor();
  return getNodePosts(nodeId, actor.id);
}
```

- [ ] **Step 5: Typecheck**

Run:

```bash
cd apps/platform
npx tsc --noEmit
```

Expected: no TypeScript errors from post read shape changes.

## Task 4: Toggle Server Action

**Files:**
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Modify: `apps/platform/src/lib/posts.ts`

- [ ] **Step 1: Add single-post reaction reader**

In `apps/platform/src/lib/posts.ts`, export:

```ts
export async function getPostReactionSummaries(
  postId: string,
  currentActorId: string | null = null
): Promise<PostReactionSummary[]> {
  const { data, error } = await supabase
    .from("post_reactions")
    .select("id,post_id,actor_id,emoji,created_at,actor:actors(id,name,kind)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return groupPostReactions((data ?? []) as RawPostReaction[], currentActorId);
}
```

- [ ] **Step 2: Add `togglePostReaction`**

In `apps/platform/src/lib/actions/posts.ts`, import `isValidReactionEmoji`, `type PostReactionSummary`, and `getPostReactionSummaries`. Add:

```ts
export async function togglePostReaction(
  postId: string,
  nodeId: string,
  workspaceId: string,
  emoji: string
): Promise<PostReactionSummary[]> {
  const normalizedEmoji = emoji.trim();
  if (!isValidReactionEmoji(normalizedEmoji)) {
    throw new Error("Invalid reaction emoji.");
  }

  const actor = await getCurrentActor();
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id,post_type")
    .eq("id", postId)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (postError) throw postError;
  if (!post || post.post_type !== "post") {
    throw new Error("Reactions are only available on normal posts.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("actor_id", actor.id)
    .eq("emoji", normalizedEmoji)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("post_reactions").insert({
      post_id: postId,
      actor_id: actor.id,
      emoji: normalizedEmoji,
    });
    if (error) throw error;
  }

  revalidateNodePosts(nodeId);
  revalidateWorkspaceFeed(workspaceId);
  return getPostReactionSummaries(postId, actor.id);
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
cd apps/platform
npx tsc --noEmit
```

Expected: no TypeScript errors.

## Task 5: Inline Reaction UI

**Files:**
- Modify: `apps/platform/package.json`
- Modify: `package-lock.json`
- Modify: `apps/platform/src/components/post-item.tsx`
- Modify: `apps/platform/src/components/posts-tab-content.tsx`
- Modify: `apps/platform/src/components/workspace-feed.tsx`

- [ ] **Step 1: Install picker dependency**

Run:

```bash
npm install emoji-picker-react --workspace @workos/platform
```

Expected: `apps/platform/package.json` and root `package-lock.json` update.

- [ ] **Step 2: Update post state callback**

In `PostsTabContent`, pass:

```tsx
onReactionUpdate={(postId, reactions) => {
  setPosts((prev) =>
    prev.map((p) => (p.id === postId ? { ...p, reactions } : p))
  );
}}
```

Add the same callback pattern inside `WorkspaceFeed`, using local feed state if needed so feed items update without refresh.

- [ ] **Step 3: Add inline controls in `PostItem`**

In `PostItem`, import:

```ts
import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import { SmilePlus } from "lucide-react";
import type { PostReactionSummary } from "@/lib/post-reactions";
import { togglePostReaction } from "@/lib/actions/posts";
```

Extend props:

```ts
onReactionUpdate?: (postId: string, reactions: PostReactionSummary[]) => void;
```

Add state and handlers:

```ts
const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
const [reactionPending, startReactionTransition] = useTransition();

const handleToggleReaction = (emoji: string) => {
  startReactionTransition(async () => {
    const reactions = await togglePostReaction(post.id, nodeId, workspaceId, emoji);
    onReactionUpdate?.(post.id, reactions);
  });
};

const handleEmojiClick = (emojiData: EmojiClickData) => {
  handleToggleReaction(emojiData.emoji);
  setReactionPickerOpen(false);
};
```

Inside the existing bottom-right action row, before copy/export actions, render normal-post-only reaction chips and picker trigger:

```tsx
{!isActivity &&
  post.reactions.map((reaction) => (
    <button
      key={reaction.emoji}
      type="button"
      disabled={reactionPending}
      onClick={() => handleToggleReaction(reaction.emoji)}
      title={reaction.actorNames.join(", ")}
      className={[
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] transition-colors hover:bg-bg-hover",
        reaction.reactedByCurrentActor
          ? "border border-accent/50 bg-accent-subtle text-accent"
          : "border border-border bg-bg-card text-text-secondary hover:text-text-primary",
      ].join(" ")}
    >
      <span>{reaction.emoji}</span>
      <span>{reaction.count}</span>
    </button>
  ))}
{!isActivity && (
  <div className="relative">
    <button
      type="button"
      disabled={reactionPending}
      onClick={() => setReactionPickerOpen((v) => !v)}
      title="Add reaction"
      className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
    >
      <SmilePlus size={12} />
    </button>
    {reactionPickerOpen && (
      <div className="absolute bottom-7 right-0 z-50 rounded-md border border-border bg-bg-card shadow-lg">
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          width={320}
          height={380}
          theme={Theme.AUTO}
          previewConfig={{ showPreview: false }}
        />
      </div>
    )}
  </div>
)}
```

Add Escape/outside click handling if the picker remains open after focus leaves.

- [ ] **Step 4: Verify no added row**

Run:

```bash
rg -n "reaction row|post-reaction-row|mt-.*reaction|reactions.map" apps/platform/src/components/post-item.tsx
```

Expected: no separate reaction-row class or under-body reaction container; `reactions.map` appears inside the existing action row.

## Task 6: Verification And Cleanup

**Files:**
- All changed implementation files.

- [ ] **Step 1: Run helper test**

Run:

```bash
cd apps/platform
npx tsx src/lib/post-reactions.test.ts
```

Expected: PASS with no output.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
cd apps/platform
npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run lint**

Run:

```bash
cd apps/platform
npm run lint
```

Expected: lint passes, or only unrelated pre-existing issues are documented.

- [ ] **Step 4: Review diff for unrelated changes**

Run:

```bash
git diff --stat
git status --short
```

Expected: changed files match this plan, except pre-existing unrelated working tree files that are left untouched.
