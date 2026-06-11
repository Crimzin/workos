# Post PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-post PDF export path that renders a single WorkOS post as a letter-size, print-ready document.

**Architecture:** Use a dedicated App Router page at `/posts/[postId]/export` that fetches the post server-side and renders it with the existing readonly BlockNote post renderer. The post hover actions link to this page in a new tab, where print CSS adapts WorkOS tokens to 8.5 x 11 paper and browser “Save as PDF” provides the PDF.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, BlockNote, Tailwind CSS v4, Node assert tests run with `npx tsx`.

---

### Task 1: Export Helpers

**Files:**
- Create: `apps/platform/src/lib/post-export.ts`
- Create: `apps/platform/src/lib/post-export.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/platform/src/lib/post-export.test.ts` with assertions that normal posts are exportable, activity posts are not, and post IDs map to `/posts/<encoded-id>/export`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx apps/platform/src/lib/post-export.test.ts`
Expected: FAIL because `./post-export` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create helper functions in `apps/platform/src/lib/post-export.ts`: `canExportPostToPdf(post)` and `postPdfExportPath(postId)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx apps/platform/src/lib/post-export.test.ts`
Expected: PASS.

### Task 2: Export UI Affordance

**Files:**
- Modify: `apps/platform/src/components/post-item.tsx`

- [ ] **Step 1: Add export action**

Add a `FileDown` icon link to the non-editing hover actions for regular posts. It should open `postPdfExportPath(post.id)` in a new tab with label/title “Export PDF”.

- [ ] **Step 2: Run helper test**

Run: `npx tsx apps/platform/src/lib/post-export.test.ts`
Expected: PASS.

### Task 3: Print-Ready Export Route

**Files:**
- Create: `apps/platform/src/app/posts/[postId]/export/page.tsx`
- Modify: `apps/platform/src/app/globals.css`
- Modify: `apps/platform/src/lib/post-export.ts`

- [ ] **Step 1: Add post export fetcher**

Add `getPostForPdfExport(postId)` in `apps/platform/src/lib/post-export.ts` to load a post with its actor and source node.

- [ ] **Step 2: Add server page**

Create `/posts/[postId]/export` as a Server Component using async `params`, `notFound()` for missing or non-post rows, and readonly `PostEditor` for body rendering.

- [ ] **Step 3: Add print CSS**

Add `.post-export-*` styles and `@media print` rules in `apps/platform/src/app/globals.css` for letter page sizing, white paper background, WorkOS typography, image/table constraints, and hidden screen-only controls.

- [ ] **Step 4: Verify**

Run: `npm run lint --workspace @workos/platform`
Expected: no lint errors from the new export files.
