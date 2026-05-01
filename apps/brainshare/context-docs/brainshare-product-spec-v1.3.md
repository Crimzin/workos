# BrainShare — Product Specification v1.3

*The teammate in charge of context.*

Will Corbett · April 2026 · DRAFT · **Confidential**

---

# 1. What BrainShare Is

BrainShare is the shared brain for your team. It connects to your tools, builds a structured understanding of your work, and makes sure the right context is in the right place at the right time — for humans and AI agents alike.

BrainShare does not plan your week. It does not tell you what to prioritize. It does not facilitate sessions. Those are Swarm's job.

BrainShare's job is simpler and more fundamental: **when anyone on your team acts — in any tool, in any conversation, with any AI — they have the context they need.** No copy-pasting between tools. No re-explaining projects to new AI sessions. No decisions lost in Slack threads. No specs that are out of date. No teammates working on outdated information.

BrainShare is the teammate who has access to every tool, reads everything, remembers everything, and speaks up at just the right moment.

---

# 2. Core Promise

**Every tool up to date. Every AI smarter. No more switching costs between tools in a workflow.**

You should never have to:
- Paste a ChatGPT link into a Claude chat
- Re-explain your project to a new AI session
- Tell a contractor what changed since last week
- Manually copy context from Slack into Notion
- Lose a decision because it was made in a thread nobody can find
- Wonder whether the Figma designs match the project cards
- Discover after the fact that a spec changed and nobody told you

---

# 3. BrainShare's UI Is WorkOS

BrainShare is not a separate application. **Its UI is WorkOS.** BrainShare is an entry point into WorkOS — the context-first door.

Users who enter through BrainShare experience a chat-first interface. Users who enter through WorkOS directly experience a board-first interface. Both end up in the same product.

This matters because:
- BrainShare needs a visual representation of its context map for users who want detail — that's the WorkOS board
- There is no "migrate from BrainShare to WorkOS" step — the user was always in WorkOS
- The structured map BrainShare generates during onboarding IS the WorkOS instance
- This is the cleanest possible graduation path: one click to see the board, and it's already populated

---

# 4. The BrainShare-First User Experience

## 4.1 Stage 1: The Chat

When a BrainShare-first user signs up, they land in a **chat interface.** The main content area is a conversation thread with BrainShare — just like talking to Claude. No board. No stacks. No cards visible. Just a conversation.

Events from connected tools appear in the same stream as BrainShare's messages: "Marek updated the notifications designs in Figma" alongside "BrainShare: I linked those designs to the Notifications card." One continuous timeline of things that happened + BrainShare's observations + the user's questions and instructions.

When BrainShare needs to show something rich — a proposed match between a Figma frame and a card, a decision diff, a priority map — it renders inline in the chat as an interactive block, or opens a side panel for detail.

The sidebar shows connected tools, the user's personal workspace, and any workspaces BrainShare has created. But the Board nav item is not prominent — the chat is the primary experience.

## 4.2 Cross-Tool Conversation Hopping

Early in the onboarding conversation, BrainShare says: "Want to continue this conversation in [Slack/Discord]?"

The user clicks. Opens Slack. The conversation picks up exactly where it left off. No re-explaining. No context loss. **BrainShare just proved its core promise in 10 seconds.**

From that point forward, the user can talk to BrainShare wherever they are — the web app, Slack, Discord — and it's the same conversation, the same memory, the same context.

## 4.3 Stage 2: BrainShare as Context Layer in Existing Tools

The user keeps using their existing tools — Notion, ClickUp, Slack, Figma. BrainShare operates inside those tools:

- Posts in Slack when something contradicts a decision
- Creates pages in Notion when decisions are made in Slack
- Links Figma frames to Notion pages (or ClickUp tasks, or whatever the user has)
- Feeds relevant context into Claude/ChatGPT sessions so the AI already knows the project
- Updates cards in the user's PM tool when context changes elsewhere

The user may rarely open the BrainShare web app directly. They experience BrainShare through their existing tools.

## 4.4 Stage 3: BrainShare as Central Dashboard

Over time, the user starts opening the BrainShare web app to query context and see the big picture:

- "Show me all unresolved decisions"
- "What's the status of onboarding across all our tools?"
- "What has Marek been working on this week?"

The WorkOS UI is there — stacks, cards, fields — but functioning as a read-only context map. The user isn't managing work here yet. They're understanding work here.

## 4.5 Stage 4: The Friction Moment

BrainShare has been watching the user fight with their tools for weeks. It's been patching ClickUp structure, creating Notion pages, linking things that should have been linked. It can measure the tax.

BrainShare surfaces this naturally in the chat: "I've been maintaining your work across 3 tools for the past month. I've patched 47 gaps, linked 83 items, and created 23 pages on your behalf. Want to see what this would look like in one place?"

The Board tab in the sidebar glows with a warm, highlighted outline. One click, and the user sees their work — already structured, already populated, already groomed — in a purpose-built surface.

## 4.6 Stage 5: WorkOS

The user is now in WorkOS. They entered through BrainShare's door, but they're home. The board is populated. The stacks are organized. The cards have context. BrainShare continues running underneath, keeping everything in sync with external tools. Swarm can now be layered on top for operational intelligence.

---

# 5. Onboarding: The First Magic Moment

## 5.1 Connect Tools

The user checks off which tools they use (Discord, Slack, Notion, Figma, Google Drive, ClickUp, Claude, ChatGPT, etc.). OAuth connects them.

## 5.2 Cascading Analysis

BrainShare analyzes tools one at a time, streaming insights as they arrive. The user watches BrainShare think in real time.

**Seconds 0-3:** "Connecting to Discord... found 4 team members. Connecting to Factor... found 127 cards across 10 workspaces. Connecting to Figma... found 48 design files."

**Seconds 3-10:** First insight from the fastest source. "Your team: Will, Ziga, Marek, Chris. Working on Burn — a social fitness game for iOS." The user is already reading. Already engaged.

**Seconds 10-30:** Deeper analysis, tool by tool. "Scanning Factor cards against Figma frames... found 14 cards with no design counterpart. Found 30 Figma frames with no card counterpart."

**Seconds 30-60:** The synthesis layer. Cross-tool observations, structural findings, unresolved decisions.

The key: **first visible output within 2-3 seconds.** Total processing time matters much less than time-to-first-token. Users perceive streaming responses as 40-60% faster than equivalent non-streaming responses.

## 5.3 The Company Snapshot

BrainShare presents its synthesized understanding:

"OK, here's my understanding of your team and your project. 4 teammates working on Burn, a social fitness game for iOS. You've been at it for 5 years on and off and have gone through two major redesigns. You're currently sprinting toward a summer 2026 public launch based on a new, fully gamified UI. You work mostly autonomously across 3 timezones, convening once a week for sprint planning, with somewhat inconsistent attendance."

The user confirms, corrects, or adds context. This is BrainShare building its Foundation layer — and the user is teaching it in a natural conversational flow.

## 5.4 Context Cleanup Tasks

BrainShare surfaces what it found, organized as a checklist in a side panel. The chat walks the user through each task conversationally. The main content shows the relevant artifact. The user can go off-path by clicking into any task.

**Missing connections:**
- Cards without designs (Figma ↔ PM tool gap)
- Designs without cards (designer went rogue)
- Decisions made in chat that aren't captured durably
- Code PRs that relate to cards but aren't linked
- Documents in Drive that relate to active work but aren't linked

**Stale context:**
- Decisions that were made but never acted on
- Cards marked active but untouched for weeks
- Ownership assignments where the owner hasn't engaged
- Deadlines that passed silently
- Specs updated but corresponding cards reference old versions

**Alignment gaps:**
- Two people saying contradictory things in different channels
- Stated priorities that don't match where time is actually going
- Implicit decisions nobody explicitly made
- Different team members operating on different versions of the plan

**Structural gaps:**
- Cards with no owner
- Cards with no status
- Work happening in chat/commits with no card
- Duplicate cards that should merge

**Knowledge gaps:**
- A team member working on something they haven't been briefed on
- Meeting notes only some members saw, with no evidence it was shared

**For teams with no PM tool (Concourse archetype):**
- BrainShare generates the team's FIRST EVER structured map of priorities, decisions, ownership, and active work — extracted entirely from Slack, Google Drive, and other connected tools
- This IS the genesis of the WorkOS instance

## 5.5 Cross-Tool Conversation Hop

During or after onboarding, BrainShare offers: "Want to continue this conversation in Slack?" First demonstration of the core promise.

## 5.6 Transition to Operating

Onboarding ends with: "Here's what I now know about your team. I'll keep this updated as things change across all your tools. If something contradicts what we just established, I'll speak up."

**Archaeology phase complete. Journalism phase begins.**

---

# 5.7 Fractal Attention Scoping

Before BrainShare extracts any primitives, it performs a **scoping pass** — a fast, broad scan of all connected sources to build a category map of the user's life and work domains.

### How It Works

BrainShare scans all connected tools and proposes a MECE categorization of the user's world, streamed in "thinking out loud" style:

"I can see you're 32 years old, living in New York, and just left Vega Factor after 9.5 years to pursue independent work in AI.

You're exploring full-time job options — with a target on Anthropic — while building your own things.

The main project is WorkOS, but you're also working on Burn — a social fitness game — and TribeWild, your hip hop collective.

You're also thinking about writing a newsletter or other ideas to boost your career profile. Career development is a big theme.

On the margins, you're also thinking about your long-term financial strategy, your romantic partnership with Lulu, your personal fitness, and plenty of flotsam and jetsam within your personal life.

What's the most important stuff for me to keep track of? I think it's:

✅ WorkOS
✅ Burn
✅ TribeWild
✅ Career Development
🟡 Finances
🟡 Fitness
🟡 Personal life
❌ Random flotsam and jetsam

Let me know if that makes sense, or what you'd change."

### Three-Tier Attention

Each scope gets one of three levels:

| Tier | Icon | Behavior |
|------|------|----------|
| **Full extraction** | ✅ | Extract all primitives (decisions, assumptions, actions, etc.) from conversations in this scope. Full graph integration. |
| **Lightweight tracking** | 🟡 | Note that this topic exists and track it broadly, but don't extract detailed primitives. Surface to the user if it becomes relevant or increases in volume. |
| **Ignore** | ❌ | Skip entirely. Don't extract, don't track, don't surface. |

Users can respond in chat ("move fitness to green") OR toggle options directly. Both work.

### Fractal Sub-Categorization

The attention scope tree is fractal — self-similar at every level of zoom, just like BrainShare's recursive node model and the human brain's own knowledge organization:

```
Will's Life ✅
├── WorkOS ✅
│   ├── Architecture decisions ✅
│   ├── UI/UX decisions ✅
│   ├── Competitive research ✅
│   ├── GTM strategy ✅
│   └── BrainShare pipeline design ✅
├── Burn ✅
│   ├── Product decisions ✅
│   ├── Design (Marek's work) ✅
│   ├── Engineering (Ziga's work) ✅
│   └── Launch strategy ✅
├── TribeWild ✅
├── Career Development ✅
│   ├── Anthropic pursuit ✅
│   ├── Consulting / Saglo ✅
│   └── Newsletter / profile building 🟡
├── Finances 🟡
├── Fitness 🟡
├── Personal life 🟡
│   ├── Relationship 🟡
│   └── Day to day ❌
└── Random flotsam ❌
```

BrainShare starts with top-level scopes during onboarding. Sub-categorization grows organically as BrainShare detects clusters within a scope: "You're making a lot of architecture decisions specifically about the BrainShare pipeline. Want me to track that as its own sub-scope?"

### The Attention Scope Tree IS the Why Chain Skeleton

This tree is not separate from the knowledge graph — it IS the first draft of the Why Chain. The top-level scopes are life/work goals. The sub-scopes are sub-goals. The primitives extracted within each scope hang off these nodes. So when BrainShare does the scoping pass during onboarding, it's simultaneously:

1. **Setting attention scopes** for what to extract
2. **Building the skeleton of the Why Chain** (goals → sub-goals → work)
3. **Laying the groundwork for WorkOS workspaces** — this tree maps directly to workspaces and stacks when the user graduates

### Proactive Scope Suggestions

Over time, BrainShare notices new patterns in topics outside existing scopes and proposes them: "You've been discussing meal planning a lot lately. Want me to start tracking that?" This lets the tree grow organically without the user having to anticipate every domain in advance.

### Scoping Pass as a Pre-Step

The scoping pass happens BEFORE any primitive extraction. It's a fast broad scan to build the category map, then that map governs which conversations get full extraction, which get lightweight tracking, and which get ignored. This prevents the "cat poop problem" — BrainShare doesn't waste extraction cycles on irrelevant content.

---

# 6. Memory Architecture

BrainShare's memory is organized in four layers. Each layer has a different source, update frequency, and role in context assembly.

## 6.1 The Four Memory Layers

| Layer | Source | Update Frequency | Example |
|-------|--------|-----------------|---------|
| **Inborn** | Hand-curated by the BrainShare team | Rarely — updated as thinking evolves | "Decisions not reinforced within 2 weeks tend to decay." "PWAs have significant limitations for hardware API access." |
| **Seeded** | LLM-generated from domain detection during onboarding | Once during onboarding, refined in first week | "iOS fitness apps need HealthKit entitlements." "Games with social features need network effects before stranger matching works." |
| **Foundation** | Observed from team tools during onboarding, confirmed by user | Slowly (monthly) | "4 co-founders across 3 timezones. Sprint planning Wednesdays. Chris and Will co-decide, Will leans product." |
| **Working** | Observed from ongoing team activity across all connected tools | Constantly (daily/hourly) | "Onboarding + SSO + gamer tags bundled this sprint. Marek's designs ready. Ziga actively building." |

### Inborn Layer

The DNA of BrainShare. Universal operational knowledge that applies to all teams:

- **Performance science and Total Motivation** — how teams actually perform under different conditions
- **Methodology patterns** — Agile, Lean, Scrum, EOS, OKRs — not as prescriptions, but as pattern libraries
- **Collaboration science** — social psychology of small teams, decision-making under ambiguity
- **Common failure modes** — decision decay, priority drift, ownership ambiguity, scope creep, founder cognitive overload, communication bottlenecks
- **AI-native patterns** — agentic workflows, human-AI handoff best practices, context management for LLMs
- **Technical knowledge** — common architectural tradeoffs (PWA vs native, monolith vs microservices, etc.)

This layer is hand-curated and maintained as a library of structured knowledge documents. It's the same for every BrainShare instance. It's small, high-quality, high-conviction. This is proprietary IP.

### Seeded Layer

Industry-specific knowledge generated during onboarding. When BrainShare detects from connected tools that a team is building "a gamified social fitness app for iOS," it runs a structured generation protocol against a foundation model:

- Common technical pitfalls for this category
- Typical team structures and workflows
- Key platform constraints (App Store, HealthKit, social features)
- Common go-to-market patterns
- Failure modes specific to this domain
- Industry benchmarks

The output is structured knowledge objects, not a wall of text. Generated once, stored, and refined as BrainShare learns more about the specific team.

### Foundation Layer

Stable context about this specific team, established during onboarding and updated occasionally:

- **People & Authority** — who's on the team, roles, domains of ownership, decision-making authority and its nuances
- **Mission & State** — what the project is, its goal, current momentum, maturity stage, target milestones
- **Operating Model** — locations, timezones, rhythms, meeting cadence, tooling, what's consistent vs. inconsistent
- **Workflows & Processes** — the design-to-development pipeline, sprint planning flow, review processes — both explicit and implicit

### Working Layer

Dynamic context that changes constantly as work happens:

- **Active Challenges** — what problems the team is currently solving
- **Decisions & Rationale** — what was decided, why, by whom, what it superseded
- **Assumptions** — beliefs the team is operating on, with status tracking
- **Product & User Context** — who the end user is, why specific features matter for specific milestones
- **Current State** — what's in progress, what's blocked, what's done, who's working on what

## 6.2 Conviction Across Layers

The conviction meter applies differently to each layer:

| Layer | Starting Conviction | Why |
|-------|-------------------|-----|
| Inborn | High | Hand-curated, battle-tested knowledge |
| Seeded | Medium | Reasonable LLM inference based on domain, but not confirmed |
| Foundation | Medium-high | Based on real data from tools, but could be misinterpreted — gets confirmed during onboarding |
| Working | Varies by source | A formal meeting decision is higher conviction than an offhand Slack remark |

---

# 7. Graph Structures

BrainShare's context graph consists of four interrelated structures that serve different reasoning purposes.

## 7.1 The Why Chain (Goals → Sub-goals → Work)

Vertical structure connecting strategic goals to the tactical work that serves them. Every card traces up to a reason for existing.

```
[Goal: Public launch summer 2026]
  +-- requires --> [Goal: Legit first impression]
      +-- requires --> [Goal: Real onboarding experience]
      |   +-- spawned --> [Decision: Bundle onboarding+SSO+tags]
      +-- requires --> [Goal: Handle many accounts at scale]
      |   +-- addressed_by --> [Card: Implement SSO]
      +-- requires --> [Goal: Safe stranger matching]
      |   +-- addressed_by --> [Card: Implement gamer tags]
      +-- requires --> [Goal: Credibility and ease]
          +-- addressed_by --> [Card: Implement SSO]
```

The Why Chain answers: "Why does this card exist?" by tracing up to the strategic context.

## 7.2 The Decision Graph (Decisions → Assumptions → Work → Triggers)

Lateral structure connecting a decision to everything that hangs off it.

```
[Decision: Bundle onboarding+SSO+tags]
  +-- proposed_by --> [Actor: Ziga]
  +-- approved_by --> [Actor: Will]
  +-- source --> [Meeting: Sprint planning, Apr 22]
  +-- supersedes --> [Prior Decision: Sequential build order]
  +-- depends_on --> [Assumption: Bundling is efficient]
  +-- depends_on --> [Assumption: SSO and tags are simple]
  +-- depends_on --> [Prerequisite: Marek's designs ready (validated)]
  +-- spawned --> [Card: Build onboarding flow]
  +-- spawned --> [Card: Implement SSO]
  +-- spawned --> [Card: Implement gamer tags]
  +-- revisit_when --> [Trigger: Evidence bundling isn't efficient]
```

The Decision Graph answers: "What was decided, what depends on it, and when should it be revisited?"

## 7.3 The State Layer (Current Reality)

The real-time picture of what's happening: what's in progress, what's blocked, what's done, who's working on what, what changed today. This is the most frequently updated structure — every card move, every commit, every Figma update, every message feeds into it.

## 7.4 Signal Patterns (Emergent Observations Over Time)

Accumulated observations that aren't decisions or assumptions, but are evidence of something happening:

- Bug reports trending up over the past month
- Workarounds for HealthKit access increasing
- Sprint plans consistently 30% too ambitious
- Certain team members going quiet for periods
- Discussions left unresolved and festering
- Time spent on patches vs. features shifting

Signal Patterns are raw material. BrainShare detects them; Swarm (if active) uses them to decide whether to intervene. If Swarm is not active, BrainShare surfaces them with appropriate conviction-based framing.

---

# 8. Philosophical Foundations

These frameworks are not decoration. They drive specific architectural decisions.

## 8.1 Pearl's Ladder of Causation

Judea Pearl's three levels of causal reasoning map directly to BrainShare's graph structures:

| Pearl Level | What It Does | BrainShare Structure | Example |
|------------|-------------|---------------------|---------|
| **Level 1: Association** ("What is?") | Detects patterns and correlations | State Layer + Signal Patterns | "Bug reports have tripled. 60% relate to HealthKit." |
| **Level 2: Intervention** ("What if I do X?") | Reasons about consequences of actions | Decision Graph | "We decided to bundle 3 features. We expected efficiency gains. Assumptions: bundling is efficient, SSO is lightweight." |
| **Level 3: Counterfactual** ("What if I had done differently?") | Traces backward through causal chains, enables "what if" | Why Chain | "This card exists because we're launching publicly. If we weren't launching, we wouldn't be building this." |

Most AI memory systems operate at Level 1 only — pattern matching and retrieval. BrainShare's structured graph enables Level 2 (tracking interventions and their predicted vs. actual outcomes) and Level 3 (tracing causal chains and reasoning about alternatives).

## 8.2 Deutsch's Good Explanations

David Deutsch's key insight: a good explanation is "hard to vary" — you can't swap out parts of it without breaking the whole thing. Bad explanations are easy to vary because they're vague enough to explain anything.

This maps to the conviction meter:

**High-conviction context has hard-to-vary rationale.** "We're bundling onboarding + SSO + gamer tags because they're all new-user setup, the designs are ready for all three, and SSO/tags are lightweight additions." Remove any piece and the rationale weakens. Specific, testable, interconnected.

**Low-conviction context has easy-to-vary rationale.** "We should probably do onboarding soon because it's important." Important why? You could replace "important" with any adjective and the statement still sounds plausible. Vague, untestable, substitutable.

BrainShare uses the hard-to-vary test as an operating principle:
- Decisions with hard-to-vary rationale get stored with high conviction and reinforced
- Decisions with easy-to-vary rationale get stored with low conviction and flagged: "This decision doesn't have a strong rationale yet. Want to strengthen it?"
- Each link in a Why Chain should be hard to vary — if you can swap a link and the chain still holds, the chain is weak

---

# 9. Ongoing Operation: BrainShare as Context Guardian

After onboarding, BrainShare operates continuously.

## 9.1 Real-Time Context Sync

As things happen across tools, BrainShare keeps everything in sync:

- Marek updates a Figma design → BrainShare links it to the right card and notifies relevant people
- A decision is made in Discord → BrainShare captures it as a structured Decision object in the graph
- Ziga pushes a build → BrainShare logs it against the relevant cards
- A Claude Code session makes an architectural decision → BrainShare captures it
- A spec changes → BrainShare updates all related cards and notifies people working on affected items

## 9.2 Proactive Intervention (Context, Not Strategy)

BrainShare speaks up when someone is about to act on outdated or incomplete information:

- "Are you sure you want to do X? The spec says Y, because [reasons]."
- "A few weeks ago you decided not to do that, because [reasons]. Has the reasoning changed?"
- "Marek updated the designs for this feature yesterday — the version you're referencing is outdated."
- "This decision was made in a Slack thread but never captured durably. Want me to create a card?"

BrainShare does NOT speak up about priorities, alignment, or strategic direction — that's Swarm.

## 9.3 The Conviction Meter

BrainShare maintains an internal conviction score for every piece of context, based on:

- **Explicitness:** Was this explicitly stated or implicitly inferred?
- **Recency:** How recently was this reinforced?
- **Participant weight:** Was this said by the founder or by a contractor?
- **Contradiction count:** Has this been challenged or contradicted?
- **Reinforcement count:** How many times has this been referenced or acted upon?
- **Hard-to-vary test:** How specific and interconnected is the rationale? (Deutsch principle)

The conviction score determines assertiveness:

**High conviction → Assert.** "The spec says Y." No hedging.

**Medium conviction → Flag.** "You discussed changing this in Discord — which version is current?"

**Low conviction → Ask.** "I think this might be related to the onboarding feature — is that right?"

## 9.4 Writing to External Tools

BrainShare doesn't just read — it writes:

- Creates Notion pages when decisions are made in Slack
- Creates ClickUp tasks when work is discussed but not tracked
- Updates card statuses when activity is detected elsewhere
- Links Figma frames to PM tool cards
- Posts summaries in Slack/Discord when significant context changes

## 9.5 Context Monitoring

Beyond real-time sync, BrainShare continuously watches for:

- **Alignment drift:** Two people saying contradictory things in different channels
- **Priority vs. attention mismatch:** Stated priorities don't match where time is going
- **Implicit decisions:** Something everyone acts on but nobody explicitly decided
- **Knowledge gaps:** Someone working on something they haven't been briefed on
- **Stale decisions:** Decisions aging without reinforcement
- **Context fragmentation:** Decisions in tools BrainShare watches but not captured durably

BrainShare detects these but **surfaces them to Swarm for intervention** if Swarm is active. If Swarm is not active, BrainShare surfaces them directly with conviction-based framing.

---

# 10. Context Assembly for LLMs

When an LLM needs context — whether it's Claude answering a question in the AI panel, Claude Code writing code, or ChatGPT helping with a document — BrainShare assembles a context payload from all four memory layers.

Example: User asks "What's the current state of the onboarding feature?"

BrainShare assembles:

- **Inborn:** "Teams that bundle too many features in a sprint tend to underdeliver" (relevant pattern, included if applicable)
- **Seeded:** "iOS onboarding flows need to handle App Store review guidelines for account creation" (domain knowledge)
- **Foundation:** "Burn is a social fitness game targeting summer 2026 public launch. Ziga is the sole engineer. Marek owns design." (stable context)
- **Working:** "Decision last Wednesday to bundle onboarding + SSO + gamer tags. Ziga proposed bundling because all three are new-user setup and SSO/tags are lightweight. Marek's designs ready. Two assumptions untested. This exists because the current onboarding is too rough for public launch — the team needs a legit first impression, safe stranger matching (gamer tags), and credential management at scale (SSO)." (current state + decision graph + why chain)

This payload is structured, layered, appropriately weighted, and dramatically more useful than "here are 10 text chunks that mention onboarding."

---

# 11. Two Archetypes

## 11.1 The Burn Archetype (Has Tools, Needs Sync)

Team has a PM tool, a design tool, a chat tool, and AI tools. Work is scattered across them. Context doesn't flow between tools. Decisions get lost.

**BrainShare's job:** Heal and maintain existing structure. Link Figma to Factor. Capture Discord decisions in cards. Feed specs into Claude sessions. Flag when things are out of sync.

**First magic moment:** "I found 14 cards with no Figma designs and 30 Figma frames with no cards. Want to link them?"

## 11.2 The Concourse Archetype (No Tools, Needs Structure)

Team has Slack and Google Drive. No PM tool. Decisions live in people's heads and chat threads. There's a Friday whiteboard meeting.

**BrainShare's job:** Create structure from chaos. Generate the team's first ever map of priorities, decisions, ownership, active work — extracted entirely from Slack and Drive.

**First magic moment:** "Here's a map of everything your team is working on, who owns what, and three decisions that were made but never written down. You've never seen this before."

**This map is the genesis of their WorkOS instance.** One click to see it as a board.

---

# 12. BrainShare as Infrastructure

Whether or not someone uses BrainShare as a product, its architecture powers the context layer inside WorkOS and Swarm.

- When Swarm reads team context, it's reading from BrainShare's memory
- When WorkOS auto-generates a workspace, it's using BrainShare's understanding of the team
- When the AI panel in WorkOS answers a question, BrainShare assembled the context

BrainShare is both a product AND the shared infrastructure underneath the entire ecosystem.

### Memory Browser View

In addition to the Board and Feed views already in WorkOS, add a **"Memory" or "Context" view** — a structured table/list of BrainShare primitives with filters by:
- Primitive type (decision, assumption, action, question, signal)
- Project / scope (from the attention scope tree)
- Conviction level (high / medium / low)
- Status (active / superseded / untested / invalidated)
- Date range
- Actor (who made the decision, who proposed it)
- Source tool (Discord, Claude, Notion, etc.)

This is not a separate app — it's a view within WorkOS, alongside Board and Feed. It lets power users interrogate BrainShare's graph directly: "show me all untested assumptions across all projects" or "show me all decisions made in the last month with low conviction."

---

# 13. Where BrainShare Ends and Swarm Begins

| Dimension | BrainShare | Swarm |
|-----------|-----------|-------|
| Metaphor | Nervous system | Brain |
| Core job | Context continuity | Operational intelligence |
| Temporal scope | In the moment | Across time |
| Triggered by | Live actions conflicting with stored context | Patterns, rhythms, structural misalignment |
| Voice | "The spec says Y" / "This decision wasn't captured" | "Here's your focus this week" / "Your team is drifting" |
| Intervenes about | Facts, specs, decisions, context gaps | Priorities, alignment, planning, strategy |
| Writes to | External tools (Notion, ClickUp, Slack, Figma) | WorkOS (execution plans, weekly focus, diagnostics) |
| Analogy | CNN — live coverage of what's happening | Analyst — tells you what it means |
| Pearl level | Level 1 (patterns) + Level 2 (tracking interventions) | Level 3 (counterfactual reasoning, strategic implications) |

**BrainShare points at things. Swarm runs conversations about them.**

---

# 14. Stress Test: The PWA→iOS Decision

A real example from Burn that validates the architecture.

**The situation:** The team originally built Burn as a PWA (Dave's technical capability + flexibility argument). Over months, the app became buggy and slow. HealthKit access was clunky. The team discussed switching to iOS, but Dave (the technical co-founder) was resistant because he couldn't build iOS. Chris and Will secretly contracted Ziga for a 2-week iOS proof of concept. Ziga overtook Dave's progress in 2 weeks. Chris and Will decided to switch to iOS. Dave quit.

**Where BrainShare could have helped:**

1. **Inborn knowledge layer:** BrainShare ships with knowledge that PWAs have significant limitations for hardware API access (HealthKit, GPS, push notifications). It could have flagged this during the original decision: "You're building a fitness app that needs HealthKit data as a PWA. Teams who've done this frequently hit limitations. Worth considering native early."

2. **Signal Patterns:** BrainShare would have detected bug reports increasing over months, performance complaints accumulating in Discord, workaround discussions about HealthKit multiplying. It would have surfaced the pattern: "Bug reports have tripled in 2 months. 60% relate to performance or HealthKit. This is getting worse, not better."

3. **Decision Graph:** BrainShare would have seen the iOS discussion in Discord and then... no resolution. No decision captured. Meanwhile Dave keeps building PWA. BrainShare flags: "You discussed switching to iOS 3 weeks ago but no decision was captured. Work continues on PWA. Is this resolved?"

**What this validates:** The four-layer memory (inborn knowledge would have warned early), the four graph structures (signal patterns + decision graph would have surfaced the problem), and the conviction meter (the iOS discussion was low-conviction because it was unresolved — BrainShare would have flagged it as needing confirmation).

---

# 15. Technical Architecture (Informed by Landscape Research)

See `context-memory-research-brief.md` for the full landscape analysis. Key architectural decisions informed by that research:

## 15.1 Build on Graphiti for the Graph Engine

Zep's Graphiti is open source (Apache 2.0), has 20,000+ GitHub stars, and handles temporal context natively. It solves the hard infrastructure problems: graph construction from unstructured data, temporal validity windows ("this fact was true from March to April"), entity resolution, and hybrid vector + graph retrieval. It has proven production scale (millions of hourly requests).

BrainShare should use Graphiti as its temporal graph foundation rather than building graph infrastructure from scratch. This lets the team focus on the typed primitive layer and product experience — where the actual differentiation lives.

## 15.2 Typed Primitives Layer (BrainShare's Core Differentiation)

Graphiti stores generic entities and relationships. BrainShare adds a typed schema layer on top:

**Primitive types:**
- **Decision** — statement, rationale, actors (proposer + approver), timestamp, status (active/superseded/reversed), supersedes reference, revisit triggers, conviction score
- **Assumption** — statement, evidence status (untested/validated/invalidated), linked decisions, conviction score
- **Goal** — statement, time horizon, parent goal reference (for Why Chain), linked sub-goals, linked work items
- **Actor** — name, type (human/agent), roles, authority domains, activity patterns
- **Work Item** — title, owner (Actor), status, linked decisions, linked assumptions, linked goals (Why Chain)
- **Standard** — statement, scope, enforcement level, origin, linked decisions
- **Signal** — observation type, evidence, timestamp, trend direction, linked entities
- **Episode** — raw source data (Discord message, Figma update, commit, etc.) that produced one or more primitives. Every primitive traces back to its source episodes.

**Relationships between primitives:**
- Decision → depends_on → Assumption
- Decision → supersedes → Decision
- Decision → spawned → Work Item
- Decision → proposed_by / approved_by → Actor
- Decision → source → Episode
- Goal → requires → Goal (Why Chain hierarchy)
- Goal → addressed_by → Work Item
- Work Item → owned_by → Actor
- Work Item → blocked_by → Work Item
- Standard → originated_from → Decision
- Signal → observed_in → Episode
- Signal → relates_to → any primitive

Every relationship has a temporal dimension (valid_from, valid_to) inherited from Graphiti's temporal model.

## 15.3 Adaptive Retrieval

BrainShare routes queries to the appropriate retrieval strategy:

- **Simple factual queries** → vector search (fast, cheap). "Who owns the onboarding card?"
- **Relational queries** → graph traversal. "What decisions depend on the Firebase assumption?"
- **Causal queries** → Why Chain + Decision Graph traversal. "Why are we building gamer tags?"
- **Global/summary queries** → community summaries (GraphRAG pattern). "What's the overall state of the project?"
- **Temporal queries** → Graphiti's temporal traversal. "What changed about the onboarding plan last week?"

A query classifier (LLM-based or heuristic) determines which retrieval strategy to use for each query. Most queries hit multiple strategies — the context assembly protocol merges results.

## 15.4 Ontology Grounding for Inborn Knowledge

Cognee's research shows that ontology-grounded extraction produces significantly better results than ungrounded extraction. BrainShare's inborn knowledge layer should be formalized as a lightweight ontology:

- **Classes:** Decision, Assumption, Goal, Standard, Actor, WorkItem, Signal
- **Relationships:** depends_on, supersedes, spawned, requires, addressed_by, owned_by, etc.
- **Operational patterns:** decision_decay, priority_drift, ownership_ambiguity, scope_creep, etc.

When BrainShare extracts primitives from raw tool data, it validates them against this ontology. Entities that match get canonical names and typed relationships. Entities that don't match get flagged as unvalidated (lower conviction).

This also makes extraction consistent across teams — "decision" always means the same thing in BrainShare, regardless of how different teams express decisions in their tools.

## 15.5 Pre-Structured Causal Context

Research shows that LLMs score poorly on causal discovery (~29% accuracy) but perform well when given pre-structured causal context to reason over. BrainShare's approach:

- **BrainShare structures the causal context** (decisions with assumptions, why chains connecting goals to work)
- **The LLM reasons over that structure** (generating explanations, detecting contradictions, answering questions)

BrainShare is NOT asking the LLM to discover causal relationships from raw text. It's structuring context so that the LLM can reason causally over it. This is a much more tractable problem.

## 15.6 Build vs. Build-On Summary

| Component | Approach | Rationale |
|-----------|----------|-----------|
| Temporal graph engine | Build on Graphiti (open source) | Proven at scale, handles hard infra problems |
| Vector search | Supabase pgvector or Graphiti's built-in | Commodity capability |
| Typed primitives | Build custom on Graphiti | Core differentiation |
| Ontology for inborn knowledge | Evaluate Cognee's approach, likely build custom lightweight version | Quality improvement for extraction |
| Conviction meter | Build custom | Novel — no existing solution |
| Adaptive retrieval router | Build custom | Needs to understand typed primitives |
| Tool integrations | Build custom + MCP | Product-specific write-back capability; MCP primary for Claude ecosystem |
| Context assembly protocol | Build custom | Core IP |
| Inborn knowledge library | Curate manually | Proprietary IP |
| Product UX | Build custom (WorkOS) | The product IS the differentiation |

## 15.7 Integration Architecture: MCP as Primary Path

BrainShare should expose an **MCP server** as the primary integration surface for Claude ecosystem tools (Claude, Claude Code, Claude Desktop). This lets AI tools connect to BrainShare's context graph via MCP tool calls — no custom integration code needed on the Claude side.

- **MCP for Claude ecosystem:** Claude Code and Claude Desktop connect to BrainShare's MCP server and automatically have access to team context through tool calls (query context, get decisions, check assumptions, etc.)
- **API for ChatGPT and other LLMs:** REST/GraphQL API for tools that don't support MCP. Also used for BrainShare's own web UI and for third-party integrations.
- **CLI for power users:** `brainshare query "what did we decide about auth?"` — secondary interface for scripting and terminal-native workflows.
- **Data export for bulk analysis:** JSON/CSV export of the graph for external analysis tools.

MCP is prioritized because the Claude ecosystem is BrainShare's natural home — Will builds with Claude Code, uses Claude for product thinking, and the WorkOS AI panel will run on Claude. Getting MCP right means BrainShare's context flows into every Claude session automatically.

---

# 17. What's Not Designed Yet

## Ingestion Pipeline — DESIGNED (see separate doc)
See `brainshare-extraction-pipeline.md` for the full pipeline spec. Claude/ChatGPT conversations are the first pipeline, Discord second.

## Relevance Filtering — DESIGNED (see Section 5.7)
Fractal attention scoping with three-tier system (✅ full / 🟡 lightweight / ❌ ignore). Scoping pass runs before any extraction.

## Context Assembly Algorithm
The step-by-step protocol for assembling a context payload from all four memory layers using adaptive retrieval. How to prioritize, compress, and fit within token budgets.

## Conviction Calculation
The specific mechanics of scoring. How the hard-to-vary test gets operationalized. What thresholds trigger assert vs. flag vs. ask. How conviction decays over time.

## Graphiti Integration Details
How BrainShare's typed primitives map to Graphiti's entity/relationship model. Custom entity types, edge types, and temporal properties. Episode ingestion patterns.

## Ontology Definition
The formal or semi-formal definition of BrainShare's type system as an ontology. Classes, properties, relationships, and validation rules.

## Inborn Knowledge Curation Protocol
What format the curated knowledge takes. How it gets loaded into Graphiti. How it interacts with the ontology during extraction.

## Seeded Knowledge Generation Protocol
Structured prompt pipeline for domain-specific knowledge during onboarding. Quality assurance against hallucination.

## External Tool Write Patterns
Mechanics of creating/updating in Notion, ClickUp, Slack, Figma. Writeback targets cards OR stacks — sometimes a stack is the right scope for linking context. Conflict handling.

## Cross-Tool Conversation Protocol
Single conversation thread across web app, Slack, Discord. State management and context preservation.

## MCP Server Definition
Specific MCP tools to expose (query_context, get_decisions, check_assumptions, etc.). Authentication flow. How BrainShare MCP integrates with Claude Code and Claude Desktop.

## Pricing
Standalone pricing model.

## Swarm Handoff Protocol
How BrainShare surfaces data to Swarm. Behavior changes when Swarm is active.

---

*v1.3 changelog: Added Fractal Attention Scoping (Section 5.7) — three-tier relevance filtering (✅/🟡/❌), fractal sub-categorization, attention scope tree as Why Chain skeleton, proactive scope suggestions, scoping pass as pre-step before extraction. Added Memory Browser View within WorkOS (Section 12). Added MCP as primary integration path (Section 15.7) with API and CLI as secondary. Updated extraction principle: conviction always traces to human signal, not AI generation — both humans and AI produce content, but humans produce the authority signal. Added writeback to cards OR stacks (not just cards). Updated open questions to reflect resolved items.*
