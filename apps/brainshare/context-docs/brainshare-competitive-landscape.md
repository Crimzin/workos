# BrainShare — Competitive Landscape: AI Memory Systems

> Competitive scan of the AI memory ecosystem as it relates to BrainShare. Covers personal memory portability, per-agent memory infrastructure, team memory/context layers, and adjacent agentic platforms. Last updated May 2026.

---

## 1. Summary

The "AI memory" space has exploded in 2025–2026, with activity converging on three tiers:

1. **Personal memory portability**: "My AI forgot me when I switched from ChatGPT to Claude."
2. **Per-agent state management**: "My coding agent doesn't remember my preferences across sessions."
3. **Company-as-agent platforms**: "Run your entire company with AI agents that share memory." (Cofounder is the leading example.)

The first two tiers don't touch what BrainShare is building. The third tier — particularly Cofounder — is the closest architectural analog: typed memory primitives, department scoping, company-wide context, sleep-time consolidation. But even Cofounder's memory model is **flat** (no causal links between items, no assumptions with status, no intervention-outcome tracking) and **agent-facing** (humans observe the memory; they don't co-author a shared decision graph).

BrainShare's core thesis — **shared causal memory for teams** as a queryable graph of decisions, rationale, assumptions, and intervention–outcome pairs that humans and agents both read from and write to — remains unoccupied.

The strategic implication: the vocabulary of "AI memory" is being captured by the personal/per-agent framing, while "company memory" is being captured by agentic execution platforms. BrainShare should lead with **"decision-state substrate"** and **"team context graph"** to avoid being slotted into either category.

---

## 2. Landscape Map

### 2.1 Personal Memory Portability

Tools that help individuals carry AI context across chat providers. Consumer-grade, single-user, no team dimension.

**Phoenix Grove Systems / Memory Forge** — pgsgrove.com/memoryforgeland

- Converts ChatGPT/Claude/Gemini conversation exports into "memory chips" — repackaged files you upload to a new chat session
- $3.95/month subscription, runs locally in-browser, no cloud storage
- Chunking support for large histories; "Advanced Curation Mode" lets users pick which conversations to include
- Targets individuals who have built "relationships" with their AI and want continuity across providers
- **Relevance to BrainShare**: None. Solves a consumer emotional-attachment problem. Interesting only as a signal that AI memory portability is a recognized pain point at the consumer level.

**PAM (Portable AI Memory)** — portable-ai-memory.org

- Open standard (JSON interchange format, spec v1.0) for portable AI user memory
- Defines a schema for memory entries with types (skill, preference, project, etc.), provenance tracking, content hashes for integrity, and temporal metadata
- SDK converters for ChatGPT, Claude, Gemini, Copilot, Grok exports
- Analogous to vCard but for AI memories; no native provider adoption yet — converters work on observed export formats
- **Relevance to BrainShare**: Low direct relevance, but PAM's schema design is worth studying. Their memory type taxonomy (skill, preference, goal, project) is a simple ontology attempt. BrainShare's primitives (decisions, assumptions, interventions) are fundamentally different in kind — causal rather than descriptive — but PAM validates that the community wants structured, typed memory objects rather than raw conversation dumps.

**Plurality Network / AI Context Flow** — plurality.network/ai-context-flow

- Chrome extension (1k+ installs, 5-star ratings) that stores user context and injects it into any AI chatbot
- "Memory Studio" for managing context; supports context separation (work vs. personal vs. client projects)
- Prompt optimization: rewrites user queries with stored context before sending to the AI
- Privacy-focused: built on Trusted Execution Environments (TEEs), data stays local
- $10–20/month; MCP server support included
- **Relevance to BrainShare**: Minimal. Solves context repetition for power users of multiple AI tools. The "context separation" feature (isolated memory spaces per project/client) is a simplified version of BrainShare's cross-workspace context, but without any causal structure, team dimension, or intelligence layer.

### 2.2 Per-Agent Memory Infrastructure

Developer tools and platforms for making individual AI agents persistent and stateful. Infrastructure-grade, aimed at developers building agents — not at teams using them.

**Mem0 / OpenMemory** — mem0.ai/openmemory

- Developer-focused memory layer; vector storage with optional graph memory
- Three-level hierarchy: user / session / agent
- OpenMemory product: MCP server for coding agents (Cursor, VS Code, Claude Code)
- Auto-captures coding preferences, patterns, and setup; retrieves contextually via MCP
- Pitch: "Add memory to your agent in three lines of code"
- Well-funded, tens of thousands of developers, broad use-case coverage (customer support, healthcare, education, sales, e-commerce)
- **Relevance to BrainShare**: Mem0 is infrastructure BrainShare might build on or alongside — not competition. Mem0's memory is per-agent and per-user; there is no team-shared substrate, no causal structure, no decision/rationale tracking. OpenMemory validates that MCP-based memory delivery is the right distribution pattern. Mem0's graph memory option (still vector-primary) is the closest technical analog to BrainShare's graph, but architecturally different: Mem0 graphs are entity-relationship maps for retrieval; BrainShare's graph is a causal model for reasoning.

**Letta (formerly MemGPT)** — letta.com

- Open-source agent framework from UC Berkeley (Sky Computing Lab); the canonical "memory-first" agent platform in 2026
- Core innovation: agents actively manage their own memory blocks through tool calls — reading, writing, searching archives
- Recently evolved toward "Context Repositories" — git-backed memory with programmatic context management and versioning ("MemFS")
- Published a "Context Constitution" (principles for how agents manage context) and "Skill Learning" (agents learn skills through experience)
- Letta Code: memory-first coding agent, #1 model-agnostic agent on Terminal-Bench
- Model-agnostic; SDKs for Python, JavaScript, Rust
- Each agent maintains infinite message history; memory is editable, versioned, and persistent
- **Relevance to BrainShare**: The most architecturally significant player in this scan. Letta's per-agent memory blocks, git-backed versioning, and context repositories are strong engineering patterns. However, Letta's memory is per-agent — each agent manages its own state. There is no team-shared causal context that humans and agents both contribute to. This is exactly the "per-agent memory" failure mode identified in the WorkOS competitive context (Section 6.3). Letta could serve as a runtime for Swarm's individual agents (similar to how CrewAI is positioned), with BrainShare as the shared substrate layer above. Letta's trajectory is deeper into coding agents and individual developer workflows, not team operational intelligence.

**Memoripy** — github.com/caspianmoon/memoripy

- Python library (683 stars, Apache 2.0) for AI memory with short-term/long-term storage
- Features: semantic clustering, graph-based concept associations via spreading activation, memory decay and reinforcement, hierarchical clustering
- Supports OpenAI, Azure, Ollama, OpenRouter; JSON or in-memory storage backends
- Small project (27 commits, 6 contributors), but clean design
- **Relevance to BrainShare**: Minimal as a competitive threat, but interesting as a technical reference. Memoripy's decay/reinforcement mechanics validate that memory decay is a real design concern. BrainShare's spec already describes decay handling per memory type (flagging stale decisions, surfacing untested assumptions, detecting priority drift). The key difference: Memoripy's decay is statistical (cosine similarity + time), while BrainShare's should be causal (a decision decays because its assumptions changed or its context shifted, not because time passed). This distinction — **forget based on reasons, not time** — is a clean articulation of BrainShare's differentiation from every memory system in this scan.

**Octopoda** — octopodas.com / github.com/RyjoxTechnologies/Octopoda-OS

- Self-described "memory operating system for AI agents" — the most feature-complete entry in the per-agent infrastructure tier
- MIT licensed, local-first (SQLite), optional cloud sync (Postgres); built by RYJOX Technologies
- Core features: persistent key-value memory with semantic search (local embeddings), 5-signal loop detection (retry, oscillation, ping-pong, reflection, recall-write patterns), agent-to-agent messaging, crash recovery via snapshots/restore, spaCy-based knowledge graph (entity-relationship extraction), real-time observability dashboard (latency, error rates, memory health scores), goal tracking with milestones
- Drop-in integrations for LangChain, CrewAI, AutoGen, OpenAI Agents SDK; MCP server with 25 tools
- Shared memory bus: agents can share data via named pools (`agent.share("pool", "key", data)`)
- Pricing: free (5 agents, 5k memories) → $79/mo (75 agents, 1M memories)
- Very early: 5 GitHub stars, 0 forks, 17 commits, single contributor. Released v3.0.3 in April 2026.
- **Relevance to BrainShare**: Not competition, but the most interesting potential *tooling* in this scan for Swarm's agent runtime. The loop detection (catching stuck agents before they burn token budgets), crash recovery, and observability are production plumbing you don't want to build yourself. Swarm's agents could use Octopoda for operational state persistence while BrainShare provides the shared causal substrate above. However, Octopoda's shared memory is a key-value bus, not a causal graph — agents share data blobs, not decisions with rationale. Its knowledge graph is encyclopedic (entity-relationship via NER: "Alice works at Google") not operational (why a decision was made, what assumptions it rests on). Its decay model is time-based (`forget_stale(days=30)`). And its "team" dimension is agent-to-agent coordination, not human-and-agent co-authoring of team context. Same fundamental gap as everything else in this tier.

### 2.3 Team Memory & Context Layers

The category closest to BrainShare. See the main WorkOS competitive context document (workos-context.md) for detailed analysis of Interloom, Ambient, Bond, Cortex, and the CWM Leaders. Key additions from this scan:

**No new entrants identified.** The team memory space remains sparse relative to the personal/per-agent space. Interloom ($16.5M, March 2026) is still the only direct adjacent building a team-facing context graph. Ambient and Bond are still meeting-centric note layers, not causal substrates.

### 2.4 Company-as-Agent Platforms

Platforms that run entire companies via orchestrated AI agents with shared memory. The closest architectural analog to BrainShare — but oriented around agent execution, not team decision-making.

**Cofounder** (cofounder.co) — by The General Intelligence Company (GIC), NYC

- "The infrastructure for the one-person billion-dollar company." Cofounder 2 (launched May 2026) orchestrates department-scoped AI agents (engineering, sales, marketing, ops, design) that work simultaneously using tools like Linear, Slack, Notion, email, calendar, CRMs.
- **Memory architecture is the most sophisticated in this scan.** Three-tier system: working memory (session-level), core memory (personalized short-term, consolidated from recent sessions in a dialogue/call-and-answer format), long-term memory (durable organizational knowledge integrated from enterprise tools). Uses sleep-time compute for memory consolidation — background inference between sessions to reorganize and abstract stored information.
- **Benchmarking**: Published results on MemoryAgentBench (September 2025) showing Cofounder outperforms MemGPT, Self-RAG, and Mem0 on accurate retrieval tasks across long contexts (~309k tokens for Ruler-QA, ~1.4M tokens for ReDial). Multi-step retrieval behavior (avg. 3.2 memory searches per question). Acknowledged weaknesses in test-time learning and real-world task benchmarks.
- **Company Context import**: Provides a structured export prompt (visible in their Organization settings) that extracts durable context from any AI tool into typed items. Seven types: Memory, Decision, Workflow, Project, Preference, Risk, Open Question. Nine departments: Engineering, Sales, Marketing, Design, Support, Operations, Finance, Legal, Uncategorized. Evidence field for provenance. Users paste the prompt into ChatGPT/Claude, get a structured export, and import it into Cofounder.
- **Integration**: MCP-extensible, custom APIs, custom skills. Department-scoped agent workspaces with a higher-level manager agent for cross-department coordination. Human-in-the-loop approval queues for dangerous actions.
- **Relevance to BrainShare**: The most architecturally significant competitor in this scan — and the closest to BrainShare's vision in several respects:

  **What Cofounder gets right (validates BrainShare's thesis):**
  - Typed memory primitives with department scoping. Their seven types (Memory, Decision, Workflow, Project, Preference, Risk, Open Question) overlap significantly with BrainShare's primitives. This validates that the market recognizes structured, typed context objects are better than flat fact stores.
  - Sleep-time consolidation is the same concept as BrainShare's offline hook / "dream phase" — background processing between sessions to reorganize and abstract memory. Validates the three-phase architecture (online capture → offline consolidation → online injection).
  - Company-wide shared context across agents and departments. Not per-agent memory — a shared organizational knowledge base. Validates the team-shared substrate thesis.
  - The Company Context export prompt is a clever zero-infrastructure migration pattern that BrainShare should learn from.

  **What Cofounder gets wrong (BrainShare's differentiation):**
  - **Flat, not graph.** Items are independent — no structural links between related decisions, risks, assumptions, and projects. The Saglo pricing decision (Item 8 in their export) isn't linked to the Giselle risk (Item 30) or the CIIAA assumption (Item 22), even though they're causally interdependent. Retrieval is similarity-based, not graph-traversal.
  - **No assumptions as first-class objects.** Assumptions are buried as prose inside Decision items. There's no status tracking (untested/validated/invalidated), no downstream dependency tracing, no staleness detection. This is the deepest structural gap.
  - **No intervention-outcome pairs.** No mechanism to capture "we tried X, expected Y, got Z." The feedback loop that builds operational causal knowledge is missing.
  - **No causal decay.** Their consolidation is sleep-time abstraction (compress, merge, reorganize by relevance). Not reason-based decay (a decision decays because its assumptions changed). Same time/frequency paradigm as everyone else, just more sophisticated.
  - **Agent-facing, not human-co-authored.** Humans import context and observe agent outputs. They don't co-author a shared decision graph alongside agents. The memory is *for* agents to use, not *for* humans and agents to build together.
  - **Execution-first, not memory-first.** Cofounder's value prop is "run your company with agents." Memory is a means to that end. BrainShare's value prop is "never lose a decision, assumption, or piece of context again" — memory is the product, with execution (WorkOS) as the graduation path.

  **Strategic relationship:** Cofounder could be an integration target rather than a competitor. A team using Cofounder for agent execution could use BrainShare as the causal memory layer underneath, replacing Cofounder's flat memory with a decision graph. Alternatively, Cofounder's Company Context export format is a natural import source for BrainShare — ingest the flat items, infer relationships, identify buried assumptions, build the causal graph.

### 2.5 Adjacent: Personal AI Operating Systems

**Basic.tech** — basic.tech

- "Personal computing platform" — local-first, user-owned AI operating system
- Three products: Spaces (agentic interface for your digital life), Basic.id (personal cloud for files, data, context), Platform (open-standards developer tools for local-first software)
- Philosophically aligned with data sovereignty and user ownership
- **Relevance to BrainShare**: Not competition. Interesting as a signal that "user-owned AI context" is becoming a platform-level design principle. If Basic.tech succeeds, they could become an integration target — BrainShare connecting to a user's Basic.id personal context alongside their team context. Monitor for team features.

### 2.6 Research: Agent Memory Architectures

**MemGPT / Letta research lineage** (covered above as a product)

- Original paper (October 2023): "Towards LLMs as Operating Systems" — virtual context management inspired by OS memory hierarchies (paging between physical memory and disk)
- Key contribution: proved LLMs can be taught to manage their own memory via tool calls
- Evolved from research into full commercial platform (Letta)

**Emerging academic work** (arxiv.org/html/2603.04740v1, March 2026)

- Survey of agent memory architectures identifies two taxonomic traditions: cognitive science (CoALA framework: episodic/semantic/procedural/working memory) and engineering architecture (Letta's hierarchy of in-context vs. out-of-context memory)
- Notes that most AI agents remain "short-lived, stateless, and singularly focused on task completion" but the trend is clearly toward persistent, long-running agents
- Raises the ontological question: "what memory is" vs. "how memory works" — directly relevant to BrainShare's philosophical foundations
- **Key quote worth tracking**: "When an AI assistant accompanies a person for years, when a digital employee works continuously at a company for months, when multiple AI citizens must coexist long-term within a shared governance framework — the assumptions of Memory-as-Tool will no longer suffice."

---

## 3. Integration Scorecard: Memory Systems

How each player scores on the dimensions that matter for BrainShare's thesis.

| System | Scope | Memory Structure | Causal Reasoning | Team-Shared | Decay Model | MCP Support |
|---|---|---|---|---|---|---|
| PGS Memory Forge | Personal | Raw conversation dump | None | No | None | No |
| PAM | Personal | Typed JSON entries | None | No | None | No |
| Plurality / AI Context Flow | Personal | Key-value context blobs | None | No | None | Yes |
| Mem0 / OpenMemory | Per-agent | Vector + optional graph | None | No | Time-based | Yes |
| Letta | Per-agent | Editable memory blocks, git-backed | None | No | Agent-managed | Yes |
| Memoripy | Per-agent | Embeddings + concept graph | None | No | Statistical (time + access) | No |
| Octopoda | Per-agent (shared bus) | Key-value + spaCy NER graph | None | Agent-to-agent only | Time-based | Yes (25 tools) |
| Cofounder | Company-wide | Typed items (7 types), 3-tier with sleep-time consolidation | None | Yes (department-scoped) | Sleep-time abstraction (time/relevance) | Yes |
| Interloom | Team | Context graph | Partial | Yes | Unknown | Unknown |
| Ambient | Team (meetings) | Descriptive notes | None | Partial | None | Unknown |
| Bond | Team (briefings) | Vector-RAG summaries | None | Partial | None | Yes |
| **BrainShare** | **Team** | **Causal graph** | **Core feature** | **Yes** | **Causal (reason-based)** | **Planned** |

---

## 4. What This Means for BrainShare

### 4.1 Cofounder is the closest — but still structurally different

Cofounder is the first product to combine typed memory primitives, department scoping, company-wide shared context, and sleep-time consolidation into a single platform. It validates nearly every architectural intuition behind BrainShare. But its memory model is flat (no causal links), has no first-class assumptions or intervention-outcome tracking, and is designed to serve agents rather than to be co-authored by humans and agents together. The gap between "typed flat items with sleep-time consolidation" and "causal graph with reason-based decay and human-agent co-authoring" is the gap BrainShare occupies.

### 4.2 The vocabulary risk

"AI memory" now means "my AI remembers my preferences" in the market's mental model. When BrainShare says "memory," people will hear Mem0/Letta/PAM. Lead with **"decision-state substrate"** or **"team context graph"** — not "memory" — to avoid category confusion.

### 4.3 Infrastructure to build on, not against

- **Cofounder** could be an integration target — BrainShare as the causal memory layer beneath Cofounder's agent execution, or Cofounder's Company Context export as an import source for BrainShare's graph
- **Mem0** could serve as a low-level storage backend or per-agent memory layer beneath BrainShare's team graph
- **Letta** could serve as a runtime for Swarm's agents, with BrainShare as the shared substrate above
- **PAM's schema** is worth studying for interoperability — BrainShare should be able to export/import context in standard formats
- **MCP** is the universal distribution pattern; every serious player supports it

### 4.4 The decay differentiation

Every memory system in this scan that implements decay does so based on time (recency) or access frequency (popularity). BrainShare's decay should be based on **causal validity**: a decision decays because its assumptions were invalidated or its context shifted, not because nobody looked at it recently. This is a concrete, explainable differentiator: "Everyone else forgets based on time. BrainShare forgets — and remembers — based on reasons."

### 4.5 The ontology gap remains wide open

The March 2026 academic survey explicitly identifies the missing question: "what memory is" vs. "how memory works." Every product in this scan answers "how" (vector stores, memory blocks, context repositories). BrainShare's ontology work — defining the irreducible primitives of team context — is the "what" answer nobody else is pursuing. This is the intellectual moat.

---

## 5. Monitoring Priorities

| Watch | Signal | Frequency |
|---|---|---|
| Cofounder / GIC | Any move toward causal linking between memory items, assumption tracking, human-agent co-authoring of memory, or graph-based retrieval | Monthly |
| Letta | Any move toward team-shared memory or multi-agent shared state | Monthly |
| Mem0 | Any move beyond per-agent toward team-scoped or causal memory | Monthly |
| Octopoda | Traction (stars/forks), any move toward structured team memory or causal primitives; evaluate loop detection + observability as Swarm tooling | Quarterly |
| Interloom | Product launches, funding rounds, ICP expansion | Monthly |
| Ambient / Bond | Shift from meeting-centric to activity-centric capture | Quarterly |
| PAM | Provider adoption of the standard; if ChatGPT/Claude natively support PAM export | Quarterly |
| Basic.tech | Team features, collaboration layer, enterprise positioning | Quarterly |
| Academic research | New papers on agent memory ontology, causal memory architectures, team-shared context | Quarterly |

---

*This document supplements the main competitive context in workos-context.md. That document covers the broader WorkOS competitive landscape (CWM Leaders, AI Teammates, GTM strategy, moat analysis). This document focuses specifically on the AI memory ecosystem as it relates to BrainShare.*