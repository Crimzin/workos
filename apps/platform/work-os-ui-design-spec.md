# Work OS — UI/UX Design Specification

**Version:** 1.0  
**Purpose:** Complete design and build spec for the Work OS execution surface. This document tells you what to build, how it should look, how it should feel, and in what order. Phase annotations tell you what ships when.

---

## 1\. Design Identity

### Philosophy

Work OS is a coordination layer for teams of humans and AI. The design should feel like a calm, intelligent workspace — information-dense but breathable. Professional but warm. Think: a well-organized desk in a bright room with good lighting. Typography-driven hierarchy. Subtle, deliberate details.

### Aesthetic Direction

Warm industrial minimalism. Clean lines, generous but not wasteful whitespace, warm neutral tones, subtle texture. The UI should feel intentional and opinionated without being loud.

### Information Architecture

Work OS is organized in a clear hierarchy:

- **Instance** — the top-level container. A team or individual has one instance (e.g., "Burn"). All workspaces, data fields, and actors live inside it.  
- **Workspaces** — containers within an instance, like pages in Notion or boards in Figma. A typical instance has many workspaces (Launch, Items, Marketing, Development, etc.). Users create, rename, and archive workspaces freely.  
- **Stacks** — grouped containers within a workspace. Each stack appears as a row on the board.  
- **Cards** — atomic units of work within a stack. Each card appears as an element within a stack's row on the board.

**Personal workspace:** Every user gets a default personal workspace named "\[Name\]'s Workspace" (e.g., "Will's Workspace"). It cannot be deleted, but can be renamed. The personal workspace is where the "All Feed" tab lives (showing activity across all workspaces in the instance). Other workspaces only have "My Feed" and "Workspace Feed."

**Data fields are global to the instance.** A field created in any workspace is available to any stack in any workspace across the entire instance. This keeps field definitions consistent — a "Priority" field means the same thing everywhere.

---

## 2\. Design Tokens

### Color Palette — Light Mode

BACKGROUNDS

  \--bg-primary:     \#FAFAF8       warm off-white, main background

  \--bg-secondary:   \#F2F1EE       sidebar, secondary panels

  \--bg-card:        \#FFFFFF       cards and elevated surfaces

  \--bg-hover:       \#EEEDEA       hover state

  \--bg-selected:    \#E8E6E1       selected/active state

TEXT

  \--text-primary:   \#1C1C1A       primary text, near-black

  \--text-secondary: \#6B6966       secondary/muted text

  \--text-tertiary:  \#9C9A96       placeholder, disabled text

ACCENT

  \--accent:         \#E85D3A       warm terracotta — primary interactive color

  \--accent-hover:   \#D14E2D       darker on hover

  \--accent-subtle:  \#FDF0EC       very light accent for backgrounds

STATUS COLORS

  \--status-none:    \#9C9A96       gray — no status

  \--status-active:  \#4A90D9       blue — in progress

  \--status-review:  \#E8A838       amber — needs review

  \--status-done:    \#5CB85C       green — complete

  \--status-blocked: \#D9534F       red — blocked/urgent

FIELD BADGE COLORS (for data field value pills)

  \--badge-1:  \#E8D5B7       warm sand

  \--badge-2:  \#B8D4E3       soft blue

  \--badge-3:  \#D4C5E8       soft purple

  \--badge-4:  \#C5E8D4       soft green

  \--badge-5:  \#E8C5C5       soft rose

  \--badge-6:  \#E8E0C5       soft gold

BORDERS

  \--border:         \#E2E0DC       subtle warm gray

  \--border-strong:  \#D0CEC9       stronger for emphasis

AGENT INDICATOR

  \--agent-accent:   \#8B6CEF       soft purple — distinguishes AI actors from humans

### Color Palette — Dark Mode

BACKGROUNDS

  \--bg-primary:     \#151517       deep charcoal

  \--bg-secondary:   \#1C1C1F       sidebar, secondary panels

  \--bg-card:        \#222225       cards and elevated surfaces

  \--bg-hover:       \#2A2A2E       hover state

  \--bg-selected:    \#32323A       selected/active state

TEXT

  \--text-primary:   \#E8E6E1       primary text, warm white

  \--text-secondary: \#9C9A96       secondary/muted text

  \--text-tertiary:  \#6B6966       placeholder, disabled text

ACCENT

  \--accent:         \#F07052       slightly lighter terracotta for dark backgrounds

  \--accent-hover:   \#E85D3A       on hover

  \--accent-subtle:  \#2A1F1C       very dark accent tint for backgrounds

STATUS COLORS (same hues, adjusted for dark backgrounds)

  \--status-none:    \#6B6966

  \--status-active:  \#5A9DE0

  \--status-review:  \#F0B84A

  \--status-done:    \#6BC96B

  \--status-blocked: \#E06060

FIELD BADGE COLORS (muted for dark backgrounds)

  \--badge-1:  \#3D3528       warm sand

  \--badge-2:  \#283540       soft blue

  \--badge-3:  \#352840       soft purple

  \--badge-4:  \#283D28       soft green

  \--badge-5:  \#3D2828       soft rose

  \--badge-6:  \#3D3828       soft gold

BORDERS

  \--border:         \#2E2E32

  \--border-strong:  \#3A3A40

AGENT INDICATOR

  \--agent-accent:   \#9B80F0       slightly brighter purple for dark mode

### Typography

FONTS

  Display \+ Body:   'DM Sans', sans-serif

  Monospace:        'JetBrains Mono', monospace

SCALE

  \--text-xs:    0.75rem  / 12px      badges, timestamps

  \--text-sm:    0.8125rem / 13px     field labels, secondary info

  \--text-base:  0.875rem / 14px      body text, card titles

  \--text-lg:    1rem     / 16px      section headers

  \--text-xl:    1.25rem  / 20px      stack titles, page titles

  \--text-2xl:   1.5rem   / 24px      workspace titles

WEIGHT

  Normal:    400

  Medium:    500

  Semibold:  600

  Bold:      700

CONVENTIONS

  Section labels:    \--text-xs, semibold, uppercase, letter-spacing 0.05em, \--text-tertiary

  Card titles:       \--text-base, medium, \--text-primary

  Stack titles:      \--text-xl, semibold, \--text-primary

  Timestamps:        \--text-xs, monospace, \--text-tertiary

### Spacing

  \--space-1:  4px       tight internal padding

  \--space-2:  8px       card padding, badge padding, gap between cards

  \--space-3:  12px      field rows, section gaps

  \--space-4:  16px      section padding

  \--space-5:  20px      panel padding

  \--space-6:  24px      major section gaps

  \--space-8:  32px      page-level margins

### Borders and Radii

  \--radius-sm:  4px       badges, small elements

  \--radius-md:  6px       cards, inputs

  \--radius-lg:  8px       panels, modals

  Cards:         1px solid var(--border), radius var(--radius-md)

  Cards hover:   border-color var(--border-strong), box-shadow 0 1px 3px rgba(0,0,0,0.06)

  Panels:        box-shadow 0 1px 3px rgba(0,0,0,0.06)

---

## 3\. Layout Architecture

### Overview

The screen is divided into two zones: a fixed sidebar on the left, and a flexible panel workspace to its right.

\+------------+-------------------------------------------+

|            |                                           |

|  SIDEBAR   |        FLEXIBLE PANEL WORKSPACE           |

|  (fixed)   |        (up to 3 panels, resizable,        |

|            |         user-arranged)                     |

|            |                                           |

\+------------+-------------------------------------------+

### Sidebar

The sidebar is fixed on the left edge. It has two states:

**Expanded (\~260px):** Shows icons \+ text labels for all navigation items.

**Collapsed (\~56px):** Shows icons only. Text labels hidden. Hovering an icon shows a tooltip. The user toggles between states with a collapse/expand button. Transition is animated.

### Flexible Panel Workspace

The area to the right of the sidebar supports **up to 3 panels** arranged in any configuration. Each panel holds one content type:

- **Board/View panel** — the 2D kanban board  
- **Detail panel** — card or stack detail (posts, fields, context)  
- **AI panel** — unified AI conversation surface

The user can:

- **Resize** panels by dragging the divider between them  
- **Rearrange** panels by dragging and snapping to different positions  
- **Close** panels (except Board — at least one view panel is always present)

Layout persists per workspace.

#### Supported Arrangements

Any combination of 1, 2, or 3 panels:

1 panel: Full-width board

\+-------------------------------------------+

|                                           |

|                  Board                    |

|                                           |

\+-------------------------------------------+

2 panels: Side by side

\+---------------------+---------------------+

|                     |                     |

|       Board         |      Detail         |

|                     |                     |

\+---------------------+---------------------+

2 panels: Stacked

\+-------------------------------------------+

|                  Board                    |

\+-------------------------------------------+

|                AI Panel                   |

\+-------------------------------------------+

3 panels: Two columns \+ bottom

\+---------------------+---------------------+

|                     |                     |

|       Board         |      Detail         |

|                     |                     |

\+---------------------+---------------------+

|                AI Panel                   |

\+-------------------------------------------+

3 panels: Three columns

\+-------------+---------------+-------------+

|             |               |             |

|    Board    |    Detail     |  AI Panel   |

|             |               |             |

\+-------------+---------------+-------------+

3 panels: Top \+ two bottom

\+-------------------------------------------+

|                  Board                    |

\+---------------------+---------------------+

|      Detail         |     AI Panel        |

\+---------------------+---------------------+

#### Default Layout (new workspace)

\+-------------------------------------------+

|                                           |

|                  Board                    |

|                                           |

\+-------------------------------------------+

| AI Panel (collapsed, \~48px tall)          |

\+-------------------------------------------+

AI panel visible by default but minimized — a thin input bar with placeholder text. When the user clicks a card, the detail panel appears by splitting the board area into two columns.

#### AI Panel States

**Collapsed (\~48px):** Thin horizontal bar with text input. Placeholder: "Ask anything..." and expand toggle. User can type directly into this bar.

**Expanded (\~300-400px):** Conversation history above input. Resizable by dragging top edge.

**Phase 1 note:** The AI panel container exists in the layout but is non-functional. Shows collapsed bar with message "AI features coming in the next update" and a subtle icon. Layout includes it from day one so no layout changes are needed when BrainShare ships.

---

## 4\. Sidebar

### Structure

\+---------------------------+

|  \[Logo\] WORK OS     \[\<\>\]  |    logo \+ collapse toggle

|                           |

|  \[icon\] Search            |    global search / command palette

|                           |

|  \--- PERSONAL \---         |

|  \[avatar\] Will's Workspace|    personal workspace (can't be deleted)

|    \[icon\] Feed            |    personal feed (has All Feed tab)

|    \[icon\] Board           |

|    \[icon\] Reminders       |

|                           |

|  \--- WORKSPACES \---  \[+\]  |

|  \[icon\] Launch            |

|  \[icon\] Items             |

|  \[icon\] Marketing         |

|  \[icon\] Development       |

|  \[icon\] ...               |

|                           |

\+---------------------------+

### Workspace Expanded

Clicking a workspace expands it inline:

  \[icon\] Development  \[...\]     workspace name \+ three-dot menu

    \[icon\] Feed                 workspace newsfeed

    \[icon\] Board                workspace board

Two items per workspace. The three-dot menu: Rename, Settings, Archive.

### Collapsed Sidebar

Icons only in a narrow column (\~56px). Tooltips on hover. Workspaces show first letter or custom emoji as icon.

---

## 5\. Board View (2D Matrix)    \[Phase 1\]

The board is the primary view and core UX of Work OS.

### The 2D Matrix

A two-dimensional grid where **stacks are rows** and **columns are driven by the values of a data field.**

                  | Backlog   | In Progress | Review    | Done      |

\+-----------------+-----------+-------------+-----------+-----------+

| STACK:          |           |             |           |           |

| Auth system     | \[card\]    | \[card\]      | \[card\]    |           |

|                 | \[card\]    |             |           |           |

\+-----------------+-----------+-------------+-----------+-----------+

| STACK:          |           |             |           |           |

| Onboarding      | \[card\]    |             | \[card\]    | \[card\]    |

| flow            |           |             |           | \[card\]    |

\+-----------------+-----------+-------------+-----------+-----------+

| STACK:          |           |             |           |           |

| API v2          |           | \[card\]      |           |           |

|                 |           | \[card\]      |           |           |

\+-----------------+-----------+-------------+-----------+-----------+

### Field-Driven Columns

Columns are generated from the values of a **list-type data field** (single-select or multi-select). Each stack selects which field drives its columns.

**Per-stack column fields:** Each stack independently chooses which data field drives its columns. One stack might use "Status" while another uses "Priority" or "Dev Cycle."

**Switching column fields:** The user changes which field drives columns for a stack via a quick action on the stack header. A dropdown shows all eligible list-type fields. Selecting a different field re-renders columns for that stack. Only single-select and multi-select fields are eligible — text, date, and number fields do not appear.

### Column Headers

  BACKLOG          12   |   IN PROGRESS     3   |   REVIEW     1   |

- Column name (the field value), uppercase, \--text-sm, semibold  
- Card count in a subtle circle badge  
- Click to collapse/expand

### Stack Headers (Row Headers)

\+--------------------------+

|  STACK                   |   small uppercase label

|  Auth system             |   stack title, \--text-xl

|                          |

|  Column field: Status v  |   clickable dropdown to change column field

|                          |

|  \[badge\] \[badge\] \[badge\] |   data field summary badges

|  \[avatar\] \[avatar\] \[+1\]  |   member/agent avatars

|  \[...\]                   |   three-dot menu

\+--------------------------+

Three-dot menu includes:

- Edit stack (rename, description)  
- Change column field  
- **Move up / Move down** (reorder stack on board)  
- New card  
- Archive stack

### Stack Reordering

Stacks can be reordered on the board two ways:

1. **Drag and drop:** Grab the stack header and drag up/down. Visual indicator shows drop position.  
2. **Quick action menu:** "Move up" / "Move down" in the three-dot menu.

Stack order persists per workspace.

### Cards in the Grid

\+---------------------------+

| Fix login timeout issue   |   card title

|                           |

| \[badge\] Medium  \[badge\] Bug |  data field badges

| \[avatar\] Will  \[avatar\] Claude |  owner/member avatars

|                        \[...\] |  three-dot menu on hover

\+---------------------------+

Cards: \--bg-card, 1px solid \--border. Hover: border darkens, subtle shadow. Click opens detail panel.

Agent avatars show \--agent-accent purple ring.

### Adding Cards

"+ Add card" button per grid cell, appears on hover. Creates new card with column field pre-set.

### Drag and Drop

- **Between columns:** Updates card's column field value  
- **Within column:** Reorder sort position  
- **Between stacks:** Reassign card to different stack

### Scrolling

- Horizontal for more columns  
- Vertical for more stacks  
- Column headers sticky at top

---

## 6\. Saved Views    \[Phase 1\]

### View Tabs

\+-------------------------------------------------------------------+

|  \[\*\] Kanban  |  Sprint  |  By Priority  |  \[+\]    \[Filter 3\] \[+ New Stack\] |

\+-------------------------------------------------------------------+

Each saved view stores: filters, column field per stack, sort order, stack ordering.

Starred view (\*) is the workspace default. \[+\] creates new saved view from current config.

### Toolbar (right side)

- **Filter (count):** Active filters with count badge  
- **\+ New Stack:** Create new stack

---

## 7\. Stacks and Cards — Data Model    \[Phase 1\]

### Recursive Tree Model

Every item is the same base type: a **node.** Nodes can have children, supporting unlimited depth. Type labels (workspace, stack, card) are tags for UI rendering.

Phase 1 renders one level of nesting: workspaces contain stacks, stacks contain cards.

### Node Properties

- **Title** (text, editable inline)  
- **Description** (rich text, optional)  
- **Type label** (workspace / stack / card)  
- **Created date** (auto)  
- **Updated date** (auto)  
- **Owner** (single actor — human or agent)  
- **Members** (list of actors)  
- **Data field values** (per the instance's defined fields)  
- **Post stream** (chronological posts — see section 8\)  
- **Pins** (pinned posts for persistent reference)  
- **Links** (bidirectional references to other nodes — see section 10\)

### Data Fields    \[Phase 1\]

Data fields are **global to the instance.** A field created anywhere is available to any stack in any workspace across the entire instance. This ensures consistent field definitions — "Priority" means the same thing whether it's used in the Launch workspace or the Development workspace.

**Field types:**

- **Single-select:** One value from a predefined list. Each option has a name; the **field** has one badge color shared by all its options.  
- **Multi-select:** One or more values from a predefined list. Same color model — one badge color per field, shared across all options.  
- **Text:** Free text.  
- **Date:** Calendar date.

Values display as colored pill badges on card previews.

### Context Fields    \[Phase 2\]

Additional fields when BrainShare is active:

- **Rationale:** Rich text. WHY this card exists.  
- **Assumptions:** List of objects: statement, status (untested/validated/invalidated), linked decisions.  
- **Decisions:** List of objects: statement, rationale, participants (human/agent), timestamp, status (active/superseded/reversed).

---

## 8\. Card/Stack Detail Panel    \[Phase 1\]

Opens when a card or stack is clicked. One of the three panel types in the flexible layout.

### Header

\+----------------------------------------------+

| @ Development / Auth system / Fix login...   |   breadcrumb

|                                         \[x\]  |   close

|                                              |

| Fix login timeout issue                      |   editable title

|                                              |

| \[badge\] Medium  \[badge\] Bug                  |   field badges

| \[avatar\] Will  \[avatar\] Claude               |   owner \+ members

\+----------------------------------------------+

### Tab Navigation

**Phase 1:**

  Posts    Fields

**Phase 2 (BrainShare active):**

  Posts    Fields    Context

### Posts Tab    \[Phase 1\]

Chronological feed of posts and activity. Both stacks AND cards have post streams.

Contents:

- User and agent posts (avatar, name, timestamp, rich text)  
- Field change history  
- @ mentions highlighted with \--accent  
- Attached files and images

Post actions on hover: Edit, Pin, Delete.

**Pins:** Any post can be pinned to top of stream. Pinned posts appear in a "Pinned" section above chronological feed. Multiple posts can be pinned.

**Compose area:**

\+----------------------------------------------+

| Members: Will, Claude, \+2                    |

| \[Paragraph v\] \[Insert\] \[Table\] \[Lists\]       |

|                                              |

| Type / to insert                             |

| Type @ to mention someone                    |

|                              \[POST cmd+enter\] |

\+----------------------------------------------+

Agent posts display with \--agent-accent purple ring and small "AI" label.

### Fields Tab    \[Phase 1\]

Field names on left, editable values on right:

SYSTEM FIELDS

  Owner ................... \[avatar\] Will

  Members ................. \[avatar\] Will, \[avatar\] Claude, \[avatar\] Marek

  Type .................... Card

  Created ................. Apr 20, 2026

  Updated ................. Apr 22, 2026

CUSTOM FIELDS                                    \[+ Add field\]

  Status .................. \[badge\] In Progress  v

  Priority ................ \[badge\] Medium  v

  Estimate ................ 3h

  Dev cycle ............... \[badge\] Testing  v

PLANNING FIELDS

  Blocked by .............. \[link\] API rate limits

  Blocking ................ \[link\] Onboarding flow v2

  Start date .............. Apr 20

  Due date ................ Apr 28

Values editable inline via dropdowns, text inputs, date pickers.

**Phase 2 addition:** "CONTEXT FIELDS" section with Rationale, Assumptions, Decisions.

### Context Tab    \[Phase 2\]

BrainShare-powered:

- Linked context (all linked nodes)  
- Auto-linked items (BrainShare-proposed connections)  
- Related decisions from other nodes  
- Contradictions detected  
- Drift alerts (stale assumptions, decaying decisions)

---

## 9\. Newsfeed    \[Phase 1 — fast follow\]

Chronological feed of recent activity across all workspaces.

### Sub-tabs

Newsfeed tabs depend on which workspace you're in:

**In personal workspace:**

  My Feed    |    Workspace Feed    |    All Feed

**In any other workspace:**

  My Feed    |    Workspace Feed

- **My Feed:** Mentions, assignments, updates on owned cards (scoped to current workspace)  
- **Workspace Feed:** All activity in current workspace  
- **All Feed:** Activity across ALL workspaces in the instance (only available in personal workspace)

### Feed Items

- Source node as header (clickable)  
- Actor avatar \+ name \+ timestamp  
- Content: post text, field changes, new cards, new links  
- Click opens relevant card/stack in detail panel

### Swarm Posts    \[Phase 3\]

Interactive Swarm posts with action buttons:

\+-------------------------------------------------+

|  \[lightning\] SWARM  ·  Daily Plan     10:00 AM  |

|                                                 |

|  Good morning. Here's your focus for today:     |

|                                                 |

|  3 cards ready for review                       |

|  1 card blocked                                 |

|  2 tasks delegated to Claude                    |

|                                                 |

|  Recommended focus:                             |

|  1\. Fix login timeout (blocking onboarding)     |

|  2\. Review Claude's PR on token rotation        |

|                                                 |

|  \[Approve plan\] \[Adjust\] \[Dismiss\]              |

\+-------------------------------------------------+

---

## 10\. Context Linking    \[Phase 1\]

Any node can link to any other node: stack-to-stack, card-to-card, stack-to-card, cross-workspace.

- Links are **bidirectional:** linking A to B shows B linked to A  
- Created via "Link" action in detail panel or three-dot menu  
- Linked items visible in "Linked Context" section on detail panel

LINKED CONTEXT                               \[+ Add link\]

  \[card icon\] API rate limits          @ Development

  \[stack icon\] Auth strategy           @ Strategy

  \[card icon\] User research findings   @ Design

**Phase 2:** Linked context auto-included when AI is invoked on a node.

---

## 11\. AI Surface    \[Phase 2\]

Unified conversation panel handling BrainShare (context queries, memory, content generation) and Swarm (planning, prioritization, alignment). User talks to one AI — routing happens behind the scenes.

### Panel Behavior

The AI panel is one of three panel types. Placed anywhere in the flexible layout.

**Collapsed (\~48px):** Thin bar, text input, placeholder "Ask anything...", expand toggle.

**Expanded (\~300-400px):** Conversation history above input. Resizable.

### Context Awareness

Automatically aware of current view. When viewing a card, context includes posts, pins, fields, linked items. Navigating updates context.

Context indicator:

  Context: Development \> Auth system \> Fix login timeout    \[x\]

Clear context to ask general questions.

### Conversation Persistence

Persists across navigation. Context shifts noted inline:

  \[context shifted to: Onboarding flow \> Welcome screen\]

---

## 12\. Actor Model    \[Phase 1\]

Humans and AI agents are the same kind of entity: **actors.**

### Human Actors

- Circular avatar (photo or initials)  
- Name displayed normally

### Agent Actors

- Circular avatar with \--agent-accent purple ring (2px solid)  
- Icon per type: Claude (diamond), Claude Code (terminal), Swarm (lightning), BrainShare (brain)  
- Small "AI" label next to name  
- Agent-owned cards show purple-ringed avatar

### Where Actors Appear

- Card/stack owner and member fields  
- Board view card avatars  
- Newsfeed posts  
- Detail panel member lists  
- Decision participant lists (Phase 2\)

---

## 13\. Data Migration    \[Phase 1\]

Import from existing tools:

- Map external stacks/projects to stacks  
- Map external cards/tasks to cards  
- Map posts/comments to post streams  
- Map data fields  
- Preserve dates, ownership, status

---

## 14\. Interaction Patterns    \[Phase 1\]

### Keyboard Shortcuts

- Cmd+K / Ctrl+K: Search / command palette  
- Cmd+Enter: Submit post  
- /: Slash commands  
- @: Mention person or agent  
- N: New card (board focused)  
- Esc: Close detail panel

### Drag and Drop

- Cards between columns (updates column field value)  
- Cards between stacks (reassigns)  
- Cards within column (reorder)  
- Stacks on board (reorder rows)  
- Panel dividers (resize)  
- Panels to different positions (rearrange layout)

### Inline Editing

- Titles editable in place  
- Field values via dropdowns/inputs  
- Posts editable after creation

### Context Menus (right-click or three-dot)

- Cards: Move to stack, Change column value, Assign owner, Link to..., Copy link, Archive  
- Stacks: Change column field, Rename, Move up, Move down, New card, Archive  
- Posts: Edit, Pin/Unpin, Delete

---

## 15\. Responsive Behavior    \[Phase 1\]

- **Desktop (\>1200px):** Full flexible panel layout  
- **Tablet (768-1200px):** Sidebar collapses to icons, max 2 panels  
- **Mobile (\<768px):** Sidebar is drawer, single panel, detail as full screen overlay

---

## 16\. Empty States    \[Phase 1\]

### Empty Workspace

\+----------------------------------------+

|                                        |

|   This workspace is empty.             |

|   Create your first stack to start.    |

|                                        |

|   \[+ Create Stack\]                     |

|                                        |

\+----------------------------------------+

### Empty Stack

  No cards yet.  \[+ Add a card\]

### Empty Post Stream

  No posts yet. Start a conversation.

---

## 17\. Phase Summary

### Phase 1: WorkOS v0 — Build Now

- Flexible panel layout (3 panels, resizable, rearrangeable)  
- Collapsible sidebar with workspace navigation  
- Personal workspace (default, undeletable, has All Feed)  
- 2D Board view (stacks x field-driven columns)  
- Per-stack column field selection  
- Stack reordering (drag/drop \+ quick action)  
- Cards with post streams, pins, data fields, inline badges  
- Detail panel with Posts and Fields tabs  
- Data fields (single-select, multi-select, text, date) global to instance  
- Saved views as tabs  
- Context linking (any node to any node, bidirectional)  
- Newsfeed (fast follow)  
- Drag and drop throughout  
- Dark mode \+ light mode  
- Agent actor rendering (purple-ringed avatars, ownership)  
- Data migration from existing tool  
- AI panel container (visible but non-functional placeholder)  
- Recursive tree data model (renders one level)

### Phase 2: BrainShare v0

- AI panel becomes functional (Claude-in-Context)  
- Context auto-assembly (posts, pins, fields, linked items fed to AI)  
- Context Fields on cards: Rationale, Assumptions, Decisions  
- Context tab on detail panel  
- External integrations (Google Calendar, Gmail, Drive, Discord, meeting tools)

### Phase 3: Swarm v0

- Swarm flows as interactive newsfeed posts (Daily Plan, End of Day, Weekly Prioritization, Weekly Reflection)  
- Swarm accessible through AI panel  
- AI task delegation  
- Codex integration

### Future

- Composable views (multiple view types on one page)  
- Additional view types: Roadmap, Gallery, List  
- Drift detection alerts  
- Finiti workflow module  
- Deeper nesting in UI

---

## 18\. Component Hierarchy

App

\+-- ThemeProvider (light/dark mode)

\+-- Sidebar

|   \+-- Logo \+ CollapseToggle

|   \+-- SearchButton

|   \+-- PersonalWorkspace (can't be deleted, has All Feed)

|   |   \+-- UserAvatar \+ WorkspaceName

|   |   \+-- NavItem (Feed)

|   |   \+-- NavItem (Board)

|   |   \+-- NavItem (Reminders)

|   \+-- WorkspaceList

|   |   \+-- WorkspaceItem (expandable)

|   |       \+-- NavItem (Feed)

|   |       \+-- NavItem (Board)

|   \+-- CreateWorkspaceButton

\+-- FlexiblePanelWorkspace

    \+-- TopBar

    |   \+-- ViewTabs (saved views)

    |   \+-- Toolbar (Filter, \+ New Stack)

    \+-- PanelContainer (manages up to 3 panels)

        \+-- PanelDividers (draggable resize handles)

        \+-- BoardPanel

        |   \+-- ColumnHeaders (per stack, driven by field values)

        |   \+-- StackRow (repeats per stack)

        |   |   \+-- StackHeader (title, column field selector, badges, avatars, menu)

        |   |   \+-- CardCell (repeats per column)

        |   |       \+-- Card (title, badges, avatars)

        |   |       \+-- AddCardButton (on hover)

        |   \+-- AddStackButton

        \+-- DetailPanel

        |   \+-- Breadcrumb

        |   \+-- NodeHeader (title, badges, avatars)

        |   \+-- TabNav (Posts, Fields, \[Context Phase 2\])

        |   \+-- PostsTab

        |   |   \+-- PinnedPosts

        |   |   \+-- PostStream

        |   |   |   \+-- PostItem (avatar, name, timestamp, content, actions)

        |   |   |   \+-- FieldChangeItem

        |   |   \+-- PostComposer

        |   \+-- FieldsTab

        |   |   \+-- SystemFields

        |   |   \+-- CustomFields

        |   |   \+-- ContextFields (Phase 2\)

        |   |   \+-- PlanningFields

        |   \+-- ContextTab (Phase 2\)

        \+-- AIPanel

            \+-- CollapsedBar (input \+ expand toggle)

            \+-- ExpandedView (conversation history \+ input)

            \+-- ContextIndicator

---

## 19\. Tech Stack

- **Framework:** React \+ TypeScript  
- **Styling:** Tailwind CSS with CSS custom properties for design tokens  
- **State:** React context or Zustand  
- **Backend:** Supabase (Postgres \+ Auth \+ Realtime)  
- **Icons:** Lucide React  
- **Drag and drop:** @dnd-kit  
- **Rich text:** TipTap or ProseMirror  
- **Fonts:** DM Sans \+ JetBrains Mono (Google Fonts)

