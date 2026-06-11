# Recursive Board Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the full board as a `Chat | Board | Fields | Memory | Tree` tab where every current node acts as the board root.

**Architecture:** Keep the existing board UI and DnD behavior, but add a recursive board read model that treats the current node as the root, its children as stacks, and their children as cards regardless of absolute node type. Thread and detail surfaces pass this node-scoped board into the existing `Board` component as the new Board tab.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, existing `@dnd-kit` board components, Node assert tests run with `npx tsx`.

---

### Task 1: Recursive Board Read Model

**Files:**
- Create: `apps/platform/src/lib/recursive-board.test.ts`
- Modify: `apps/platform/src/lib/board.ts`

- [ ] Write a failing test proving root/children/grandchildren become board/stacks/cards independent of stored node type.
- [ ] Add a pure builder plus `getNodeBoard(nodeId)` Supabase read helper.
- [ ] Run `npx tsx apps/platform/src/lib/recursive-board.test.ts`.

### Task 2: Board Tab Placement

**Files:**
- Modify: `apps/platform/src/components/node-detail-tabs.tsx`
- Modify: `apps/platform/src/components/thread/thread-surface.tsx`
- Modify: `apps/platform/src/components/detail-panel.tsx`

- [ ] Add `boardContent` as an optional tab directly after Chat.
- [ ] Fetch and pass node-scoped board data for both full thread surfaces and detail panels.
- [ ] Keep Tree as a separate outline/list tab.

### Task 3: In-Thread Navigation Mode

**Files:**
- Modify: `apps/platform/src/components/board/board.tsx`
- Modify: `apps/platform/src/components/board/stack-row.tsx`
- Modify: `apps/platform/src/components/board/card-tile.tsx`

- [ ] Let Board choose whether card/stack clicks open legacy board detail (`?view=board&d=...`) or navigate directly to `/n/<nodeId>`.
- [ ] Use direct thread navigation inside the new Board tab.
- [ ] Preserve legacy board route behavior for `/n/<workspace>?view=board`.

### Task 4: Verification

**Files:**
- Existing platform files.

- [ ] Run the recursive board test.
- [ ] Run existing board DnD tests.
- [ ] Run platform lint/build as far as local dependencies allow.
