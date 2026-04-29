# AGENTS.md — Work OS

## Overview

This file defines agent roles for Claude Code sessions on the Work OS project. Each role has a clear scope, responsibility, and set of standards. When starting a task, identify which role applies and follow its conventions.

---

## UI Agent

**Scope:** All React components, layouts, styling, and user interactions.

**Responsibilities:**
- Build components that match the design spec (`docs/design-spec.md`) exactly — colors, typography, spacing, radii, shadows
- Implement both light and dark mode for every component using CSS custom properties
- Follow the component hierarchy defined in the design spec (Section 18)
- Use Tailwind utility classes with design token custom properties
- Implement drag and drop interactions using @dnd-kit
- Build rich text editing with TipTap
- Ensure responsive behavior (desktop > tablet > mobile breakpoints per spec Section 15)

**Standards:**
- Read `docs/design-spec.md` before building any component
- Match the color palette exactly — light mode AND dark mode tokens
- Use `cn()` utility for conditional class composition
- Every interactive element needs hover, active, focus, and disabled states
- Cards: 1px solid var(--border), border-radius var(--radius-md), hover shows shadow
- Agent actors always render with the purple ring (--agent-accent)
- Empty states must follow the patterns in design spec Section 16
- No hardcoded colors — always reference CSS custom properties

**Files:** `src/components/`, `src/styles/`

---

## Data Agent

**Scope:** Supabase schema, database migrations, Row Level Security (RLS) policies, and data access layer.

**Responsibilities:**
- Design and maintain the Postgres schema in Supabase
- Write migrations for schema changes
- Implement RLS policies for multi-user security
- Build the data access layer (queries, mutations, subscriptions)
- Ensure the recursive node model is correctly implemented
- Handle realtime subscriptions for live updates

**Standards:**
- The recursive node model is the foundation — every entity (workspace, stack, card) is a node with the same base schema
- Type labels (workspace / stack / card) are stored as a column value, not as separate tables
- Data fields are global to the instance — the fields table has no workspace_id foreign key
- Links are stored as a separate join table with bidirectional entries
- Posts are stored with a node_id reference — both stacks and cards have post streams
- Actor table covers both humans and agents with a `type` discriminator
- All database columns use snake_case
- Every table has `created_at` and `updated_at` timestamps
- Use Supabase realtime for live updates on nodes, posts, and field values
- RLS policies: users can only access nodes within their instance

**Files:** `supabase/migrations/`, `src/lib/supabase/`

---

## Migration Agent

**Scope:** Importing data from Factor.ai into Work OS.

**Responsibilities:**
- Scrape or export data from Factor instances (burn.factor.work, friends.factor.work)
- Map Factor entities to Work OS nodes: Factor workspaces → Work OS workspaces, Factor stacks → stacks, Factor cards → cards
- Map Factor posts/comments → Work OS post streams
- Map Factor data fields → Work OS data fields (global to instance)
- Preserve dates, ownership, status values, and relationships
- Handle edge cases (missing data, format differences)

**Standards:**
- Never lose data during migration — if something can't be mapped cleanly, create it as a text post on the relevant node with the raw data
- Preserve original timestamps (created_at, updated_at) from Factor
- Map Factor members to Work OS actors
- Run migration as a one-time script, not an ongoing sync
- Log everything — every mapped entity and every skipped/failed entity

**Files:** `scripts/migration/`

---

## Review Agent

**Scope:** Code quality, consistency, and adherence to project conventions.

**Responsibilities:**
- Verify components match the design spec
- Check that both light and dark mode work correctly
- Ensure TypeScript strict mode compliance (no `any`, proper type narrowing)
- Verify git commit hygiene (frequent commits, meaningful messages, no broken code committed)
- Check that data fields are treated as instance-global, not workspace-scoped
- Verify the recursive node model is used consistently
- Ensure agent actors render with the purple ring everywhere they appear

**Standards:**
- No inline styles, CSS modules, or styled-components
- No default exports — named exports only
- One component per file
- Props interfaces named `{ComponentName}Props`
- Supabase queries organized by domain in `src/lib/supabase/`
- No hardcoded strings for things that should be constants or design tokens
- Every interactive element has proper keyboard accessibility
- No console.log in committed code (use a logger if needed)

**When to invoke this role:** After completing a feature or component, before merging to main. Run a review pass checking all the standards above.
