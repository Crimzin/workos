# CLAUDE.md — Work OS

## What This Project Is

Work OS is a work management platform — the execution surface for a larger ecosystem that includes BrainShare (AI memory layer) and Swarm (AI orchestration layer). Phase 1 is the core work management app: workspaces, stacks, cards, a 2D board view, post streams, data fields, and context linking. It replaces Factor.ai for personal and team use.

Work OS is designed from the ground up as the coordination layer for teams of humans and AI agents. Agents are first-class actors — they can own cards, post in streams, and show up alongside humans in every view.

## Tech Stack

- **Framework:** Next.js 15 App Router + TypeScript (monorepo via npm workspaces, app lives in `apps/platform/`)
- **Rendering:** React Server Components for data-fetching pages; `"use client"` components at the leaves for interactivity
- **Styling:** Tailwind CSS v4 + CSS custom properties for design tokens (light + dark palettes)
- **Backend:** Supabase (Postgres + Storage). Service role key server-side; no RLS in solo mode. Auth deferred to multi-user phase.
- **Data fetching:** Server actions for writes; `unstable_cache` with tag-based invalidation for reads
- **Rich text:** BlockNote 0.49.x — `useCreateBlockNote`, `BlockNoteView` (Mantine renderer), custom `MentionSpec` inline content, slash menu, image upload
- **Icons:** Lucide React
- **Drag and drop:** @dnd-kit
- **Fonts:** DM Sans + JetBrains Mono (via `next/font`)

## Key Documents

- `ai-ecosystem-roadmap.md` — Build roadmap + architecture decisions log. Phase 1 (WorkOS v0) is the current build target.
- `AGENTS.md` — Notes for AI agents working on this codebase.

## Architecture

### Data Model: Recursive Tree

Every item in the system is the same base type: a **node**. Nodes can have children of the same type, supporting unlimited depth. The type label (workspace / stack / card) is a tag for UI rendering, not a structural constraint.

Phase 1 renders one level of nesting: workspaces contain stacks, stacks contain cards.

### Information Hierarchy

- **Instance** — top-level container. All workspaces, data fields, and actors live inside it.
- **Workspaces** — containers within an instance. Users can have many; one is personal (undeletable).
- **Stacks** — grouped containers within a workspace. Each stack is a row on the board.
- **Cards** — atomic units of work within a stack.

### Data Fields Are Global to the Instance

A field created in any workspace is available to any stack in any workspace. Fields are NOT scoped per workspace or stack.

### Field-Driven Columns

The board's columns are generated from the values of a list-type data field (single-select or multi-select). Each stack independently selects which field drives its columns. Only list-type fields are eligible.

### Actor Model

Humans and AI agents share the same `actors` table. Both can own nodes, post in streams, and be assigned as members. Agent actors render with a purple ring (`ring-2 ring-agent-accent`). The `ActorForMention` type (`{ id, name, kind }`) threads through all post-related components.

### Personal Workspace

Every user gets a default personal workspace named "[Name]'s Workspace". It cannot be deleted but can be renamed. The "All Feed" tab (showing activity across all workspaces) only exists in the personal workspace.

### Server Component / Client Component Split

- **Server components** fetch data (Supabase queries via service key), render initial HTML, pass data as props.
- **Client components** (`"use client"`) handle interactivity: drag-drop, inline editing, optimistic mutations.
- **Server actions** (`"use server"`) handle all writes; they call `revalidateTag`/`revalidatePath` to bust the `unstable_cache` layer.
- Mutations that need immediate UI feedback use local `useState` + `useTransition` + callbacks rather than waiting for `router.refresh()`.

### Posts / Rich Text

- Posts stored as BlockNote JSON in `posts.body` (text column).
- `parsePostBody` handles both JSON (new) and plain-text (legacy) formats.
- `serializePostBody` = `JSON.stringify(blocks)`.
- The BlockNote schema (`MentionSpec` + `defaultInlineContentSpecs`) is defined at **module level** in `post-editor.tsx` — never inside a component or `useMemo` — so the reference is stable across renders and SSR/client hydration.
- Cmd+Enter submit uses a capture-phase `addEventListener` to beat ProseMirror's keymap.
- Editor reset after submit: increment a `composerKey` state to force-remount the editor.

### @mentions

- Stored as BlockNote inline content `{ type: "mention", props: { id, name, kind } }` inside the post body JSON.
- Actor ID is durable — future notification routing / agent-triggering reads mention nodes from post JSON and dispatches by `id`.
- Currently cosmetic only.

### Context Linking

Any node can link to any other node. Links are bidirectional. Foundational for BrainShare integration in Phase 2.

## Project Structure

```
apps/platform/
├── src/
│   ├── app/                     # Next.js App Router pages
│   │   ├── n/[id]/              # Workspace board + detail panel
│   │   │   ├── page.tsx         # Board page (server component)
│   │   │   └── feed/page.tsx    # Workspace feed (server component)
│   │   └── api/upload/route.ts  # Image upload endpoint
│   ├── components/              # React components
│   │   ├── board/               # Board, StackRow, CardTile
│   │   ├── detail-panel.tsx     # Server component — node detail panel
│   │   ├── detail-panel-tabs.tsx
│   │   ├── post-editor.tsx      # BlockNote editor (client, module-level schema)
│   │   ├── post-item.tsx        # Single post/activity item
│   │   ├── posts-tab-content.tsx # Composer + feed list
│   │   ├── workspace-feed.tsx   # Feed page tabs + list
│   │   ├── sidebar.tsx          # Collapsible sidebar
│   │   └── ...
│   └── lib/
│       ├── supabase.ts          # Service-role Supabase client (server-side)
│       ├── cache.ts             # unstable_cache tags + revalidation helpers
│       ├── types.ts             # WorkNode, etc.
│       ├── posts.ts             # getNodePosts, getWorkspaceFeed, PostRecord, FeedPost
│       ├── actor.ts             # getCurrentActor, getActors, ActorForMention
│       ├── nodes.ts             # getNode, getRootNodes, getWorkspaceBoard, etc.
│       └── actions/             # Server actions
│           ├── nodes.ts         # createCard, createStack, updateNodeTitle, etc.
│           └── posts.ts         # createPost, updatePost, deletePost, pinPost
├── supabase/migrations/         # SQL migrations (applied via Supabase MCP)
└── next.config.ts               # transpilePackages for BlockNote ESM
```

## Coding Conventions

### Component Patterns
- Functional components only, no class components
- Named exports, not default exports
- Props interfaces at the top of the file
- Server components fetch data and pass it as props to client leaves
- Use `useTransition` + optimistic local state for mutations; avoid `router.refresh()` for every keystroke

### Styling
- Tailwind utility classes as primary method
- Design tokens as CSS custom properties: `bg-bg-primary`, `text-text-secondary`, `border-border`, `text-accent`, etc.
- Dark mode handled via `.dark` class on `<html>` — tokens switch values
- Inline styles allowed in BlockNote render functions and SVG/canvas-adjacent code; avoid elsewhere

### TypeScript
- Strict mode enabled
- Explicit return types on non-trivial functions
- Use `type` for shapes, prefer explicit over `any` — use `as SomeType` cast only when the type mismatch is a known library generic issue (e.g., BlockNote schema-specific vs. generic `Block`)

### Database
- All writes via server actions in `src/lib/actions/`
- Every write calls the appropriate `revalidate*` helpers from `cache.ts`
- Migrations go in `supabase/migrations/` as numbered SQL files; apply via Supabase MCP

## Git Discipline

- **Commit frequently.** After every coherent unit of work. Do not accumulate large diffs.
- **Commit format:** `type(scope): description` — e.g. `feat: add workspace feed`, `fix(sidebar): dual-highlight`
- **Never commit broken code.** TypeScript must pass (`npx tsc --noEmit`) before committing.
- **Push to origin/main** at end of session unless there's a specific reason not to.

## Important Decisions Already Made

1. **Recursive node model.** Every item is the same base type. Type labels are tags, not structural constraints.

2. **Field-driven columns, not hardcoded statuses.** Columns generated from data field values. No built-in "status" concept.

3. **Data fields are global to the instance.** A field defined anywhere is available everywhere.

4. **Next.js App Router + Server Components.** No separate API server. Reads via server components + `unstable_cache`; writes via server actions. Supabase service role key server-side only.

5. **BlockNote over TipTap.** Chosen for faster integration (zero config, built-in slash menu + image upload), first-class inline content spec API for @mentions, and active maintenance cadence. TipTap remains a fallback if BlockNote proves limiting.

6. **@mentions stored in post body JSON.** Actor `id` persisted in mention props so future notification / agent-dispatch code can extract it without schema changes.

7. **One unified AI surface (Phase 2).** When BrainShare and Swarm ship, they share one AI panel. User talks to one AI — routing happens behind the scenes.

8. **Warm light palette by default, dark mode required.** Default theme is light with warm neutrals and terracotta accent. Dark mode is not optional.

9. **Workspace side panel deferred.** Opening a panel "about" a workspace while you're inside it is confusing. Membership management needs auth first. Revisit in Phase 2 as a "workspace overview panel" triggered from the QUAM.

10. **RLS off in solo mode.** Service role key bypasses RLS. Enable row-level security when multi-user auth lands. Migration 0004 pre-grants default privileges so future tables don't silently break.

## Other Principles

1. **Update this file proactively** whenever a decision is made that affects global project properties, tech choices, or development workflow.

2. **Merge to main liberally.** Default assumption: merge to main after completing any task batch Will approves. Only ask for permission in unusual risk cases.

3. **AiDex first for code searches.** `.aidex/` exists in project root — use `aidex_query` instead of grep/glob. Run `aidex_session` at session start.
