# BUG-001: Board — Mid-column card insertion fails

**Status:** Open  
**Priority:** High  
**Component:** `apps/platform/src/components/board/board.tsx`  
**Reported:** 2026-04-27  

---

## Summary

Dragging a card to a middle position within a column (between two existing cards) does not work. The card always ends up at the top or bottom of the column. Within-column reordering is also intermittent.

---

## Steps to Reproduce

1. Open the board with a column containing 2+ cards (e.g. A, B, C)
2. Pick up any card (from the same column or a different one)
3. Drag it toward the gap between A and B
4. Release

## Expected Behaviour

Card inserts at the hovered position — between A and B.

## Actual Behaviour

Card snaps to the top or bottom of the column. Mid-column position is never achieved.

---

## Root Cause (Identified)

`over.rect` inside dnd-kit drag events is a **stale snapshot** taken at drag-start. During drag, `SortableContext` applies CSS transforms that visually reorder cards — but `over.rect` still reflects pre-transform screen positions.

Any midpoint comparison (e.g. `pointerY > over.rect.top + height / 2`) fires against wrong coordinates. When `handleDragEnd` recomputes position using the stale rect, it calculates the wrong `insertAfter` value and calls `arrayMove` a second time — **undoing the correct placement `handleDragOver` already applied.**

---

## Fix Attempts (all failed or partial)

| # | Approach | Result |
|---|----------|--------|
| 1 | `pointerWithin` + `rectIntersection` collision detection | No improvement |
| 2 | `active.rect.current.translated?.top` as overlay position | Wrong due to grab offset |
| 3 | `activatorEvent.clientY + delta.y` as true pointer Y | Still used stale `over.rect` for comparison |
| 4 | `arrayMove` in `handleDragEnd` with pointer-Y midpoint | Undoes `handleDragOver`'s correct placement |
| 5 | Remove `arrayMove` from `handleDragEnd` entirely | Empty-column drop fixed; mid-column still broken |

---

## Current State

- `handleDragOver` uses `arrayMove` for same-column reorder (deduped via `lastMoveRef`)
- `handleDragEnd` only persists — no secondary `arrayMove`
- Empty-column drag: ✅ fixed
- Mid-column insertion: ❌ still broken
- Within-column reorder: ⚠️ intermittent

---

## Likely Path Forward

Stop using rect comparisons entirely. Use **index-based direction** from `arrayMove(items, from, to)` semantics — the above/below intent is implicit in whether `from < to` or `from > to`. This avoids all stale-rect issues and may be the clean solution.
