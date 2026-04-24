# AI Ecosystem Build Roadmap

## WorkOS · BrainShare · Swarm · Finiti

### Target: End of May 2026

---

## Architecture Decisions Log

Decisions made as we build. Most recent on top.

- **2026-04-22 — Backend shape (Phase 1).** Next.js Server Components call Supabase (Postgres + auto-REST) directly from `src/lib/*.ts`. No separate Node server. Writes via **Server Actions**. Mitigations for lag: (1) collapse multi-query reads into **single Postgres RPC functions**, (2) layer **Next `unstable_cache`** with tag-based invalidation on mutations, (3) defer heavier client state until needed. RLS stays off during solo mode; enable before multi-user.
- **2026-04-22 — Insert a "Node Creation Pass" (1.4.5) before 1.5.** Without create flows, every later feature is QA'd against SQL-seeded data. Shipping create-workspace/stack/card now unblocks organic testing of empty → 1 → many transitions across the entire remaining phase.
- **2026-04-22 — Insert a "Backend Perf Pass" (1.4.25) before Node Creation.** Addresses navigation lag: board RPC + cache layer so subsequent work feels instant.
- **2026-04-22 — 1.4 Board simplification.** Column field is **workspace-wide** (single state, not persisted) in 1.4. Per-stack column-field override lands with **1.8 Saved Views** since it's view-scoped configuration.
- **2026-04-22 — 1.5 Detail Panel shape: follow the spec.** Side-panel next to Board, not route-based replacement. Requires lifting panel state into the shell so Board + Detail coexist.
- **2026-04-22 — New workspaces auto-seed a "My First Stack" stack.** Avoids empty-board cold-start; "Inbox" naming was rejected as loaded/confusing. Applied retroactively to the personal workspace seed in migration 0002.
- **2026-04-22 — Server-side Supabase uses the service role key.** Solo-mode simplification: `src/lib/supabase.ts` picks the service key when `typeof window === "undefined"`, bypassing RLS and per-table grants. The key lives in `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix) so it never reaches the browser. When multi-user auth lands, switch to per-request anon clients with RLS policies. Migration 0004 adds default privileges for future tables so adding columns/tables doesn't silently break anon reads.
- **2026-04-22 — 1.4.25 Perf Pass complete.** Migration 0003 `rpc_get_workspace_board` collapses 4 round trips to 1. `unstable_cache` layer wraps read helpers with per-workspace/node/root tags; server actions invalidate via `revalidateTag` + `revalidatePath("/", "layout")` for sidebar refresh.
- **2026-04-22 — 1.4.5 Node Creation Pass complete.** `InlineCreate` component powers sidebar `+`, toolbar `New Stack`, and per-column `+ Add card`. Server actions in `src/lib/actions/nodes.ts` use `getCurrentActor()` (first human in instance) + fractional positions. Card creation auto-sets the column field value so cards land where clicked.
- **2026-04-22 — 1.5 Detail Panel v1 complete.** Side-panel shell via `?d=<nodeId>` query param on the workspace route. Server-rendered `DetailPanel` fetches node + children; Board stays visible; active card highlighted. Shareable URLs for free. Rich tabs (Posts/Fields), breadcrumbs, resizable divider deferred to 1.5 follow-ups landing alongside 1.6 fields work.
- **2026-04-23 — Stack detail panels + Cards tab folded into Detail Panel v2 (1.7.5).** Stacks use the same side-panel shell as cards (same `?d=<nodeId>` URL contract, same Posts/Fields tabs); stack panels additionally get a "Cards" tab rendering a miniaturized list of child cards. Placement after 1.7 so divider resize ships once, and so the Cards tab can inherit drag-reorder from the cards-between-stacks work. All remaining 1.5 tab/breadcrumb work lives in 1.7.5 to keep panel polish in one section.
- **2026-04-24 — 1.7 Drag and Drop complete.** Cards drag between columns (updates field value), within a column (reorders position), and between stacks (reassigns parent). Stack rows drag to reorder. Field options drag-reorder in edit dialog (replaces ↑/↓ buttons). Resizable divider between Board and Detail via `ResizablePanelGroup`. All persisted via `moveCard` / `reorderStack` server actions with midpoint position calculation + cache invalidation. Panel rearrangement (layout positions) slipped to Phase 2 — no multi-panel infrastructure yet.
- **2026-04-23 — 1.6 Data Fields v1 complete.** Four field types live (single-select, multi-select, text, date). Detail panel renders a Fields section with inline editors; card previews show field badges; column field uses the same data. Field CRUD via QUAM (`⋯ → Edit`) dialog per Factor parity: rename, description, field-level color (all option badges in a field share it), locked toggle, option list add/rename/reorder/delete, delete field. "Add field" on the board toolbar opens a create dialog with type pills, color, and starter options. Migration 0005 moved color from `data_field_options` to `data_fields`; options keep only name + position. Drag-reorder of options deferred to 1.7.
- **2026-04-24 — 1.7.5 Detail Panel v2 complete (posts tab deferred to 1.10).** Breadcrumb, editable title, field badge header, owner/members avatar row. Stack panels open via `?d=<stackId>` with full Fields + Cards tabs; Cards tab has inline "+ Add card". Stack active state highlights the row header with accent border. Board-face inline editing: clicking any field badge on a card or stack opens a value-picker popover; hover pencil on card/stack title for direct rename without opening the panel. Stack QUAM (three-dot menu): Rename, Move up/down, Archive. Posts tab deferred — it requires the same `posts` table and feed infrastructure as 1.10 Newsfeed, so both will land together.

---

## Phase 1: WorkOS v0

**Goal:** A functional work management app that replaces Factor for personal and team use.

**UI source of truth:** [Work OS platform/work-os-ui-design-spec.md](Work%20OS%20platform/work-os-ui-design-spec.md). The design spec defines the layout shell, Board view, detail panel, design tokens, component hierarchy, and phase-annotated scope. This roadmap tracks build order and data/plumbing; the design spec tracks look and feel.

**Tech stack:** Next.js + TypeScript, Tailwind (with CSS custom properties for design tokens), Supabase (Postgres + Auth + Realtime), Zustand for client state, @dnd-kit for drag and drop, TipTap for rich text, Lucide React for icons, DM Sans + JetBrains Mono fonts.

### 1.1 Data Model Foundation — ✅ Complete

- [x] Recursive tree: every item is a **node**; nodes can have children of the same type; unlimited depth. Type labels (`workspace` / `stack` / `card`) are UI tags, not structural constraints
- [x] Node properties: title, description, type, status, position, created/updated timestamps
- [x] **Instance** layer above workspaces: a user or team has one instance; all workspaces, data fields, and actors belong to an instance
- [x] **Actors** table: humans and AI agents are the same entity kind; agents distinguished by a `kind` column for purple-ring avatar rendering
- [x] **Node owner + members:** owner is a single actor; members is a list of actors via a `node_members` join
- [x] Personal workspace auto-created per user (undeletable, renameable)
- [x] Migration 0001 (core node table) + 0002 (instance / actors / members / personal-workspace bootstrap) shipped

### 1.2 Design Foundation — ✅ Complete

- [x] CSS custom properties for the full light + dark design token palette from the design spec
- [x] Tailwind v4 `@theme inline` consumes the tokens (colors, spacing, radii, typography)
- [x] DM Sans + JetBrains Mono wired via `next/font`
- [x] ThemeProvider with light/dark/system toggle (OS default for users, dark personally); FOUC-safe init via `next/script strategy="beforeInteractive"`
- [x] Base global styles, utility classes for agent avatar ring, status pill, field badge colors (`.badge-1..6`, `.section-label`, `.avatar-agent-ring`)

### 1.3 Layout Shell — ✅ Complete

- [x] Collapsible sidebar (expanded ~260px / collapsed ~56px) with animated transition, state persisted
- [x] Sidebar sections: logo + collapse toggle, search button (non-functional placeholder), Personal workspace (with Feed/Board/Reminders), Workspaces list with + button
- [x] AI panel container visible from day one but non-functional (placeholder text "AI features coming in the next update")
- [x] 2-panel layout: Board + Detail side by side via `ResizablePanelGroup` *(completed in 1.5/1.7)*
- [x] Resizable divider between Board and Detail *(completed in 1.7)*

### 1.4 Board View (2D Matrix) — ✅ Complete

- [x] Stacks render as rows, columns driven by a single-select or multi-select data field
- [x] Column headers: field value name (as badge), card count badge
- [x] Stack headers: title, drag handle, QUAM (Rename, Move up/down, Archive)
- [x] Cards in the grid: title, description preview, field badges, inline rename, link to detail panel
- [x] Workspace-wide column-field picker in toolbar ("Columns: Status ▾")
- [x] Empty workspace state + `+ Add card` / `+ New Stack` / Filter placeholders
- [x] Stack reordering via drag and drop + quick action menu

### 1.4.25 Backend Perf Pass — ✅ Complete

- [x] Collapse `getWorkspaceBoard` into a single Postgres RPC function (`rpc_get_workspace_board`) → 1 round trip instead of 4 (migration 0003)
- [x] Add `unstable_cache` layer on read helpers (`getRootNodes`, `getNode`, `getChildren`, `getWorkspaceBoard`) with cache tags per node / workspace / instance
- [x] Tag invalidation helpers (`revalidateNode`, `revalidateWorkspaceBoard`, `revalidateRootNodes`) + `revalidatePath` in server actions
- [x] Switch server-side Supabase client to service role key (migration 0004 grants for completeness)
- [x] Production build verified via `next build` (runs on every feature)

### 1.4.5 Node Creation Pass — ✅ Complete

- [x] **Create workspace** — sidebar `+` opens inline input; server action creates workspace + auto-seeds "My First Stack"; routes user to new workspace
- [x] **Create stack** — Board `+ New Stack` toolbar button; inline input; appends to end
- [x] **Create card** — per-column `+ Add card` button; pre-populates the column field value so cards land in the clicked column
- [x] `InlineCreate` reusable component; Enter submits, Escape cancels, blur-empty cancels
- [x] All three via Server Actions with `revalidateTag` + `revalidatePath` cache invalidation

### 1.5 Detail Panel — ✅ Complete

- [x] Opens on card click as a **side panel next to the Board** via `?d=<nodeId>` query param; Board stays visible; URL is shareable
- [x] Active card highlighted in the Board; close button returns to `/n/<workspace>`
- [x] Server-rendered panel body with Suspense skeleton while streaming
- [x] Breadcrumb + editable title + field badges + owner/members *(completed in 1.7.5)*
- [x] Tabs: **Posts** (placeholder), **Fields** (Context tab lands in Phase 2)
- [x] Fields tab: system fields (Owner, Members, Type, Created, Updated), custom fields (inline-editable dropdowns / inputs / date pickers)
- [x] Resizable divider between Board and Detail *(completed in 1.7)*

### 1.6 Data Fields (Instance-Global) — ✅ Complete

- [x] Field types: single-select, multi-select, text, date
- [x] Fields are **global to the instance** — creating a field in any workspace makes it available to every stack in every workspace
- [x] Each select-type **field** has a badge color — all options within a field share it (matches Factor; decided 2026-04-22)
- [x] Field values display as pill badges on card previews and in the detail panel
- [x] Field CRUD UI (create, rename, add/remove values, reorder values)
- [x] Edit dialog: rename, description, color, locked toggle, option list, delete field — opened from QUAM (`⋯ → Edit`) on each field row
- [x] Option drag-reorder

### 1.7 Drag and Drop — ✅ Complete

- [x] Cards between columns (updates the column field's value on the card)
- [x] Cards within a column (reorders sort position)
- [x] Cards between stacks (reassigns parent)
- [x] Stack rows on the board (reorder)
- [x] Field option reorder inside the edit dialog
- [x] Panel dividers (resize) — between Board and Detail

### 1.7.5 Detail Panel v2 — ✅ Complete

Finishes the 1.5 deferred polish and extends the panel to stacks.

- [x] Breadcrumb + editable title + field badges + owner/members (card panels)
- [x] Tabs scaffold: **Posts** (placeholder) + **Fields** (Context tab lands in Phase 2)
- [x] **Stack detail panels** — stacks open the same side panel via `?d=<stackId>`; full parity with card panels (title, description, Posts, Fields, owner/members)
- [x] **Cards tab (stacks only)** — miniaturized card list for the stack's children; click to open card panel; add-card inline input
- [x] Active-node highlighting when a stack is open (accent border on the stack row header)
- [x] **Board-face inline editing** — click any field badge on a card or stack to change its value in a popover; hover pencil on card/stack title for direct rename without opening the panel
- [x] **Stack QUAM** — Rename, Move up/down, Archive from the three-dot menu on stack headers

### 1.8 Saved Views

- [ ] View tabs across the top of the board: each saved view stores filters, column field, sort order, stack ordering
- [ ] Starred view is the workspace default; [+] creates a new view from current config
- [ ] Toolbar: Filter (with active-count badge), + New Stack
- [ ] **Per-stack column-field override** — each stack can use a different column field within a view
- [ ] **Column header collapse/expand** — hide individual columns within a view
- [ ] **Per-workspace panel layout persistence** — remember which panels are open and at what sizes
- [ ] **Member/agent avatars on stack headers and cards** — show owner avatar on board face (data already in the model; requires board query to include owner_id per card/stack)

### 1.9 Context Linking

- [ ] Any node can link to any other node (stack/card, same or different workspace)
- [ ] Links are bidirectional
- [ ] "Linked Context" section on the detail panel with add/remove controls
- [ ] **Planning fields in detail panel** — Blocked by / Blocking relationships surface here once bidirectional links are live
- [ ] Foundational for Phase 2: linked context is auto-included when AI is invoked on a node

### 1.10 Posts + Newsfeed (fast follow)

Builds the shared posts infrastructure, then surfaces it in two places: the detail panel Posts tab and the workspace newsfeed. These share a single `posts` table and feed-query layer, so they ship together.

**Posts infrastructure (required by both)**
- [ ] `posts` table: node_id, actor_id, body (rich text), pinned, created_at; migration 0006
- [ ] `post_reactions` or inline field-change log entries (TBD schema)
- [ ] Server actions: createPost, updatePost, deletePost, pinPost

**Detail panel Posts tab (cards + stacks)**
- [ ] Pinned posts above chronological feed; post item (avatar, name, timestamp, rich text body)
- [ ] Field-change log entries interspersed in the feed
- [ ] Post composer: plain text for now, slash commands + @ mentions in Phase 2; Cmd+Enter to submit
- [ ] Pin / edit / delete actions on each post
- [ ] Agent posts render with purple-ring avatar + small "AI" label

**Workspace Newsfeed**
- [ ] In personal workspace: **My Feed** / **Workspace Feed** / **All Feed** tabs
- [ ] In other workspaces: **My Feed** / **Workspace Feed** tabs
- [ ] Feed items: source node header, actor avatar + timestamp, content (post, field change, new card, new link)
- [ ] Clicking a feed item opens the relevant card/stack in the detail panel

### 1.11 Data Migration (Burn + Personal Factor)

- [ ] Screen-scraping (no Factor API access)
- [ ] Map Factor workspaces → WorkOS workspaces, Factor stacks → stacks, Factor cards → cards, posts → posts, data fields → data fields (promoting to instance-global as needed)
- [ ] **Treat the migration itself as a live test of the "magic moment" migration concept** from the product spec: observe what surprises, what's missing, what the system could have inferred better. Capture those observations for the Path B cold-start migration design.

---

## Phase 2: BrainShare v0

**Goal:** Claude integrated into WorkOS with full context awareness, plus connections to external tools.

### 2.0 Layout Infrastructure (Phase 2 prerequisite)

Before the AI chat panel can ship as a first-class column, the shell needs to support 3 panels.

- [ ] AI chat panel shell — 3rd resizable column in the layout, toggled from any node
- [ ] Panel rearrangement via drag — reorder Board / Detail / AI columns
- [ ] Per-workspace panel layout persistence — remember column widths and open/closed state

### 2.1 Claude-in-Context

- [ ] AI chat panel accessible from any node (stack or card) via 2.0 shell
- [ ] When invoked, automatically includes as context: the node's posts, pins, data fields, linked items' titles and summaries
- [ ] User can ask questions, generate content, analyze, or brainstorm — all grounded in the node's accumulated context
- [ ] Conversation history persists per node

### 2.2 Workspace-Level AI

- [ ] AI chat accessible at the workspace level
- [ ] Context includes: all stacks and cards in the workspace (summaries), recent newsfeed activity
- [ ] For workspaces too large for context window: intelligent selection of most relevant items based on recency, status, and user focus

### 2.3 External Integrations

- [ ] **Google Calendar:** Pull upcoming events, surface scheduling context, allow Swarm to reference calendar when planning
- [ ] **Gmail:** Surface recent relevant emails in context, allow AI to draft responses grounded in WorkOS context
- [ ] **Google Drive:** Link drive documents to nodes, pull document content into AI context when relevant
- [ ] **Google Meet:** Pull meeting transcripts/summaries into relevant nodes (via Fathom/Granola)
- [ ] **Discord:** Bidirectional — pull Discord channel activity into relevant WorkOS nodes, push updates from WorkOS to Discord
- [ ] **Fathom/Granola:** Import meeting transcripts and summaries, attach to relevant cards/stacks automatically or manually

### 2.4 Context Assembly Engine

- [ ] System that intelligently assembles context for any AI invocation: node content + linked items + relevant external data
- [ ] Respects token limits — prioritizes by relevance, recency, and explicit user signals (pins, links)
- [ ] This is the core of BrainShare's value: the AI always has the right context without the user manually assembling it

---

## Phase 3: Swarm v0

**Goal:** AI orchestration layer that manages priorities, plans, and execution on top of WorkOS + BrainShare.

### 3.1 Weekly Prioritization + Calendaring

- [ ] Swarm reviews all active nodes across workspaces, weighted by data fields (priority, status, deadlines)
- [ ] Generates a proposed weekly focus plan: top priorities, key deliverables, time blocks
- [ ] User reviews and approves/adjusts
- [ ] Syncs approved plan to Google Calendar

### 3.2 Daily Plan + End of Day Summary

- [ ] Each morning: Swarm proposes a daily plan based on weekly priorities, calendar, and what happened yesterday
- [ ] User approves/adjusts
- [ ] End of day: Swarm generates a summary of what was accomplished, what moved, what's blocked
- [ ] Summary gets posted to a dedicated "daily log" node in WorkOS

### 3.3 Weekly Reflection

- [ ] End of week: Swarm generates a reflection — what got done vs. planned, what shifted, emerging patterns, suggested adjustments for next week
- [ ] References the daily summaries and any posts/updates made during the week
- [ ] User reviews and adds their own reflections

### 3.4 AI Task Delegation

- [ ] Based on weekly and daily plans, Swarm can identify tasks that Claude can do autonomously (drafting, research, analysis, content generation)
- [ ] Swarm queues these tasks, executes them, and posts results to the relevant WorkOS nodes for user review
- [ ] User approves, edits, or rejects outputs

### 3.5 Codex Integration

- [ ] Connect Swarm to Codex for background coding tasks
- [ ] Swarm can dispatch coding tasks based on WorkOS cards (e.g., "implement this feature described in card X")
- [ ] Results posted back to the card for review

---

## Phase 4: Setup Optimization

**Handle as needed throughout the build, not as a dedicated phase. Move items here when they become painful.**

- [ ] Shrink Claude API token limits to control costs
- [ ] Create .env for all API keys, manage dynamically
- [ ] Build AI index to cut token usage on large context windows
- [ ] Import saved Reddit and LinkedIn posts into WorkOS as reference nodes for BrainShare context enrichment

---

## Phase 5: Execution

**Goal:** Use the full stack (WorkOS + BrainShare + Swarm) to execute real projects.

### 5.1 Rebuild Burn

- [ ] Migrate Burn development workflow fully into WorkOS
- [ ] Use BrainShare for AI-assisted product decisions, spec writing, and analysis
- [ ] Use Swarm for sprint planning and coordination with Chris and Marek

### 5.2 AI Consulting Business

- [ ] Design and deliver Saglo Lunch & Learn series using WorkOS to manage curriculum, content, and delivery
- [ ] Use this as a template for repeatable AI training engagements
- [ ] Document the process as a portfolio piece for Anthropic

### 5.3 TribeWild Website

- [ ] Execute the full list of updates using WorkOS to manage tasks
- [ ] Use BrainShare + Swarm to coordinate and ship quickly

---

## Phase 6: Finiti (Future)

**Goal:** Workflow engine that creates and optimizes human-AI processes by observing patterns in your work.

### 6.1 Workflow Module

- [ ] Structured, multi-step process templates within WorkOS
- [ ] Each step can involve: human input, AI generation, human review, external tool action
- [ ] Steps are sequenced with defined inputs/outputs
- [ ] Users can create workflows manually

### 6.2 Workflow Creation Engine

- [ ] Finiti observes work patterns across WorkOS + BrainShare + Swarm over time
- [ ] Detects recurring sequences: "you do X, then Y, then Z every time you start a new article / onboard a client / plan a sprint"
- [ ] Proposes draft workflows based on detected patterns
- [ ] User reviews, adjusts, and activates
- [ ] Activated workflows become available as templates and can be triggered manually or by Swarm

### 6.3 Recursive Improvement

- [ ] Finiti monitors workflow execution and suggests refinements: "step 3 always gets edited heavily — want to adjust the prompt?"
- [ ] Workflows improve over time through usage data
- [ ] New workflows can be generated from sub-patterns within existing workflows

---

## Not On This Roadmap (Someday List — Separate)

- Reading consolidator (quiz after reading for retention)
- Meeting summarizer with retention questions
- Daily tech news digest tailored to goals/projects
- WorkOS flow for summarizing weekly work → publish to Medium/LinkedIn
- WorkOS flow for structured website vibing
- Mindfulness bell (hourly)
