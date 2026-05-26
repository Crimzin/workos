# WorkOS Ecosystem Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin WorkOS so its product UI shares the personal site's color, typography, and theme-toggle feel without adding personal branding.

**Architecture:** Keep WorkOS's existing token-driven styling architecture and remap the global CSS variables to the personal-site palette. Add small testable helpers for theme-toggle destination styling, then refine only high-leverage components that already consume tokens.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, `next/font/google`, `lucide-react`, Node assert tests run through `npx tsx`.

---

## File Map

| File | Responsibility |
| --- | --- |
| `apps/platform/src/app/globals.css` | Global light/dark tokens, Tailwind theme mapping, base typography, shared utilities. |
| `apps/platform/src/app/layout.tsx` | Font loading and root font variables. |
| `apps/platform/src/components/theme-toggle.tsx` | Destination-preview theme toggle UI. |
| `apps/platform/src/components/theme-toggle.test.ts` | Pure helper tests for destination theme labels/icons/classes. |
| `apps/platform/src/components/app-shell.tsx` | App background composition. |
| `apps/platform/src/components/sidebar.tsx` | Sidebar material treatment and toggle placement inherits new tokens. |
| `apps/platform/src/components/board/card-tile.tsx` | Board card surface and active state refinement. |

## Tasks

### Task 1: Theme Toggle Helper And Test

**Files:**
- Modify: `apps/platform/src/components/theme-toggle.tsx`
- Create: `apps/platform/src/components/theme-toggle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/platform/src/components/theme-toggle.test.ts`:

```ts
import assert from "node:assert/strict";
import { getThemeTogglePresentation } from "./theme-toggle";

const lightMode = getThemeTogglePresentation("light");
assert.equal(lightMode.nextTheme, "dark");
assert.equal(lightMode.icon, "moon");
assert.equal(lightMode.ariaLabel, "Switch to dark mode");
assert.match(lightMode.className, /bg-\[#14292b\]/);
assert.match(lightMode.className, /text-\[#faf8f3\]/);

const darkMode = getThemeTogglePresentation("dark");
assert.equal(darkMode.nextTheme, "light");
assert.equal(darkMode.icon, "sun");
assert.equal(darkMode.ariaLabel, "Switch to light mode");
assert.match(darkMode.className, /bg-\[#faf8f3\]/);
assert.match(darkMode.className, /text-\[#14292b\]/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx apps/platform/src/components/theme-toggle.test.ts`

Expected: FAIL because `getThemeTogglePresentation` is not exported.

- [ ] **Step 3: Implement the helper and use it in the component**

In `apps/platform/src/components/theme-toggle.tsx`, export a pure helper:

```ts
export type ThemeToggleIcon = "moon" | "sun";

export function getThemeTogglePresentation(resolvedTheme: "light" | "dark") {
  if (resolvedTheme === "dark") {
    return {
      nextTheme: "light" as const,
      icon: "sun" as ThemeToggleIcon,
      ariaLabel: "Switch to light mode",
      className:
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#b8c5c3] bg-[#faf8f3] text-[#14292b] shadow-sm transition-colors hover:bg-[#f0ece2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    };
  }

  return {
    nextTheme: "dark" as const,
    icon: "moon" as ThemeToggleIcon,
    ariaLabel: "Switch to dark mode",
    className:
      "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#3a4f51] bg-[#14292b] text-[#faf8f3] shadow-sm transition-colors hover:bg-[#1f3a3d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  };
}
```

Use `presentation.className`, `presentation.ariaLabel`, and `presentation.icon` in the button.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx apps/platform/src/components/theme-toggle.test.ts`

Expected: PASS with no output.

### Task 2: Global Palette And Typography

**Files:**
- Modify: `apps/platform/src/app/globals.css`
- Modify: `apps/platform/src/app/layout.tsx`

- [ ] **Step 1: Update font loading**

Replace `DM_Sans` with `Inter` and add `Fraunces` in `apps/platform/src/app/layout.tsx`. Keep `JetBrains_Mono`.

- [ ] **Step 2: Update global tokens**

In `apps/platform/src/app/globals.css`, remap light and dark tokens to the personal-site palette while preserving WorkOS semantic token names and Tailwind mappings.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit --project apps/platform/tsconfig.json`

Expected: PASS.

### Task 3: High-Leverage Surface Refinement

**Files:**
- Modify: `apps/platform/src/components/app-shell.tsx`
- Modify: `apps/platform/src/components/sidebar.tsx`
- Modify: `apps/platform/src/components/board/card-tile.tsx`

- [ ] **Step 1: Apply token-based surface styling**

Refine app shell, sidebar, and card classes to use the new tokens: warm secondary sidebar, subtle borders, copper active/selected cues, and soft focus states.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit --project apps/platform/tsconfig.json`

Expected: PASS.

### Task 4: Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run focused test**

Run: `npx tsx apps/platform/src/components/theme-toggle.test.ts`

Expected: PASS with no output.

- [ ] **Step 2: Run lint**

Run: `npm run lint --workspace @workos/platform`

Expected: PASS or only pre-existing warnings unrelated to touched files.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit --project apps/platform/tsconfig.json`

Expected: PASS.

- [ ] **Step 4: Start dev server for visual verification**

Run: `npm run dev --workspace @workos/platform`

Expected: Next.js dev server starts and provides a localhost URL.

- [ ] **Step 5: Visual pass**

Open the local app and check light/dark mode for sidebar, board cards, detail/thread surfaces, settings surfaces, and theme toggle destination-preview behavior.
