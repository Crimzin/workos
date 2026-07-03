# Provenance Source Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make provenance labels system-wide and make `#` mention suggestions clearly show whether each thread came from WorkOS, Claude, ChatGPT, or an unknown import.

**Architecture:** Reuse the existing `SourceApp` model and add one shared visual component, `SourceChip`, for all app/source provenance. Enrich node mention candidates with existing source columns; keep persisted BlockNote `nodeMention` content unchanged.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind token classes, BlockNote suggestion menu, Node `assert` tests run with `tsx`.

---

## File Structure

- Modify: `apps/platform/src/lib/post-source-links.ts` for source app label/mark metadata.
- Test: `apps/platform/src/lib/post-source-links.test.ts` for stable label and mark helpers.
- Modify: `apps/platform/src/lib/node-mentions.ts` for source-aware mention candidates.
- Modify: `apps/platform/src/lib/nodes.ts` to select source columns for mention search.
- Test: `apps/platform/src/lib/node-mentions.test.ts` for source metadata and imported chat search.
- Create: `apps/platform/src/components/source-chip.tsx` for the shared provenance chip.
- Create: `apps/platform/src/components/source-chip-usage.test.ts` for a lightweight audit over touched surfaces.
- Modify: `apps/platform/src/components/post-editor.tsx` to render source chips in `#` suggestions.
- Modify: `apps/platform/src/components/sidebar.tsx` to replace local imported-chat source logos.
- Modify: `apps/platform/src/components/post-item.tsx` to replace imported message text badges and handoff source text.
- Modify: `apps/platform/src/components/thread/context-panel.tsx` to replace plain source text.
- Modify: `apps/platform/src/components/thread/context-event.tsx` to show chips on grouped context source rows.
- Modify: `apps/platform/src/components/settings/sources-settings.tsx` to replace plain source text.

## Task 1: Source Metadata Helper

**Files:**
- Modify: `apps/platform/src/lib/post-source-links.ts`
- Test: `apps/platform/src/lib/post-source-links.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions:

```ts
import {
  sourceAppMark,
  sourceAppLabel,
} from "./post-source-links";

assert.equal(sourceAppMark("workos"), "W");
assert.equal(sourceAppMark("claude"), "C");
assert.equal(sourceAppMark("chatgpt"), "G");
assert.equal(sourceAppMark("unknown"), "?");
assert.equal(sourceAppMark(null), "?");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx apps/platform/src/lib/post-source-links.test.ts`

Expected: FAIL because `sourceAppMark` is not exported.

- [ ] **Step 3: Implement helper**

Add this map and function in `post-source-links.ts`:

```ts
const sourceAppMarks: Record<SourceApp, string> = {
  claude: "C",
  chatgpt: "G",
  workos: "W",
  unknown: "?",
};

export function sourceAppMark(sourceApp: SourceApp | null | undefined): string {
  return sourceAppMarks[sourceApp ?? "unknown"];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx apps/platform/src/lib/post-source-links.test.ts`

Expected: PASS.

## Task 2: Source-Aware Node Mention Candidates

**Files:**
- Modify: `apps/platform/src/lib/node-mentions.ts`
- Modify: `apps/platform/src/lib/nodes.ts`
- Test: `apps/platform/src/lib/node-mentions.test.ts`

- [ ] **Step 1: Write the failing tests**

Add source fields to test rows and assert source metadata plus imported search:

```ts
const sourcedRows: NodeMentionSearchRow[] = [
  {
    id: "native",
    title: "Launch plan",
    type: "stack",
    parent_id: null,
    source_kind: null,
    source_app: null,
    source_title: null,
    source_conversation_id: null,
  },
  {
    id: "import",
    title: "Campaign Reporting SQL Cleanup",
    type: "stack",
    parent_id: null,
    source_kind: "imported_ai_chat",
    source_app: "claude",
    source_title: "Claude export title",
    source_conversation_id: "conv-123",
  },
];

assert.deepEqual(buildNodeMentionCandidates(sourcedRows, "", 2), [
  { id: "native", title: "Launch plan", type: "stack", path: "Launch plan", sourceApp: "workos" },
  { id: "import", title: "Campaign Reporting SQL Cleanup", type: "stack", path: "Campaign Reporting SQL Cleanup", sourceApp: "claude" },
]);
assert.equal(buildNodeMentionCandidates(sourcedRows, "claude export", 5)[0].id, "import");
assert.equal(buildNodeMentionCandidates(sourcedRows, "conv-123", 5)[0].id, "import");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx apps/platform/src/lib/node-mentions.test.ts`

Expected: FAIL because source fields are absent from the candidate shape/search text.

- [ ] **Step 3: Implement candidate metadata**

Update `NodeMentionSearchRow` with optional source fields, update `NodeMentionCandidate` with `sourceApp`, and build candidates with `sourceApp: row.source_app ?? "workos"` plus searchable `bodyPreview` from source title, conversation id, and source app label.

- [ ] **Step 4: Update Supabase select**

Change `apps/platform/src/lib/nodes.ts` mention search select from:

```ts
.select("id,title,type,parent_id")
```

to:

```ts
.select("id,title,type,parent_id,source_kind,source_app,source_title,source_conversation_id")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx apps/platform/src/lib/node-mentions.test.ts`

Expected: PASS.

## Task 3: Shared SourceChip Component

**Files:**
- Create: `apps/platform/src/components/source-chip.tsx`
- Create: `apps/platform/src/components/source-chip-usage.test.ts`

- [ ] **Step 1: Write the usage audit test**

Create a test that reads touched component files and fails until they import `SourceChip` and no sidebar-local `sourceLogoLabels` remains:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "apps/platform/src/components/sidebar.tsx",
  "apps/platform/src/components/post-item.tsx",
  "apps/platform/src/components/thread/context-panel.tsx",
  "apps/platform/src/components/thread/context-event.tsx",
  "apps/platform/src/components/settings/sources-settings.tsx",
  "apps/platform/src/components/post-editor.tsx",
];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /SourceChip/);
}

const sidebar = readFileSync("apps/platform/src/components/sidebar.tsx", "utf8");
assert.doesNotMatch(sidebar, /sourceLogoLabels/);
```

- [ ] **Step 2: Run audit test to verify it fails**

Run: `npx tsx apps/platform/src/components/source-chip-usage.test.ts`

Expected: FAIL because `SourceChip` is not used yet.

- [ ] **Step 3: Create `SourceChip`**

Create `apps/platform/src/components/source-chip.tsx` with named export:

```tsx
import type { SourceApp } from "@/lib/types";
import { sourceAppLabel, sourceAppMark } from "@/lib/post-source-links";
import { cn } from "@/lib/utils";

export interface SourceChipProps {
  sourceApp: SourceApp | null | undefined;
  compact?: boolean;
  className?: string;
}

export function SourceChip({ sourceApp, compact = false, className }: SourceChipProps) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-border bg-bg-card text-text-tertiary", compact ? "px-1" : "px-1.5", className)}>
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-bg-hover text-[8px] font-bold leading-none">
        {sourceAppMark(sourceApp)}
      </span>
      {!compact && <span className="text-[10px] font-medium leading-none">{sourceAppLabel(sourceApp)}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Integrate component in audited surfaces**

Replace one-off provenance labels with `SourceChip`. Keep status pills unchanged.

- [ ] **Step 5: Run audit test to verify it passes**

Run: `npx tsx apps/platform/src/components/source-chip-usage.test.ts`

Expected: PASS.

## Task 4: Verification

**Files:**
- All touched files

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx tsx apps/platform/src/lib/post-source-links.test.ts
npx tsx apps/platform/src/lib/node-mentions.test.ts
npx tsx apps/platform/src/components/source-chip-usage.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
cd apps/platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run focused lint if available**

Run:

```bash
cd apps/platform && npx eslint src/components/source-chip.tsx src/components/post-editor.tsx src/components/sidebar.tsx src/components/post-item.tsx src/components/thread/context-panel.tsx src/components/thread/context-event.tsx src/components/settings/sources-settings.tsx src/lib/post-source-links.ts src/lib/node-mentions.ts src/lib/nodes.ts
```

Expected: PASS or only unrelated pre-existing config issues.

- [ ] **Step 4: Commit implementation**

Stage only files touched for this feature:

```bash
git add docs/superpowers/plans/2026-07-02-provenance-source-chip.md apps/platform/src/lib/post-source-links.ts apps/platform/src/lib/post-source-links.test.ts apps/platform/src/lib/node-mentions.ts apps/platform/src/lib/node-mentions.test.ts apps/platform/src/lib/nodes.ts apps/platform/src/components/source-chip.tsx apps/platform/src/components/source-chip-usage.test.ts apps/platform/src/components/post-editor.tsx apps/platform/src/components/sidebar.tsx apps/platform/src/components/post-item.tsx apps/platform/src/components/thread/context-panel.tsx apps/platform/src/components/thread/context-event.tsx apps/platform/src/components/settings/sources-settings.tsx
git commit -m "feat(provenance): unify source chips"
```
