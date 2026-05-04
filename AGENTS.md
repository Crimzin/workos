# AGENTS.md — WorkOS

## Overview

This file defines agent roles for Claude Code and Codex sessions on the WorkOS project. Each role has a clear scope, responsibility, and set of standards. When starting a task, identify which role applies and follow its conventions.

The project is a monorepo: `apps/platform` (WorkOS Core — Next.js/TypeScript), `apps/brainshare` (BrainShare service — Python/FastAPI/Graphiti), `apps/swarm` (Swarm — future).

### Routing: Which Agent Am I?

Determine the role based on what the task touches:

- Working in `apps/platform/src/`? → **Platform Agent**
- Working in `supabase/migrations/` or designing schemas? → **Data Agent**
- Working in `apps/brainshare/`? → **BrainShare Agent**
- Reviewing code or checking conventions before a commit? → **Review Agent**
- Task spans multiple apps (e.g., BrainShare writeback to WorkOS)? → Lead with the agent that owns the initiating side (BrainShare Agent for writeback), and **consult** the other agent's standards for the receiving side.

### The Consult Pattern

No agent tries to know everything. When a task crosses boundaries, consult the relevant spec or agent definition rather than guessing:

| If you're in... | And you need to understand... | Consult... |
|-----------------|-------------------------------|------------|
| Platform Agent | How BrainShare primitives are structured | `apps/brainshare/context-docs/brainshare-product-spec.md` |
| Platform Agent | What the Memory tab should display | `apps/brainshare/context-docs/brainshare-product-spec.md` §12 |
| BrainShare Agent | How WorkOS cards/stacks are structured | `CLAUDE.md` Architecture section + `apps/platform/src/lib/` |
| BrainShare Agent | What the UI should look like | `docs/work-os-ui-design-spec.md` |
| Data Agent | What typed primitives BrainShare needs | `apps/brainshare/context-docs/brainshare-extraction-pipeline.md` §4 |
| Data Agent | What Graphiti expects | Graphiti docs at https://github.com/getzep/graphiti |
| Any agent | Design tokens, layout, component patterns | `docs/work-os-ui-design-spec.md` |
| Any agent | Build roadmap and phasing | `ai-ecosystem-roadmap.md` |
| Any agent | Competitive context | `workos-competitor-context.md` |

---

## Platform Agent (apps/platform)

**Scope:** All React components, Next.js routes, server actions, layouts, styling, and user interactions in WorkOS Core.

**Responsibilities:**
- Build components that match the design spec (`docs/work-os-ui-design-spec.md`) exactly — colors, typography, spacing, radii, shadows
- Implement both light and dark mode using CSS custom properties
- Follow the established component patterns from Phase 1 (see below)
- Use Tailwind utility classes with design token custom properties
- Implement drag and drop using @dnd-kit
- Build rich text with BlockNote (NOT TipTap — BlockNote is the established choice)
- Ensure responsive behavior per spec breakpoints

**Established patterns from Phase 1 (follow these, don't reinvent):**
- Server Components for data fetching; Client Components only when interactivity requires it
- Server Actions in `src/lib/actions/` for mutations, with `revalidateTag` + `revalidatePath` cache invalidation
- `unstable_cache` with tag-based invalidation wrapping read helpers
- Supabase RPC functions for complex multi-table reads (e.g., `rpc_get_workspace_board`)
- Detail panel opens via `?d=<nodeId>` query param — Board stays visible, URL is shareable
- InlineCreate component pattern for creating nodes (Enter submits, Escape cancels, blur-empty cancels)
- BlockNote with MentionSpec for @mentions — mentions stored as inline content with { id, name, kind } props
- QUAM (three-dot menu) pattern for contextual actions on stacks, cards, workspaces
- BoardAvatar component for actor rendering (initials, purple ring for agents)
- Field badge rendering with per-field colors (.badge-1 through .badge-6)
- Node mirroring via `node_mirrors` table — `is_mirror_here` and `is_mirrored` flags

**Standards:**
- Read design spec before building any new component
- Named exports, not default exports. One component per file.
- Props interfaces named `{ComponentName}Props`
- Use `cn()` utility for conditional class composition
- No hardcoded colors — always reference CSS custom properties
- Agent actors always render with purple ring (`ring-agent-accent`)
- Every interactive element needs hover, active, focus states

**Files:** `apps/platform/src/`

---

## Data Agent (apps/platform + apps/brainshare)

**Scope:** Supabase schema, database migrations, RLS policies, Postgres RPC functions, and the data access layer in WorkOS. Also the Graphiti graph schema in BrainShare.

**Responsibilities:**
- Design and maintain Postgres schema in Supabase (WorkOS side)
- Write migrations (currently at migration 0015+; number sequentially)
- Build Postgres RPC functions for complex reads (established pattern: `rpc_get_workspace_board`)
- Implement RLS policies when multi-user auth lands
- Maintain the recursive node model — every entity is a node, type labels are tags
- Handle realtime subscriptions for live updates
- Design Graphiti entity/relationship mappings for BrainShare typed primitives

**Established patterns:**
- Migrations in `supabase/migrations/` numbered sequentially (0001, 0002, etc.)
- Read helpers in `src/lib/` organized by domain (board.ts, nodes.ts, posts.ts, etc.)
- Server actions in `src/lib/actions/` for mutations
- `unstable_cache` wrapping read helpers with tag-based invalidation
- Service role key for server-side Supabase (no RLS in solo mode)
- `getCurrentActor()` returns first human actor in instance
- Fractional positions for ordering (midpoint calculation between neighbors)
- Cascade-on-delete for join tables (node_members, node_mirrors, node_links)

**Standards:**
- The recursive node model is the foundation — workspace/stack/card are type labels, NOT separate tables
- Data fields are global to the instance — fields table has NO workspace_id foreign key
- Links are bidirectional — stored in `node_links` with `link_type` enum (related | blocks)
- Posts use `post_type` enum ('post' | 'card_created' | 'link_created') for activity logging
- All tables have `created_at` and `updated_at` timestamps
- All columns use snake_case

**Files:** `supabase/migrations/`, `apps/platform/src/lib/`

---

## BrainShare Agent (apps/brainshare)

**Scope:** The BrainShare extraction pipeline, Graphiti integration, conviction scoring, context assembly, and the BrainShare service API.

**Responsibilities:**
- Build the FastAPI service that runs BrainShare
- Integrate with Graphiti (Neo4j-backed temporal knowledge graph)
- Implement the extraction pipeline: Episode creation → Chunking → LLM extraction → Conviction scoring → Graph validation → Storage → Action
- Build Claude/ChatGPT conversation ingestion as the first pipeline
- Build Discord ingestion as the second pipeline
- Implement conviction scoring (explicitness × authority × recency × hard-to-vary bonus)
- Build context assembly engine (adaptive retrieval from four memory layers)
- Implement MCP server exposing BrainShare context to Claude ecosystem tools
- Build writeback to WorkOS (via API or direct Supabase calls)

**Key specs (READ THESE BEFORE BUILDING):**
- `apps/brainshare/context-docs/brainshare-product-spec.md` — full product spec
- `apps/brainshare/context-docs/brainshare-extraction-pipeline.md` — pipeline build spec with prompts, schemas, worked examples
- `apps/brainshare/context-docs/context-memory-research-brief.md` — landscape research

**Standards:**
- Python 3.10+ with uv for dependency management
- FastAPI for the service API
- Graphiti for the temporal knowledge graph (don't rebuild graph infra)
- Typed primitives: Decision, Assumption, Action, Question, ContextUpdate, Actor, Goal, WorkItem, Standard, Signal, Episode — each with specific fields defined in the extraction pipeline spec
- Conviction always traces to human signal, not AI generation
- Both humans and AI produce content, but conviction comes from human signal weighted by authority
- Extraction should prefer fewer, higher-quality primitives over many low-confidence ones
- Every primitive traces back to its source Episodes (immutable raw data)
- Writeback targets cards OR stacks in WorkOS — sometimes a stack is the right scope
- The relevance scoping pre-step (attention scope tree) governs which content gets full extraction vs. lightweight tracking vs. ignored

**Files:** `apps/brainshare/`

---

## Review Agent

**Scope:** Code quality, consistency, and adherence to project conventions across all apps.

**Responsibilities:**
- Verify Platform components match the design spec (both light and dark mode)
- Check TypeScript strict mode compliance (no `any`, proper type narrowing)
- Verify git commit hygiene (frequent commits, `type: description` format, no broken code)
- Check that data fields are treated as instance-global
- Verify the recursive node model is used consistently
- Ensure agent actors render with purple ring everywhere
- Verify cache invalidation is correct (tags match what mutations invalidate)
- Check that Server vs. Client component split is appropriate
- For BrainShare: verify extraction prompts produce well-typed primitives, conviction scores are reasonable, graph relationships are correct

**Standards:**
- No inline styles, CSS modules, or styled-components
- No default exports — named exports only
- One component per file, file name matches component name
- No hardcoded strings for design tokens
- No console.log in committed code
- Every server action invalidates the correct cache tags
- Supabase queries organized by domain in `src/lib/`
- BlockNote schema stable at module level (not recreated per render)
- Migrations numbered sequentially, no gaps

**When to invoke:** After completing a feature or component, before merging to main.