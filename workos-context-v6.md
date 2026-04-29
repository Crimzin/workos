# WorkOS — Architecture & Competitive Context

Context document for Claude Code. Captures the product architecture, dual-entry GTM model, competitive landscape, and moat gaps as of April 2026\.

## 1\. The system

Three products, one substrate. The integration is the strategic bet.

### 1.1 BrainShare — the substrate

Shared causal memory for teams. Stores:

- **Decisions** with rationale (why this, not the alternative)  
- **Assumptions** with status (active, validated, invalidated, stale)  
- **Intervention–outcome pairs** (what we tried, what happened, what we learned)

Not a vector store with citations. A queryable graph of how the team actually thinks and decides. Every Swarm action and every WorkOS event reads from and writes to BrainShare.

### 1.2 Swarm — the chief-of-staff agent

Adaptive operational intelligence for founder-led teams. Runs as a bot inside the team's existing collaboration stack (Discord today, Slack and others to follow). Synthesizes team activity into action plans, keeps people aligned, escalates when stuck.

Critically: **Swarm does not require WorkOS.** It works on top of whatever stack a team already has. That makes it a wedge for teams already on Notion/Linear/Slack/Discord — no migration required.

### 1.3 WorkOS — the management surface

The AI-native work management UX. Replaces Factor.ai. Where humans and agents meet in a single unified flow rather than parallel tracks. For greenfield teams or low-friction switchers, this is where they start. For Swarm-only customers, this is where they upgrade to.

### 1.4 The integration thesis

The core hypothesis: great human–AI collaboration requires all three layers working together. Individually, each layer is contested. The integration — and specifically the causal substrate underneath — is what nobody else is shipping.

┌─────────────────────────────────────────────────────────┐

│  WorkOS — execution surface                             │

│  Boards, docs, OKRs, unified human \+ agent flow         │

└────────────────────┬────────────────────────────────────┘

                     │ ↕ reads/writes

┌────────────────────┴────────────────────────────────────┐

│  Swarm — agentic intelligence                           │

│  Synthesis, action plans, alignment, escalation         │

│  Runs in WorkOS OR in existing stacks (Discord, Slack)  │

└────────────────────┬────────────────────────────────────┘

                     │ ↕ reads/writes

┌────────────────────┴────────────────────────────────────┐

│  BrainShare — causal memory \+ context                   │

│  Decisions \+ rationale, assumptions w/ status,          │

│  intervention–outcome pairs                             │

└─────────────────────────────────────────────────────────┘

## 2\. GTM — dual entry

Two doors into the same backend. The substrate is the same regardless of entry point.

### 2.1 Entry A — Swarm wedge

Target: teams already on an existing stack (Notion \+ Slack/Discord, Linear, etc.) who don't want to migrate.

Pitch: "Add a chief of staff to your existing team without changing anything." Swarm joins their stack, starts populating BrainShare, gets progressively smarter as the context graph grows.

Conversion path: when the team feels the pull of having a unified surface that uses the same context Swarm already understands, WorkOS becomes the obvious next step. The switch is an unfold, not a migration — the context graph is already populated.

### 2.2 Entry B — WorkOS destination

Target: greenfield AI-native teams (canonical example: Concourse — operating AI-native, scaling 5→40 by EOY) or teams unhappy with their current stack and looking to switch with low friction.

Pitch: "Start in WorkOS and you get Swarm \+ BrainShare native, with no integration tax and an AI-native work management UX built around how teams actually work in 2026."

### 2.3 Why this matters competitively

Every CWM Leader (monday, Asana, Notion, Atlassian) is single-entry. They require migration to start their loop. Swarm-as-wedge means we accumulate causal context for a team whether or not they ever switch — and that's the flywheel competitors structurally cannot replicate.

## 3\. Philosophical foundations

These aren't decoration. They drive specific design decisions throughout the stack.

### 3.1 Causal reasoning (Pearl, *The Book of Why*)

Swarm should generate competing causal explanations for what's happening on a team, not just detect anomalies. BrainShare should capture *why* decisions were made and *why* outcomes followed, not just what happened. Lightweight causal graphs are IP — they're what makes Swarm's recommendations explainable and BrainShare's memory useful for reasoning rather than just retrieval.

### 3.2 Good explanations (Deutsch, *The Beginning of Infinity*)

Explanations are hard to vary and have irreducible structure. The hypothesis: there is a stable meta-structure to team context at the level of explanations that persists across tools, domains, and team configurations. Swarm's job is to extract and maintain that explanatory structure from chaotic team activity.

### 3.3 Operating principles

- **Unified flow over parallel systems.** Agents and people belong in one stream, not two tracks. Every additional tool creates friction and needs explicit justification.  
- **Tool-agnostic by design.** Swarm should be invisible when working well. Plug into the team's existing stack rather than replacing it.  
- **Causal over correlational.** Memory captures the why, not just the what.  
- **Inborn knowledge.** WorkOS ships with embedded business/collaboration patterns and seed causal knowledge per industry, market, and profession. Greenfield teams shouldn't start with a blank slate.  
- **Frictionless migration.** The system should hoover up existing work, build the context/causal layer automatically, auto-configure workspaces.  
- **Compression** (concept under development) — relates to the memory/context/causal layer; details to formalize.

## 4\. Competitive landscape

### 4.1 The three quadrants

Three adjacent categories. We touch all three, but the integration is where defensibility lives.

**Collaborative Work Management (CWM)** — Gartner MQ, October 2025\. Five Leaders: monday.com (furthest on both axes), Atlassian, Asana, Smartsheet, Wrike. Visionaries: Airtable, ClickUp, Adobe (Workfront). Niche: Quickbase. AI is the only remaining axis of competition; the kanban/gantt/OKR layer has commoditized.

**AI Teammates / Agentic Work** — uncategorized, no MQ yet. Splits into:

- Embedded (workspace-native): Notion 3.0 Agents, Asana AI Teammates, monday AI, Atlassian Rovo, Microsoft Copilot Studio  
- Headless (tool-agnostic): Dust, CrewAI, Relevance AI, TeamAI, Orq.ai, Interloom

**Team Memory & Context Layer** — emerging category, mostly developer infrastructure today.

- Team-facing graph/causal: Interloom (the only direct adjacent to BrainShare; raised $16.5M March 2026\)  
- Team-facing vector/RAG: Notion AI Enterprise Search, Glean, Asana Work Graph  
- Infrastructure graph/causal: Zep/Graphiti, Cognee, Microsoft GraphRAG  
- Infrastructure graph/memory: Hyperspell (YC F25, $500K seed Sep 2025 — "memory & context layer for AI agents," API-based, builds per-user memory graphs from connected tools; developer infrastructure, not end-user product)  
- Infrastructure vector: Mem0, Pinecone, Weaviate, Supermemory

Note: Gartner published a Decision Intelligence Platforms MQ in January 2026\. Vendors like Aera Technology validate enterprise demand for the causal/decision layer but are not aimed at founder-led SMBs.

### 4.2 Integration scorecard

How contenders score across the three layers and on coherent integration. "Integration" \= how well the layers form one system, not the sum of feature scores.

| Contender | Execution | Agents | Causal mem | Integration | Posture |
| :---- | :---- | :---- | :---- | :---- | :---- |
| monday.com | Strong | Mid | Absent | Workspace | Top-down enterprise |
| Asana | Strong | Strong | Mid | Coherent | Best of CWM Leaders |
| Notion 3.0 | Strong | Strong | Absent | Pages-deep | PLG / SMB |
| Atlassian \+ Rovo | Strong | Mid | Mid | Heavy | Enterprise |
| Interloom | Absent | Strong | Strong | Partial | Enterprise agent ops |
| Aera / DI vendors | Mid | Strong | Strong | Vertical | Big enterprise |
| Dust / CrewAI | Absent | Strong | Mid | Loose | Tool-agnostic |
| Factor.ai | Strong | Mid | Mid | Closed | Performance science |
| **WorkOS stack** | **TBD** | **Building** | **Building** | **Native** | **Founder-led** |

Definitions:

- Pages-deep \= memory is documents, not a queryable graph  
- Vertical \= bound to specific enterprise verticals  
- Loose \= each agent has its own memory, no team-wide context  
- Closed \= proprietary stack, no MCP/API exit

## 5\. Features to copy

Specific patterns worth stealing from contenders.

### 5.1 From Asana

- **Work Graph framing** — the language of an "operational blueprint" of who is doing what, by when, how, and why  
- **Anti-autonomy positioning** — "autonomy is the wrong goal." Agents need access to team context to be useful. Frame WorkOS the same way.  
- **Admin controls on agent resource consumption** — predictable AI costs even with rapid adoption. Important for founder-led teams watching burn.

### 5.2 From Notion 3.0

- **Instructions page pattern** — a per-agent doc telling the agent how the user likes things written, what to reference, where to file tasks. People expect this now.  
- **MCP-based connector breadth** — Notion ships first-party connectors to Slack, Figma, Linear, HubSpot, Mail, Calendar. This is the integration baseline.  
- **Multi-model toggling** — let users pick Claude, GPT, or other models per task without separate subscriptions.

### 5.3 From monday

- **Decision log schema** — monday's own thought leadership recommends: decision, rationale, expected impact, action items, ownership, review trigger. That's nearly a verbal description of BrainShare's primitives. Use this nomenclature; it's the language buyers already recognize.

### 5.4 From Interloom

- **"Chief of Staff" framing** — for the management surface that shows agent performance with version control on agent-driven processes.  
- **"Context graph" as positioning term** — already in the press, already understood. Reuse it.

### 5.5 From Aera / DI vendors

- **Composite-AI vocabulary** — "reasoning, rules, optimization, machine learning, causal understanding, multimodal context into a unified system." Validates the technical thesis; we're shipping the founder-grade version.

## 6\. Features to avoid

Failure modes to design around.

### 6.1 Notion's pages-as-memory failure mode

A workspace with hundreds of pages, dozens of databases, and a wiki that hasn't been reorganized in two years. AI search takes seconds to answer simple questions. Documents are not a memory substrate at scale. BrainShare must store decisions and rationale as first-class structured objects, not as prose to be retrieved.

### 6.2 monday's substrate problem

monday recognized the decision-log schema is missing — they wrote a thought-leadership piece on it in March 2026\. Their answer is to ship it as a column type in a board. That's a structural mismatch: you can't bolt causal context onto a row-based substrate. Don't repeat the mistake of grafting decisions onto task tables; design BrainShare as a graph from day one.

### 6.3 Per-agent memory (CrewAI / Dust pattern)

These give each agent (or each crew) its own memory. There's no team-shared causal context that humans and agents both contribute to and read from. Avoid this fragmentation. BrainShare is shared substrate, not per-agent state.

### 6.4 Factor.ai's closed stack

No API, no MCP, no CLI. This is a structural failure in 2026\. Anyone shipping in this category must be MCP-first. WorkOS must be operable from Claude Code, from a CLI, from any agent.

### 6.5 Single-entry GTM

monday/Asana/Atlassian require migration to start. Notion is single-entry too (live in our workspace). Don't repeat this. Dual-entry is the GTM moat.

## 7\. Moat gaps

Five places where the integrated stack has room nobody else can easily reach.

### 7.1 Decision-state as substrate, not task-state

Every CWM Leader stores tasks. None stores decisions, rationale, assumptions, and intervention–outcome pairs as first-class objects. monday and Asana will eventually try to bolt this on, but their pricing, sales motion, and core data model resist it. **This is the deepest moat and the hardest to build.** It is also the connective tissue between Swarm-only and WorkOS-native customers — the substrate that makes upgrade path an unfold rather than a migration.

### 7.2 Dual-entry strategy

Reframed from "headless orchestration." The two doors (Swarm wedge, WorkOS destination) into the same backend is the GTM moat. CWM Leaders structurally cannot answer "how do I add agents to my existing stack" because their answer is always "migrate to us."

The dual-entry moat is reinforced by the direct competitor landscape (see section 11). Ambient and Bond — the closest "AI Chief of Staff" competitors — are pure Entry-A plays with no destination workspace. Notion, monday, Asana are pure Entry-B plays with no real chief-of-staff layer. **No one is shipping both doors with a shared causal substrate underneath.**

### 7.3 Inborn knowledge / zero-config bootstrapping

Nobody is shipping a system that already understands what work looks like for, say, a 5-person Series A fitness app team on day one. Most products are blank-slate. WorkOS should ship with embedded patterns per industry/role/stage, hoover up existing work via integrations, and auto-configure. This is also a defensible data flywheel — the more teams, the better the patterns.

### 7.4 Causal evals for agent performance

The evaluation frontier (ARC-AGI-3, March 2026\) shifted toward step-level correctness on longer-horizon tasks where errors compound. Founder-led teams running agents in production need this kind of telemetry but get nothing close from CWM platforms. A causal-context layer is uniquely positioned to provide it because rationale and assumption tracking is the eval substrate.

### 7.5 Single unified flow for humans \+ agents

Almost every product treats agents as a parallel track — separate channel, separate inbox, separate dashboard. The fragmentation is dragging down agentic AI's productivity gains in 2026\. A single flow where agent actions, human decisions, and the rationale for both live in one stream — and where the stream IS the memory — is the obvious next step that nobody has shipped well. **This is specifically a WorkOS feature and the reason a Swarm user upgrades.**

### 7.6 Priority

- **Deepest moat:** \#1 (decision-state substrate)  
- **Fastest GTM wedge:** \#2 (dual-entry)  
- **Unifying narrative for buyers:** \#5 (single unified flow)

## 8\. ICP and beachhead

Founder-led, AI-native SMBs (sub-50 people) where humans and agents share the same flow. Specifically:

- AI-native teams scaling fast (5–40 people in a year, e.g. Concourse-shaped)  
- Already comfortable with agents  
- Too fast-growing for monday-style enterprise rollouts  
- At the size where decision context starts to fray and people lose track of why decisions were made  
- The PLG/prosumer Notion segment is also viable, especially for Swarm wedge

If we land 10 Concourse-shaped companies by mid-2026, we have both a wedge and a reference set.

## 9\. Open questions

To resolve in subsequent design work.

- **BrainShare surface for Swarm-only users:** when Swarm runs in someone else's stack (Notion \+ Slack), where does BrainShare actually live for that customer? Separate UI, embedded as a Notion connector, surfaced through Swarm's bot interface, or invisible infrastructure? The answer affects how defensible the wedge is and how naturally users feel the pull toward WorkOS.  
- **Ontology of irreducible team context primitives** — flagged as high-priority. Sketch before more code.  
- **Compression** — concept to formalize. Relates to the memory/context/causal layer.  
- **WorkOS execution surface scope** — which Factor concepts to keep (Stacks, Boards/Kanban, Workspaces, Strategy Check, Culture Check, Skills, Newsfeed, Analytics, Reminders) and what to add or replace.

## 10\. Non-negotiables for any tooling we build on or adopt

- MCP / CLI / API support — Factor's lack of this is what made it untenable  
- Tool-agnostic posture for Swarm — works in customer's existing stack  
- Graph-shaped memory substrate — not pages, not rows  
- Single unified flow inside WorkOS — not parallel tracks

## 11\. Detailed competitor analysis

Based on competitor scan in April 2026\. Sorted by directness of overlap.

### 11.1 Direct competition: AI Chief of Staff

**Ambient.us** (\~13 people, \~$5M raised, Series A 2025\)

Slogan: "AI Chief of Staff." Pitched at CEOs, founders, and Chiefs of Staff. Secure note taker, decision log, task tracker, daily briefing. Originally launched as "AI newsfeed for everyone in the company"; pivoted after interviewing 100+ Chiefs of Staff and now growing 50% MoM. Investors include Sequoia (Scout), Startup Haven Ventures, Moment Ventures. Goal: return 10–15 hours/week to Chief of Staff role.

What they get right:

- Sharp ICP focus after pivot — proves CoS positioning works  
- Meeting-centric capture is real value (action item extraction, follow-up)  
- "Decision log" is in their pitch, validating the language

What they get wrong (our differentiation):

- Their decision log is descriptive notes, not a causal substrate. They capture *what* was decided, not *why*, *what alternatives*, *what assumptions*, *what outcomes*.  
- Meeting-centric, not activity-centric. They extract from meetings; Swarm should extract from the entire team activity stream (commits, tickets, messages, decisions).  
- They serve teams that *already have* a Chief of Staff role. **The Concourse-shape segment — fast-growing teams without a CoS yet — is uncovered.** Swarm replaces the role for teams that haven't hired one.  
- No destination workspace, no execution layer. Pure Entry-A.

**BOND** (bondapp.io — YC, 2-10 people)

Slogan: "AI Chief of Staff." Tagline: "decision-grade Brief that cuts through the noise." Connects to Slack, Asana, Notion, Jira, Google Calendar. "Real-time pulse on your company. No pointless meetings. No manual updates." Daily "Presidential Briefings." 40-Hour Productivity Analytics. SOC II via Probo. Runs in customer's infra.

What they get right:

- Same dual-entry-A wedge: no migration, plug into existing stack  
- "Decision-grade" language is close to BrainShare territory  
- Productivity analytics quantifies value early  
- Enterprise trust posture (own-infra deployment)

What they get wrong (our differentiation):

- Vector-RAG-based, not graph-based. "Decision-grade" is LLM summary, not causal structure.  
- No destination workspace. Pure Entry-A.  
- Founder previously built a dating app — possible execution risk  
- No causal evals, no rationale tracking, no assumption status

**Differentiation pitch against both:** "Ambient and Bond give you better notes. Swarm gives you better decisions." Or architecturally: they're presentation layers over fragmented data. We're a substrate that produces presentation layers as a side effect.

### 11.2 Pattern-watch: engineering ops as architectural mirror

**Cortex** (cortex.io — Series B, $470M valuation, Sequoia-backed)

Internal Developer Portal that just rebranded to "Engineering Operations Platform." Continuously polls connected tools, builds a software catalog (substrate), runs scorecards (causal layer), provides self-serve workflows (execution layer). 60+ pre-built integrations. AI-driven action targeting auto-notifies owners of exactly what needs to happen, when. Customers include Adobe, Grammarly, Canva, Skyscanner, SoFi, Docker, TripAdvisor.

Why this matters: **Same architecture as the WorkOS stack, but for engineering only.** They've validated the three-layer pattern (catalog/substrate \+ scorecards/causal \+ workflows/execution) is a real $470M business, just for a narrower job.

What to copy:

- The **continuous polling \+ central record** pattern. Phrase to steal: "continuously polls connected tools to maintain central record of state."  
- The **active scorecard** pattern → adapt to "decision scorecards" (active assumptions, decision health, intervention tracking)  
- AI-driven action targeting (Swarm should route specific actions to specific owners with full context)  
- Their growth path: catalog → portal → ops platform. Suggests WorkOS could enter via one functional surface (decision log, daily standup, strategy review) and grow into the full management surface as customers pull on more.

What we do differently:

- They serve engineering only; WorkOS serves the whole company  
- Their substrate is service metadata; ours is decision/intent/outcome  
- Their users are platform teams; ours are founders and small teams

### 11.3 Tooling — possible build-on partners, not rivals

**CrewAI** (450M agentic workflows/month, 60% Fortune 500\)

Multi-agent orchestration platform. CrewAI AMP (cloud) and AMP Factory (on-prem). Visual editor \+ AI copilot for non-developers; APIs for engineers. Ships connectors to Gmail, Teams, Notion, HubSpot, Salesforce, Slack — same connector surface Swarm needs.

Position: tooling, not competition. Swarm should likely build on CrewAI (or LangGraph or similar) as the agent runtime. Their visual-editor \+ AI-copilot pattern targets enterprise IT, a different ICP than founder-led teams. Their "Studio" non-developer-configurable agents is a feature pattern WorkOS should adopt at maturity.

**Braintrust** ($800M valuation Feb 2026, Series B)

AI evaluation and observability platform. Notion uses Braintrust to ship AI features (10x velocity improvement). Loop agent automates eval generation. Brainstore is purpose-built for AI traces. Customers: Notion, Stripe, Vercel, Airtable, Instacart, Zapier, Ramp, Dropbox, Cloudflare, BILL.

Position: tooling. This is exactly what BrainShare needs to ship the causal evals story (moat gap \#4). Don't build it ourselves — build on Braintrust. They serve a different audience (engineering teams shipping AI features), so they're not competition. ARC-AGI-3 framing about step-level correctness has direct application.

**Hyperspell** (YC F25, $500K seed Sep 2025, \~2 people)

"Memory & Context Layer for AI Agents." Connects to Slack, Gmail, Notion, Google Drive, Google Calendar, Asana, Monday, GitHub. Builds a per-user "Agentic Memory Network" — a knowledge graph that structures data from connected tools and makes it available to agents via API. SDK for Python and TypeScript. SOC 2 certified, GDPR compliant. Customers include Scale Agentic, Hobbes, Entelligence. Founded by Conor Brennan-Burke (led $30M ARR API business at Checkr) and Manu Ebert after building their own workplace agent (Echo AI) and discovering the memory layer was the hardest part.

What they get right:

- Clean developer experience — one-line integration, pre-built auth components, self-integrating SDK  
- Continuous ingestion model — memory improves with every query, reinforces what's recalled  
- Connector breadth — ships weekly new integrations to the tools teams actually use  
- SOC 2 \+ GDPR early — enterprise trust posture from day one

What they get wrong (our differentiation):

- **Per-user, not per-team.** Hyperspell builds individual memory graphs. BrainShare builds shared team memory — decisions, assumptions, standards that are shared across the whole team. Hyperspell knows what documents you've read; BrainShare knows what the team decided and whether that decision is holding.  
- **Developer infrastructure, not end-user product.** Hyperspell's customer is the developer building an AI product. BrainShare's customer is the team using the product. Hyperspell is picks-and-shovels; we're the mine.  
- **Memory only, no intelligence.** No Swarm equivalent — no alignment detection, no facilitated sessions, no operational judgment. It's a retrieval system, not an intelligence system.  
- **No execution surface.** No WorkOS equivalent. Context goes in, context comes out — there's no place where work is managed.  
- **No causal structure.** The memory graph is documents and entities, not decisions with rationale, assumptions with status, or intervention-outcome pairs. It's what happened, not why.

Position: adjacent infrastructure. Validates that the market for "memory and context for AI agents" is real (YC funded it, companies are paying for it). Not a direct competitor to BrainShare-as-product because they're selling to developers, not teams. Could theoretically be a component inside BrainShare (their ingestion pipeline), but we'd likely want to own that layer. Monitor for upmarket expansion toward end-user products — their origin in workplace agents (Echo AI) suggests this is possible.

### 11.4 Adjacent — low overlap, monitor for expansion

**Fin (Intercom)** — vertical AI agent expanding outward

Started as customer service AI agent; now expanding to a "Customer Agent" architecture with Roles (support, sales, shopping). Building Goals, Memory, Knowledge, Interoperability — same primitives as a chief-of-staff agent, but pointed at customers, not internal teams. Anthropic uses Fin internally.

**The expansion risk:** Fin's architecture is generalizable. If they push toward an "Internal Agent" with the same Roles/Goals/Memory/Knowledge stack, they become a real competitor. Watch the Customer Agent → Internal Agent expansion path. Not a current threat but worth tracking quarterly.

**Domo** — BI/data platform with agents bolted on

"Governed Data for AI Agents." Data warehouse \+ BI suite that added agent-building. Different buyer (data/analytics teams), different problem (data democratization). Not real overlap, but the broader signal — BI vendors are pushing into agent territory because their data assets are valuable — applies to other adjacencies too.

**Gravitee** — API and agent management infrastructure

Enterprise API gateway \+ Kafka gateway \+ AI Agent Management. Manages agent identity, sprawl, security across enterprise. Way upstream of WorkOS — they secure the agents you deploy. Could matter later for enterprise compliance posture. Not competition.

### 11.5 Competitive positioning summary

The integrated three-layer system has no direct competitor. Specifically:

| Layer | Closest competitor | Their gap |
| :---- | :---- | :---- |
| Causal memory (BrainShare) | Interloom (enterprise), Hyperspell (developer infra), Ambient/Bond (notes-as-decisions) | Per-user not per-team, vector/document not causal graph, developer API not team product |
| Chief of Staff (Swarm) | Ambient, Bond | Meeting-centric, no causal substrate underneath |
| Management surface (WorkOS) | monday, Asana, Notion | No real chief-of-staff layer; substrate is task-state; no auto-generation |

**Strategic implication:** the moat is in the integration. Each individual layer can be approximated (and is being approximated) by point solutions. The substrate-backed integration with dual-entry is the unique combination.

### 11.6 What to copy / avoid (additions)

Adding to sections 5 and 6:

**From Ambient:**

- ICP-pivot story is instructive — sharpen positioning to one buyer persona before broadening  
- "Daily Briefing" is a solid concrete artifact to ship early  
- Avoid: meeting-centric capture as the only input. Activity-centric across the whole stack is the upgrade.

**From Bond:**

- "Decision-grade" as positioning language — borrow but back it with actual causal structure, not LLM summaries  
- Productivity analytics (time-saved quantification) as an early adoption hook  
- Run-in-customer-infra as enterprise trust play (relevant for WorkOS at scale)

**From Cortex:**

- The continuous-polling-to-central-record pattern. Copy this architecturally and as language.  
- Active scorecards as a feature pattern → decision scorecards  
- Functional entry sequence: ship one surface that delivers value, grow into the platform  
- Avoid: their narrow-vertical strategy. Don't get pinned to one functional area; be intentional about whole-company scope from the start.

**From CrewAI:**

- Visual editor \+ AI copilot for non-developer agent configuration (long-term WorkOS feature)  
- Avoid: trying to compete on agent orchestration infrastructure. Use CrewAI/LangGraph; don't rebuild.

**From Braintrust:**

- Eval-driven AI development as a culture (the Notion 10x story is the proof point)  
- Avoid: building eval infrastructure ourselves. Use Braintrust for BrainShare's causal eval story.

**From Fin:**

- Roles \+ Goals \+ Memory \+ Knowledge \+ Interop architecture is a solid template for agent design  
- Watch their expansion path; if they ship "Internal Agent," compete head-on with the substrate angle

**From Hyperspell:**

- Clean developer experience and one-line integration as a standard to meet — BrainShare's API/SDK should be equally easy to adopt  
- Continuous ingestion model where memory improves with every query — borrow this reinforcement pattern  
- SOC 2 \+ GDPR early as enterprise trust posture — do this before scaling  
- Connector breadth (shipping new integrations weekly) as a competitive requirement — BrainShare needs to match or exceed their integration coverage  
- Avoid: building per-user memory only. BrainShare's differentiation is team-level shared memory. Don't get pulled into the individual-agent-memory game where Hyperspell and Mem0 already compete.

