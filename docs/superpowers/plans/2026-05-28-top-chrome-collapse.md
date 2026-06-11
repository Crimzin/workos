# Top Chrome Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users collapse the node header and tab chrome into one compact row to regain vertical space.

**Architecture:** Move the identity rail under the existing `NodeDetailTabs` client component so one localStorage-backed state can render either the current two-row chrome or a compact one-row chrome. The collapse button sits at the left edge of the main pane, directly before the workspace/thread title, near the sidebar collapse control.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS tokens, lucide-react, Node assert tests run with `npx tsx`.

---

### Task 1: Persisted State Helper

**Files:**
- Create: `apps/platform/src/lib/top-chrome.ts`
- Create: `apps/platform/src/lib/top-chrome.test.ts`

- [ ] Write a failing Node assert test for localStorage parsing, serialization, and toggle labels.
- [ ] Implement the pure helper.
- [ ] Run `npx tsx apps/platform/src/lib/top-chrome.test.ts`.

### Task 2: Shared Chrome Renderer

**Files:**
- Modify: `apps/platform/src/components/node-identity-rail.tsx`
- Modify: `apps/platform/src/components/node-detail-tabs.tsx`

- [ ] Add a leading collapse control slot to the identity rail.
- [ ] Add a compact rail mode that hides secondary metadata and accepts inline tabs.
- [ ] Make `NodeDetailTabs` own the collapse state and render tabs in the identity row when collapsed.

### Task 3: Surface Wiring

**Files:**
- Modify: `apps/platform/src/components/thread/thread-surface.tsx`
- Modify: `apps/platform/src/components/detail-panel.tsx`

- [ ] Pass identity data into `NodeDetailTabs` instead of rendering the identity rail as a separate sibling.
- [ ] Preserve the existing tab order and panel content.

### Task 4: Verification

**Files:**
- Existing platform files.

- [ ] Run focused helper and board tests.
- [ ] Run `npx tsc -p apps/platform/tsconfig.json --noEmit`.
- [ ] Run `npm --workspace apps/platform run build`.
