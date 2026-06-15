# Post Emoji Reactions Design

## Summary

Add Slack-style emoji reactions to normal posts in WorkOS Core. The first version shows grouped emoji chips with counts, current-actor highlighting, actor-name tooltips, and an add-emoji action inside the existing post action/icon row. Activity posts such as `card_created`, `link_created`, and sub-thread events do not support reactions.

The implementation will outsource only the comprehensive emoji picker to `emoji-picker-react`. Reaction storage, grouping, and chip rendering stay native to WorkOS so the feature follows the existing post surface, actor model, design tokens, and Supabase patterns.

## Goals

- Let the current actor add and remove emoji reactions on normal posts.
- Show grouped reaction counts like `👍 3`.
- Highlight reactions that include the current actor.
- Let users see who reacted through a lightweight tooltip.
- Use a full free emoji picker instead of a curated reaction list.
- Keep the first version closer to the simple Slack reaction bar than Slack's hover quick-reaction toolbar.

## Non-Goals

- No reactions on activity posts.
- No quick-reaction hover toolbar in the first version.
- No new reaction row, no under-post reaction strip, and no added vertical space.
- No custom emoji management.
- No rich reaction details popover.
- No changes to post editing, pinning, deletion, export, or agent streaming behavior beyond preserving reaction data in post reads.

## Data Model

Create `apps/platform/supabase/migrations/0025_post_reactions.sql`.

Add a `post_reactions` table:

```sql
create table if not exists post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  actor_id uuid not null references actors(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, actor_id, emoji)
);

create index if not exists post_reactions_post_id_emoji_idx
  on post_reactions(post_id, emoji);

notify pgrst, 'reload schema';
```

The uniqueness constraint makes a reaction toggle deterministic: if the row exists, remove it; otherwise insert it. The cascade from `posts` ensures post deletion automatically deletes reactions.

## Read Shape

Extend `PostRecord` with grouped reaction summaries:

```ts
interface PostReactionSummary {
  emoji: string;
  count: number;
  actorIds: string[];
  actorNames: string[];
  reactedByCurrentActor: boolean;
}
```

`getNodePosts` and `getWorkspaceFeed` will accept an optional `currentActorId` and return posts with grouped reactions. UI-facing callers pass the current actor ID so `reactedByCurrentActor` is accurate. Non-UI callers such as agent context assembly may omit the actor ID; in that case summaries still include counts and actor names, with `reactedByCurrentActor: false`.

Supabase fetches raw reaction rows with the post query, including `actor:actors(id,name,kind)`, and a TypeScript helper groups them by emoji. The grouping helper accepts `currentActorId | null`.

Because node posts are intentionally uncached for streaming freshness, reactions ride along with those direct reads. Workspace feed keeps its existing cache behavior and is invalidated when reactions change.

## Server Actions

Add a server action in `apps/platform/src/lib/actions/posts.ts`:

```ts
togglePostReaction(postId, nodeId, workspaceId, emoji): Promise<PostReactionSummary[]>
```

Behavior:

- Resolve the current actor through `getCurrentActor()`.
- Confirm the target post exists and has `post_type = 'post'`.
- If `(post_id, actor_id, emoji)` exists, delete it.
- Otherwise insert it.
- Revalidate `posts:${nodeId}` and `workspace-feed:${workspaceId}`.
- Return fresh grouped reaction summaries for the target post so the client can update optimistically without a full refresh.

Invalid emoji input is rejected with a clear error. The picker passes the native emoji character, not shortcode text.

## UI Behavior

Update `PostItem` for normal posts:

- Reuse the existing bottom-right post action row as the entire reaction surface.
- Show one compact chip per grouped emoji in that existing action row: emoji plus count.
- Highlight chips where `reactedByCurrentActor` is true using accent token styling.
- Use the chip `title` attribute to show actor names.
- Clicking a chip calls `togglePostReaction` for that emoji.
- Add the emoji-picker trigger to the same action row beside copy, export, pin, edit, and delete.
- Render the trigger as a compact generic emoji-plus icon button, for example a smile icon with a `+` affordance.
- Use the same compact add-emoji trigger for posts with zero reactions and posts with existing reactions.
- Clicking the add-emoji trigger opens `emoji-picker-react` in a small popover anchored near the trigger.
- Selecting an emoji toggles that reaction and closes the picker.
- Close the picker on outside click or Escape.

Reaction controls use existing CSS custom properties and Tailwind utilities. They must not create new rows, increase the post's resting height, or add any vertical chrome. Existing reactions appear inline with the post action icons.

Activity posts render no reaction controls and no add control.

## Dependency

Add `emoji-picker-react` to `apps/platform/package.json`.

Use the package only in a small `PostReactions` client component. Keep picker-specific code isolated so the rest of the post rendering does not depend on picker internals.

## Client State

`PostsTabContent` owns the post list state. `PostItem` receives an `onReactionUpdate(postId, reactions)` callback and calls it after the server action returns fresh summaries. `PostItem` keeps temporary pending state for disabled buttons, but it does not maintain a separate long-lived copy of reactions.

When `pollNodePosts` replaces the post list during agent streaming, the server-provided reaction summaries become the source of truth. Local state does not permanently diverge from fresh post props.

## Error Handling

- If toggling fails, leave the previous reaction summaries unchanged and keep the picker open when the failure came from a picker selection.
- If the post is not a normal post, the server action throws and does not mutate reactions.
- If the emoji picker fails to load, existing chips still work and the add-emoji trigger shows a disabled/error title.

## Testing

Add focused tests for pure grouping/toggle-adjacent helpers rather than broad UI snapshots:

- Group raw reaction rows into summaries by emoji.
- Sort grouped output deterministically by each emoji group's earliest `created_at`.
- Mark `reactedByCurrentActor` correctly.
- Preserve actor names for tooltips.
- Ensure activity posts do not render reaction controls.
- Ensure normal posts do not render a separate reaction row.

Manual verification:

- Add a reaction through the picker.
- Toggle an existing chip off and on.
- Confirm another actor's reaction count remains.
- Confirm activity posts have no reaction UI.
- Confirm reactions survive agent reply polling and post refresh.
- Confirm deleting a post removes its reactions through cascade.
