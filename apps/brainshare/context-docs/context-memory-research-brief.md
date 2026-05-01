# Context & Memory Layer for AI — Research Brief

**April 2026 · Confidential · Will Corbett**

*Landscape analysis of approaches, tools, and academic work in context management, knowledge graphs, and structured memory for AI agents. Conducted to inform BrainShare's data model and architecture decisions.*

---

# 1. The Big Picture

"Context engineering" has become a recognized discipline in 2026. Gartner declared "context engineering is in, prompt engineering is out" in mid-2025, predicting it will appear in 80% of AI tools by 2028 and that the majority of enterprise AI agent systems will be built on context graph foundations by 2028. The W3C launched a Context Graphs Community Group in February 2026 with 56 founding members. Foundation Capital published a thesis in December 2025 describing context graphs as "AI's trillion-dollar opportunity."

This validates BrainShare's core thesis: persistent, structured context is the missing layer for AI, and the market is moving rapidly toward this realization.

---

# 2. Five Architectural Approaches

## 2.1 Vector RAG (Baseline)

**How it works:** Chunk documents into text fragments, embed as vectors, retrieve by semantic similarity, stuff into LLM context window.

**Strengths:** Fast, cheap, simple to implement, scales to millions of embeddings. Good for simple factual retrieval.

**Weaknesses:** Fails on relational queries (A depends on B, B depends on C — vector search finds A and C but misses the link B). No temporal awareness. No entity relationships. Benchmarks show GraphRAG outperforms vector RAG 3.4x overall. Vector RAG scored literally 0% on schema-bound queries (KPIs, forecasts, relationships).

**Production pattern in 2026:** Adaptive RAG — a query classifier routes simple queries to vector search and complex/relational queries to graph-based retrieval. This is the emerging best practice.

**BrainShare implication:** Vector-only is insufficient. Team context is inherently relational. But vector search is still useful as one retrieval mode for simple queries.

## 2.2 GraphRAG (Structured Relationships)

**How it works:** Build a knowledge graph of entities and relationships from documents. Retrieve by graph traversal. Microsoft's GraphRAG library introduced "Community Detection" — pre-summarizing clusters of related information for instant "global" queries.

**Strengths:** Excels at multi-hop reasoning, explainable outputs, relationship queries. LinkedIn's implementation reduced ticket resolution time by 63%.

**Weaknesses:** Computationally expensive compared to vector search. Requires more setup. LightRAG (October 2024) achieved comparable accuracy with 10x token reduction through dual-level retrieval.

**Production pattern in 2026:** Hybrid systems — vector for fast narrowing, graph for relational reasoning. Most production systems combine both.

**BrainShare implication:** GraphRAG is the right foundation. But generic knowledge graphs (entity → relationship → entity) aren't typed enough for BrainShare. Need typed primitives: decisions, assumptions, actors, goals — not just generic nodes and edges.

## 2.3 Temporal Knowledge Graphs (Zep/Graphiti)

**How it works:** A knowledge graph where every fact has a validity window — when it became true and when it was superseded. Entities evolve over time with updated summaries. Everything traces back to "episodes" (raw data that produced it). Built on Neo4j.

**Key innovation:** Unlike static knowledge graphs, Graphiti handles changing relationships while preserving full temporal history. "Kendra loves Adidas shoes (as of March 2026)" — the fact has a timestamp and can be superseded.

**Production evidence:** Graphiti has 20,000+ GitHub stars (Apache 2.0 license). Zep's service saw 30x usage increase in two months, moving from thousands to millions of hourly requests. Outperforms MemGPT on the Deep Memory Retrieval benchmark (94.8% vs 93.4%).

**Architecture:**
- Episodes: Raw data as ingested — the ground truth stream
- Entities: People, concepts, projects — with evolving summaries
- Relationships: Typed connections between entities — with temporal validity
- Communities: Clustered groups for higher-level reasoning

**BrainShare implication:** This is the closest existing technology to what BrainShare needs. The temporal dimension — knowing when something was true and when it changed — is exactly what the conviction meter and decision tracking require. Graphiti is open source and could potentially be the graph engine underneath BrainShare's typed primitives.

## 2.4 Ontology-Grounded Graphs (Cognee)

**How it works:** Uses formal ontologies (OWL classes) to validate and ground LLM-extracted knowledge graphs. The pipeline: LLM extraction → ontology matching → canonicalization → subgraph expansion → graph + vector storage. Each extracted entity is matched against a formal ontology, and unmatched entities are tagged as unvalidated.

**Key innovation:** By grounding extraction in an ontology, the system produces more consistent, deduplicated, and structurally sound graphs. Their research paper ("Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning," May 2025) demonstrates significant improvements on multi-hop QA benchmarks.

**MCP integration:** Cognee ships an MCP server that exposes graph operations to AI agents — cognify (build graph from text), search (multiple modes: graph completion, chunks, summaries), and save_interaction (capture conversations as graph knowledge).

**BrainShare implication:** The ontology approach is promising for the inborn knowledge layer. BrainShare's curated operational knowledge (decision decay, priority drift, methodology patterns) could be formalized as a lightweight ontology that guides extraction. This would make BrainShare's context extraction more consistent across teams.

## 2.5 Causal RAG (Academic, Emerging)

**How it works:** Integrates causal graphs into the retrieval pipeline. CausalRAG (March 2025) constructs and traces causal relationships to preserve contextual continuity and improve retrieval precision. KG-based random-walk reasoning (October 2024) showed that incorporating causal structures into prompts significantly improves LLM reasoning.

**Academic findings:**
- CausalRAG outperforms both standard RAG and GraphRAG on several metrics
- Integrating causal structures into prompts improves reasoning, even when the causal information seems tangentially related
- However, LLMs still struggle with formal causal discovery — GPT-4 scores only ~29% on causal inference benchmarks (CORR2CAUSE)
- ActMem (March 2026) proposes "actionable memory" — bridging the gap between memory retrieval and reasoning, arguing that current benchmarks only test recall, not the ability to USE memories for planning

**BrainShare implication:** Pearl's causal ladder is the right aspiration. True causal discovery by LLMs is still unreliable. But BrainShare doesn't need the LLM to discover causal relationships — it stores decisions with pre-structured causal context (assumptions, dependencies, outcomes, why chains) and gives the LLM that structure to reason over. This is a more tractable problem than asking the LLM to infer causality from raw text.

---

# 3. The Agent Memory Competitive Landscape

Four major players have emerged for AI agent memory in 2026:

## 3.1 Mem0

**What it is:** Lightweight memory layer. Framework-agnostic SDK. Extract facts from conversations, store in vector store, inject into future prompts.

**Best for:** Chatbots, personal assistants, user preference tracking. Simple bolt-on memory.

**Architecture:** Vector-based. Stores extracted "memories" (short fact statements). Semantic search for retrieval.

**Limitations:** No relational reasoning. No temporal context. No graph structure. Personalization-focused, not team-focused.

**Lock-in:** Low. Narrow SDK surface. Easy to swap out.

## 3.2 Zep / Graphiti

**What it is:** Temporal knowledge graph engine + managed cloud service. The most architecturally sophisticated option.

**Best for:** Complex enterprise tools with evolving user states, relationship-heavy domains.

**Architecture:** Temporal knowledge graph on Neo4j. Episodes → entities → relationships with validity windows. Hybrid vector + graph retrieval.

**Limitations:** Requires Neo4j. Cloud pricing starts free but scales to $475/mo. Developer infrastructure, not end-user product.

**Lock-in:** Medium. Graph schema is somewhat portable, but Zep Cloud-specific features create stickiness.

## 3.3 Letta (formerly MemGPT)

**What it is:** Full agent runtime with OS-inspired tiered memory. Agents don't just use Letta for memory — they run inside it.

**Best for:** Autonomous agents that need to operate independently for extended periods (days/weeks).

**Architecture:** Three tiers: Core Memory (in context window, like RAM), Recall Memory (searchable conversation history), Archival Memory (long-term, queryable store). The agent itself manages what to page in and out.

**Limitations:** High lock-in — Letta owns your agent loop. Switching costs 2-6 weeks for mid-complexity agents.

## 3.4 Cognee

**What it is:** Knowledge engine with ontology-grounded extraction. Hybrid vector + graph. MCP-native.

**Best for:** Deep knowledge retrieval, complex domain reasoning, multi-hop QA.

**Architecture:** LLM extraction → ontology validation → canonical graph + vector store. Multiple search modes. "Memify" feature converts knowledge graph into conversational memory.

**Limitations:** Primarily developer tool. No end-user product surface.

## 3.5 Other Notable Players

- **Hyperspell** (YC F25, $500K seed): Memory & context layer for AI agents. Per-user memory graphs. Developer API. Not team-level.
- **OMEGA:** Local-first, zero-cloud memory. Highest LongMemEval benchmark (95.4%). Uses SQLite + ONNX. Good for privacy-sensitive use cases.
- **Hindsight:** Alternative to Mem0 with stronger retrieval at lower cost.

## 3.6 Rust-Based Memory Systems (Emerging)

A wave of Rust-based memory systems emerged in late 2025 / early 2026, targeting performance, local-first deployment, and WASM portability. None are team products, but they contain useful engineering patterns.

**MemX** (academic paper, March 2026)

Local-first long-term memory in Rust on libSQL. Hybrid retrieval pipeline: vector recall + keyword recall, fused via Reciprocal Rank Fusion (RRF), re-ranked by four factors (semantic similarity, recency, importance, frequency). Key innovation: a **low-confidence rejection rule** that suppresses spurious recalls when no answer exists — the system says "I don't know" rather than hallucinating.

Performance: Hit@1=91.3% on default scenarios, 100% under high confusion. But struggles with temporal reasoning and multi-session reasoning (under 44% accuracy) — exactly the capabilities BrainShare needs most.

**BrainShare takeaway:** Borrow the rejection rule pattern (suppress false recalls). The four-factor re-ranking (similarity, recency, importance, frequency) maps loosely to BrainShare's conviction meter dimensions.

**mempalace-rs** (GitHub, 2026)

Local, offline-first AI memory in Rust. 4-layer memory stack (L0-L3), temporal knowledge graph with valid_from/valid_to tracking, 20 MCP tools, SQLite + vector storage. Includes AAAK compression (~30x token reduction with adaptive density and importance scoring).

**BrainShare takeaway:** The 4-layer memory hierarchy and temporal knowledge graph are architecturally similar to what BrainShare is building. The 30x compression ratio is a useful benchmark. MCP-native from day one is the right approach.

**Cortex Memory** (cortex-mem.io, 2026)

AI-native memory framework in Rust. Progressive context disclosure through a three-tier hierarchy: L0 (abstract) → L1 (overview) → L2 (detailed transcript). Load only what's needed, optimizing token usage. Memory evolves through continuous agent-context interaction with auto-extraction. Stores decisions.json alongside user and agent profiles.

**BrainShare takeaway:** Progressive context disclosure (L0/L1/L2) is a smart pattern for BrainShare's context assembly protocol — when token budget is tight, serve the L0 abstract; when there's room, include L1 or L2 detail. The auto-extraction on every session commit is similar to BrainShare's extraction pipeline.

**MehulG/memX** (GitHub, 2026 — different from academic MemX)

Real-time shared memory layer for multi-agent LLM systems. Synchronizes structured state across agents with schema validation, access control, and pub/sub notifications via Redis + FastAPI. The only project in this list that handles SHARED memory across multiple agents.

**BrainShare takeaway:** The schema validation + pub/sub pattern is relevant for BrainShare's multi-tool sync. Access control (API keys mapped to glob-style patterns) is a pattern to consider for team role-based context access.

### Summary of Rust-Based Systems

All are solving single-user or single-agent memory. None handle team-level shared memory, typed team primitives, multi-tool write-back, or product-level experiences. They confirm that the infrastructure building blocks exist in Rust and that local-first, high-performance memory is achievable — but BrainShare's differentiation is at the product and semantic layer above these systems.

## 3.7 What None of Them Are Building

None of the existing agent memory systems:
- Are end-user products for teams (they're all developer APIs)
- Store typed team primitives (decisions, assumptions, goals, ownership)
- Write back to external tools (creating Notion pages, updating ClickUp cards)
- Have a conviction meter or quality-of-explanation scoring
- Combine context with a management surface (WorkOS)
- Ship with inborn knowledge about how teams operate
- Facilitate context cleanup or onboarding experiences
- Support cross-tool conversation hopping

**BrainShare occupies unoccupied territory at the product level.** The technology underneath (temporal graphs, ontologies, adaptive retrieval) is available as open-source building blocks. The differentiation is in the product experience, typed primitives, and team-level intelligence.

---

# 4. Enterprise Context Layer (Atlan)

Atlan deserves special mention as the enterprise-scale version of the context layer concept:

**What it is:** "The Context Layer for AI." A metadata management platform that connects enterprise data systems, builds a knowledge graph of data assets, and serves governed context to AI agents at inference time. Named a Leader in both Gartner's Magic Quadrant for Metadata Management (2025) and Data & Analytics Governance (2026).

**Architecture:** Metadata Lakehouse (Iceberg-native) + knowledge graph + vector storage. 80+ connectors. Context pipeline: pull metadata → build graph → AI enrichment → governed serving. MCP server for inference-time context delivery.

**Key concept: "Context Products."** Versioned, tested bundles of context that data teams ship like engineers ship code. Includes staleness triggers, lifecycle policies, and deprecation rules.

**Relevance to BrainShare:** Atlan validates that the "context layer" category is real and valuable at enterprise scale. Their architecture — context graph + governance + inference-time serving — is a pattern BrainShare should learn from. But Atlan serves data teams managing data assets. BrainShare serves operational teams managing decisions and work. Different buyer, different primitives, same architectural pattern.

---

# 5. Academic Frontiers

Key academic developments relevant to BrainShare:

## Context Engineering as a Discipline

A March 2026 paper from HSE University proposes a four-level "pyramid" of agent engineering: prompt engineering → context engineering → intent engineering → specification engineering. Intent engineering encodes organizational goals and values into agent infrastructure. Specification engineering creates machine-readable corporate policies and standards. This maps closely to BrainShare's inborn knowledge (specification engineering) and Swarm's operational intelligence (intent engineering).

## Actionable Memory (ActMem, March 2026)

Proposes that current memory benchmarks only test recall, not the ability to USE memories for planning. Introduces "actionable memory management" — combining semantic edges, causal edges, and counterfactual reasoning. The memory knowledge graph includes both association and causation, allowing agents to deduce constraints that influence current actions.

**BrainShare implication:** Validates the Decision Graph and Why Chain structures. BrainShare's memory isn't just for recall — it's for reasoning about what to do next.

## Structured Thinking for Causal Inference (May 2025)

Shows that LLMs perform dramatically better on causal reasoning when given explicit structural scaffolding (DAG representations) rather than raw text. Proposes "structured thinking" prompts that force the LLM to construct and reason over causal graphs step by step.

**BrainShare implication:** Validates the approach of pre-structuring causal context (decisions with assumptions, why chains) rather than asking the LLM to infer causality from raw text.

## Structured Context Engineering for File-Native Systems

Evaluates how structured context files (like CLAUDE.md) affect LLM agent performance. Finds that architectural decisions about context format should be tailored to model capability rather than assuming universal best practices.

**BrainShare implication:** The format in which BrainShare delivers context to LLMs matters as much as the content. Different models may perform better with different context formats.

## Compiled Memory / Atlas (March 2026)

Proposes "compiled memory" — rather than retrieving and injecting past experiences as context (which all current memory systems do), Atlas compiles verified experience into the agent's instruction structure, permanently modifying its base prompt at zero additional inference cost. Key insight: "Where prior systems improve memory capacity, Atlas addresses memory utility — what to promote, how to verify it, and how to transform it into behavioral change."

**BrainShare implication:** The distinction between memory-as-context (retrieve and inject) and memory-as-instructions (compile into the prompt permanently) is worth considering. BrainShare's inborn knowledge layer might benefit from the "compiled" approach — instead of retrieving operational patterns at runtime, compile them into the system prompt. Working memory still needs dynamic retrieval.

## MemMachine (April 2026)

Ground-truth-preserving memory system. Key innovation: "contextualized retrieval" that expands nucleus matches with neighboring episode context. Achieves 0.9169 on LoCoMo benchmark — above Mem0, Zep, Memobase, LangMem, and OpenAI baselines. Finding: retrieval-stage optimizations (depth tuning, context formatting, search prompt design) contribute more to accuracy than ingestion-stage optimizations.

**BrainShare implication:** Retrieval quality matters more than ingestion quality. Invest heavily in how BrainShare assembles context payloads (the context assembly protocol) rather than over-optimizing extraction.

## MemFactory (April 2026)

Unified inference and training framework for agent memory. Provides standardized infrastructure for memory-driven agents. Key contribution: modular architecture that separates memory extraction, storage, retrieval, and application into independent, composable components.

**BrainShare implication:** Modular pipeline architecture (extract → store → retrieve → apply) is the right approach. Each stage should be independently testable and improvable.

---

# 6. Architectural Recommendations for BrainShare

Based on this research:

## 6.1 Build on Graphiti for the Graph Engine

Zep's Graphiti is open source (Apache 2.0), handles temporal context natively, has proven production scale (millions of requests), and solves the hard infrastructure problems. Use it as the graph foundation. Don't rebuild temporal knowledge graph infrastructure from scratch.

## 6.2 Differentiate Through Typed Primitives

Graphiti stores generic entities and relationships. BrainShare stores typed primitives with specific semantics:
- Decisions (with rationale, actor attribution, supersession history)
- Assumptions (with status tracking, linked decisions, evidence)
- Goals (with sub-goal hierarchy, the Why Chain)
- Actors (humans and agents, with authority levels)
- Signal Patterns (accumulated observations over time)

These types are BrainShare's schema layer on top of Graphiti's temporal graph.

## 6.3 Implement Adaptive Retrieval

Route queries to the appropriate retrieval strategy:
- Simple factual queries → vector search (fast, cheap)
- Relational queries → graph traversal (follow relationships)
- Causal queries → Why Chain + Decision Graph traversal
- Global/summary queries → community summaries (GraphRAG pattern)

## 6.4 Consider Ontology Grounding for Inborn Knowledge

Cognee's research shows ontology-grounded extraction produces better results. BrainShare's inborn knowledge layer (operational patterns, methodology frameworks) could be formalized as a lightweight OWL ontology that guides extraction and categorization of team context. This would improve consistency across teams and reduce extraction errors.

## 6.5 Pre-Structure Causal Context, Don't Ask LLMs to Discover It

LLMs are bad at discovering causal relationships from raw data (~29% accuracy). But they're good at reasoning over pre-structured causal context. BrainShare's value is in structuring decisions with their causal context (assumptions, dependencies, outcomes, why chains) and feeding that structure to LLMs. The LLM reasons; BrainShare structures.

## 6.6 The Product Layer Is Unoccupied

Every player in this space is building developer infrastructure. Nobody is building the "teammate in charge of context" for end users. BrainShare's product layer — chat-first, writes to tools, conviction meter, onboarding experience, auto-generates WorkOS — has no direct competitor. The technology underneath is available as open-source building blocks. The race is at the product and experience level, not the infrastructure level.

---

# 7. Build vs. Buy vs. Build-On Summary

| Component | Recommendation | Why |
|-----------|---------------|-----|
| Temporal graph engine | Build on Graphiti (open source) | Proven, scaled, handles the hard infra problems |
| Vector search | Use existing (Supabase pgvector, or dedicated) | Commodity capability |
| Ontology framework | Evaluate Cognee's approach for inborn knowledge | Research shows significant quality improvement |
| Typed primitives (decisions, assumptions, etc.) | Build custom on top of Graphiti | This IS the differentiation |
| Conviction meter | Build custom | Novel — no existing solution |
| Adaptive retrieval router | Build custom | Needs to understand BrainShare's typed primitives |
| Tool integrations (Slack, Notion, Figma) | Build custom + MCP | Product-specific; no off-the-shelf solution for write-back |
| Context assembly protocol | Build custom | Core IP — how BrainShare compresses context for LLMs |
| Inborn knowledge library | Curate manually | Proprietary IP — Will's expertise codified |
| Product UX (chat, onboarding, WorkOS) | Build custom | The product IS the differentiation |

---

*Research conducted April 2026. Updated with Rust-based memory systems (MemX, mempalace-rs, Cortex Memory, MehulG/memX) and additional academic papers (Atlas/Compiled Memory, MemMachine, MemFactory). Sources include academic papers (arXiv), product documentation, GitHub repositories, industry analyses, and Gartner predictions. Landscape is moving fast — revisit quarterly.*
