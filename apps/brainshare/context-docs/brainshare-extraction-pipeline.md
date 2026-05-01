# BrainShare Extraction Pipeline — Build Spec v0.1

*Everything needed to implement the core pipeline that turns raw tool data into structured context primitives.*

---

## 1. What This Document Is

This is the build spec for BrainShare's extraction pipeline — the core system that watches connected tools (Discord, Slack, Notion, Figma, Google Docs, GitHub, etc.), detects high-signal context (decisions, assumptions, actions, open questions), and writes structured primitives to a persistent knowledge graph.

This pipeline is the foundation of BrainShare. Everything else — the conviction meter, the context assembly for LLMs, the cross-tool sync, the WorkOS auto-generation — builds on top of what this pipeline produces.

The spec uses **Discord message extraction** as one reference implementation and **Claude/ChatGPT conversation extraction** as the primary first implementation. AI conversations are the richest source of decision-making context for teams working with AI today, and demonstrating "your AI never forgets" is BrainShare's most visceral value prop. Section 13 explains how the same pattern generalizes to every other tool.

---

## 2. What BrainShare Is (Context for the Builder)

BrainShare is the shared memory layer for teams of humans and AI agents. It connects to the tools a team already uses, builds a structured understanding of their work, and ensures the right context is in the right place at the right time.

**The core problem:** Teams make decisions in Slack threads that never get captured. Specs change in Figma but nobody updates the project cards. Contractors don't know what changed since last week. AI assistants (Claude, ChatGPT) start every session from zero because they have no persistent memory of the team's context.

**What BrainShare does:** It watches all connected tools, extracts structured context primitives (decisions, assumptions, actions, etc.), stores them in a temporal knowledge graph, and uses that graph to keep every tool and every AI session informed.

**BrainShare is both a product and infrastructure.** It's a standalone product teams interact with (via chat, via Slack bot, via a web UI). And it's the context engine underneath WorkOS (a work management platform) and Swarm (an operational intelligence layer).

---

## 3. Technical Foundation: Graphiti

BrainShare's knowledge graph is built on **Graphiti** — Zep's open-source temporal knowledge graph engine (Apache 2.0 license, 20,000+ GitHub stars).

**Why Graphiti:** It handles the hard infrastructure problems that we don't want to rebuild:
- Constructs knowledge graphs from unstructured data
- Every fact has a temporal validity window (when it became true, when it was superseded)
- Entities evolve over time with updated summaries
- Everything traces back to "Episodes" — the raw source data that produced it
- Hybrid vector + graph retrieval
- Built on Neo4j
- Proven at production scale (millions of hourly requests)

**What we build on top of Graphiti:** Typed primitives (Decision, Assumption, Action, etc.) with specific semantics and behaviors. A conviction scoring system. An extraction prompt pipeline. Tool-specific ingestion adapters. Action/write-back logic.

**Installation:** `pip install graphiti-core` — see https://github.com/getzep/graphiti

---

## 4. The Typed Primitives

BrainShare extracts and stores these specific types. They are not generic "entities" — each type has defined fields and behaviors.

### DECISION
An explicit or implicit agreement to do something, use something, or go in a particular direction.

```
Decision {
  id: string (auto-generated)
  statement: string             // what was decided, one clear sentence
  rationale: string             // why — as actually discussed, not invented
  proposed_by: Actor            // who first suggested it
  approved_by: Actor[]          // who confirmed or agreed
  decision_type: "explicit" | "implicit"
  status: "active" | "superseded" | "reversed"
  supersedes: Decision | null   // link to prior decision this replaces
  conviction: float (0.0-1.0)
  source_episodes: Episode[]    // raw data that produced this
  created_at: datetime
  updated_at: datetime
}
```

### ASSUMPTION
A belief the team is operating on that could be wrong. Often embedded in reasoning ("since...", "because...", "assuming that...", "as long as...", "given that...").

```
Assumption {
  id: string
  statement: string             // the belief, one clear sentence
  basis: string                 // why they believe this, or "unstated"
  status: "untested" | "validated" | "invalidated"
  linked_decisions: Decision[]  // which decisions depend on this
  conviction: float (0.0-1.0)
  source_episodes: Episode[]
  created_at: datetime
  updated_at: datetime
}
```

### ACTION
A commitment by a specific person (or agent) to do a specific thing.

```
Action {
  id: string
  statement: string             // what will be done
  owner: Actor                  // who committed
  deadline: datetime | null     // if mentioned
  status: "pending" | "in_progress" | "completed" | "dropped"
  linked_decision: Decision | null
  conviction: float (0.0-1.0)
  source_episodes: Episode[]
  created_at: datetime
  updated_at: datetime
}
```

### QUESTION
An unresolved question raised but not answered.

```
Question {
  id: string
  statement: string             // the question
  raised_by: Actor
  context: string               // why it matters
  status: "open" | "resolved"
  resolution: string | null     // the answer, when resolved
  source_episodes: Episode[]
  created_at: datetime
  updated_at: datetime
}
```

### CONTEXT_UPDATE
A factual update about the state of work that doesn't fit the above categories.

```
ContextUpdate {
  id: string
  statement: string             // what happened or is now true
  actor: Actor                  // who provided the update
  relates_to: string            // what topic or work item
  source_episodes: Episode[]
  created_at: datetime
}
```

### ACTOR
A human or AI agent on the team.

```
Actor {
  id: string
  name: string
  type: "human" | "agent"
  roles: string[]               // e.g., ["co-founder", "product"]
  authority_domains: string[]   // e.g., ["product", "strategy"]
  authority_weight: float       // 0.0-1.0, used in conviction scoring
  agent_subtype: string | null  // e.g., "claude", "claude_code", "swarm"
}
```

### EPISODE
The raw source data. Immutable. Every primitive traces back to its source episodes.

```
Episode {
  id: string
  source_tool: string           // "discord", "slack", "notion", "figma", etc.
  source_location: string       // channel name, page ID, file name, etc.
  timestamp_start: datetime
  timestamp_end: datetime
  actors: Actor[]               // who participated
  raw_content: string           // the full text content
  message_count: number | null  // for chat-based tools
}
```

### Relationships Between Primitives

These are the edges in the graph. Every relationship has temporal metadata (valid_from, valid_to) inherited from Graphiti.

```
Decision  --proposed_by-->     Actor
Decision  --approved_by-->     Actor
Decision  --depends_on-->      Assumption
Decision  --supersedes-->      Decision
Decision  --spawned-->         Action
Decision  --source-->          Episode
Decision  --addresses_goal-->  Goal (if Why Chain exists)

Assumption --linked_to-->      Decision
Assumption --source-->         Episode

Action    --owned_by-->        Actor
Action    --serves-->          Decision
Action    --source-->          Episode

Question  --raised_by-->       Actor
Question  --source-->          Episode
```

---

## 5. The Pipeline (7 Steps + Pre-Step)

```
Raw Data (e.g., Claude conversation, Discord messages)
    |
    v
[PRE-STEP] RELEVANCE SCOPING — check content against attention scope tree
    If scope = ✅ (full extraction) → proceed to Step 1
    If scope = 🟡 (lightweight) → create Episode, skip detailed extraction
    If scope = ❌ (ignore) → skip entirely
    If scope = unknown (new topic) → flag for user categorization
    |
    v
[Step 1] EPISODE CREATION — store raw data as immutable Episodes
    |
    v
[Step 2] CHUNKING — group messages into coherent conversation chunks
    |
    v
[Step 3] EXTRACTION — LLM extracts typed primitives from each chunk
    |
    v
[Step 4] CONVICTION SCORING — score each primitive for confidence
    |
    v
[Step 5] GRAPH VALIDATION — check against existing graph for conflicts/duplicates
    |
    v
[Step 6] STORAGE — write validated primitives to Graphiti
    |
    v
[Step 7] ACTION — notify team, write to external tools, update cards/stacks
```

The **relevance scoping pre-step** checks incoming content against the user's attention scope tree (see BrainShare product spec §5.7). This prevents BrainShare from wasting extraction cycles on cat poop conversations while still capturing everything within active scopes. Content that doesn't match any existing scope gets flagged — BrainShare may later surface it: "You've been discussing meal planning a lot. Want me to start tracking that?"

---

## 6. Step 1: Episode Creation

Every piece of raw data becomes an Episode — the immutable ground truth.

For Discord, an episode is a batch of messages from a single channel within a time window. BrainShare connects to Discord via bot (using discord.py or discord.js) and receives messages in real time.

```python
# Pseudocode
def create_episode(messages: list[DiscordMessage]) -> Episode:
    return Episode(
        id=generate_id(),
        source_tool="discord",
        source_location=messages[0].channel_name,
        timestamp_start=messages[0].timestamp,
        timestamp_end=messages[-1].timestamp,
        actors=extract_unique_actors(messages),
        raw_content=format_messages(messages),
        message_count=len(messages)
    )
```

---

## 7. Step 2: Chunking

Before extraction, group messages into conversation chunks — coherent threads that belong together.

**Chunking heuristics for Discord/Slack:**
- Messages within 5 minutes of each other in the same channel = same chunk
- A gap of >15 minutes starts a new chunk
- A topic shift (detected by lightweight semantic similarity between messages) starts a new chunk
- A Discord thread is always its own chunk
- Maximum chunk size: 50 messages (break larger conversations into multiple chunks)

```python
# Pseudocode
def chunk_messages(messages: list[DiscordMessage]) -> list[Chunk]:
    chunks = []
    current_chunk = [messages[0]]
    
    for msg in messages[1:]:
        time_gap = msg.timestamp - current_chunk[-1].timestamp
        
        if time_gap > timedelta(minutes=15):
            chunks.append(current_chunk)
            current_chunk = [msg]
        elif len(current_chunk) >= 50:
            chunks.append(current_chunk)
            current_chunk = [msg]
        else:
            current_chunk.append(msg)
    
    chunks.append(current_chunk)
    return chunks
```

---

## 8. Step 3: Extraction — The Core Prompt

An LLM reads each conversation chunk and extracts typed primitives.

### System Prompt

```
You are BrainShare's extraction engine. Your job is to read a
conversation between team members and extract structured context
primitives.

You extract the following types:

DECISION — an explicit or implicit agreement to do something, 
use something, or go in a particular direction. A decision has:
- statement: what was decided (one clear sentence)
- rationale: why (may be explicit or inferred from discussion)
- proposed_by: who first suggested it
- approved_by: who confirmed or agreed (may be multiple people)
- type: "explicit" (someone said "let's do X") or "implicit" 
  (the group converged without a formal statement)

ASSUMPTION — a belief the team is operating on that could be 
wrong. Often embedded in reasoning. An assumption has:
- statement: the belief (one clear sentence)
- basis: why they believe this (evidence cited, or "unstated")
- status: "untested" (default for new assumptions)
- linked_decision: which decision this assumption supports

ACTION — a commitment by a specific person to do a specific 
thing. An action has:
- statement: what will be done
- owner: who committed to doing it
- deadline: if mentioned (otherwise null)
- linked_decision: which decision this action serves

QUESTION — an unresolved question that was raised but not 
answered. A question has:
- statement: the question
- raised_by: who asked
- context: why it matters
- status: "open"

CONTEXT_UPDATE — a factual update about the state of work 
that doesn't fit the above categories but is worth recording.
Has:
- statement: what happened or what is now true
- actor: who provided the update
- relates_to: what work item or topic this is about

RULES:
1. Only extract what is ACTUALLY in the conversation. Do not 
   invent or infer things that weren't discussed.
2. For IMPLICIT decisions, you must be able to point to 
   specific messages that demonstrate convergence. If it's 
   ambiguous, extract it as a QUESTION instead.
3. Every extraction must reference the specific messages that 
   support it (by message index).
4. If a conversation is purely social or off-topic, return 
   an empty extraction. Not everything is work context.
5. Prefer fewer, higher-quality extractions over many low-
   confidence ones.
6. Rationale for decisions should capture the ACTUAL reasons 
   discussed, not generic justifications.
7. Assumptions are often hidden in phrases like "since," 
   "because," "assuming that," "as long as," "given that."
8. An emoji reaction (thumbs up, etc.) from a person with 
   decision authority counts as approval.
```

### User Prompt Template

```
TEAM CONTEXT:
{foundation_context}

This is background information about the team. Use it to understand
who has authority over what, what the team is working on, and what
the current priorities are. This helps you correctly identify who
is proposing vs. approving decisions, and which topics are relevant.

ACTORS IN THIS CONVERSATION:
{actor_list_with_roles_and_authority}

CONVERSATION:
{chunked_messages_with_numbered_indices}

---

Extract all context primitives from this conversation. For each
primitive, cite the specific message indices that support it.

Return ONLY valid JSON, no preamble, no markdown backticks:
{
  "primitives": [
    {
      "type": "DECISION" | "ASSUMPTION" | "ACTION" | "QUESTION" | "CONTEXT_UPDATE",
      "content": { ... type-specific fields as described above ... },
      "supporting_messages": [1, 3, 5],
      "confidence": 0.0 to 1.0
    }
  ],
  "no_extractable_context": true | false
}
```

### Foundation Context

The `{foundation_context}` variable is populated from BrainShare's Foundation memory layer — the slow-changing facts about the team. This is assembled once during onboarding and updated rarely. Example:

```
Burn is a social fitness game for iOS, targeting public launch in 
summer 2026. The team has been building for 5 years with two major 
redesigns.

Team:
- Will: Co-founder. Product authority. Based in NYC.
- Chris: Co-founder. Authority over business, QA, and approvals. 
  Based in Hong Kong.
- Marek: Co-founder. Design authority. Based in Hong Kong. 
  Sometimes unavailable for late meetings due to timezone.
- Ziga: iOS engineer (freelancer). Sole engineer on the project. 
  Based in Slovenia.

How they work: Weekly sprint planning on Wednesdays via Discord. 
Async the rest of the week. Tools: Discord (communication), 
Factor/WorkOS (project management), Figma (design), GitHub (code).

Current focus: Building gamified onboarding experience, SSO, and 
gamer tags for public launch. Transitioning from PWA to native iOS.
```

### Worked Example

**Input conversation (from a Discord #development channel):**

```
ACTORS IN THIS CONVERSATION:
- Ziga (iOS Engineer, technical authority on implementation)
- Will (Co-founder, product authority)
- Marek (Designer, co-founder, design authority)
- Chris (Co-founder, business authority)

CONVERSATION:
[1] Ziga: hey, I looked into the SSO options. Firebase Auth 
    supports Google and Apple sign-in out of the box. I think 
    we should just use that instead of building our own auth flow
[2] Will: makes sense. what about email/password?
[3] Ziga: Firebase handles that too. and it's free up to 50k 
    monthly active users which is way more than we need for launch
[4] Will: ok let's go with Firebase Auth then. @marek can you 
    update the sign-in screen designs to show Google and Apple 
    buttons?
[5] Marek: sure, will do tomorrow
[6] Chris: 👍
```

**Expected LLM output:**

```json
{
  "primitives": [
    {
      "type": "DECISION",
      "content": {
        "statement": "Use Firebase Auth for authentication, including Google Sign-In, Apple Sign-In, and email/password",
        "rationale": "Firebase Auth supports Google and Apple sign-in out of the box, handles email/password, and is free up to 50k MAU which exceeds launch needs. Avoids building custom auth.",
        "proposed_by": "Ziga",
        "approved_by": ["Will", "Chris"],
        "type": "explicit"
      },
      "supporting_messages": [1, 2, 3, 4, 6],
      "confidence": 0.95
    },
    {
      "type": "ASSUMPTION",
      "content": {
        "statement": "50,000 monthly active users is sufficient capacity for the public launch",
        "basis": "Ziga stated this is 'way more than we need for launch' and nobody challenged it",
        "status": "untested",
        "linked_decision": "Use Firebase Auth for authentication"
      },
      "supporting_messages": [3],
      "confidence": 0.8
    },
    {
      "type": "ASSUMPTION",
      "content": {
        "statement": "Building custom auth would be significantly more work than using Firebase Auth",
        "basis": "Implied by Ziga's framing of 'instead of building our own auth flow' — the team did not discuss the effort difference explicitly",
        "status": "untested",
        "linked_decision": "Use Firebase Auth for authentication"
      },
      "supporting_messages": [1],
      "confidence": 0.7
    },
    {
      "type": "ACTION",
      "content": {
        "statement": "Update sign-in screen designs to show Google and Apple sign-in buttons",
        "owner": "Marek",
        "deadline": "Tomorrow",
        "linked_decision": "Use Firebase Auth for authentication"
      },
      "supporting_messages": [4, 5],
      "confidence": 0.95
    }
  ],
  "no_extractable_context": false
}
```

### Why This Extraction Is Correct

- **The Decision** captures the full scope (Google, Apple, AND email/password — because messages [2] and [3] expanded the scope beyond Ziga's initial proposal). The rationale is what was actually discussed, not a generic justification.
- **Assumption 1** (50k MAU) catches the implicit assumption hiding in message [3]. It's marked "untested" because nobody verified launch MAU projections.
- **Assumption 2** (custom auth harder) catches the deeper assumption in Ziga's framing in message [1]. Lower confidence (0.7) because it's implied, not stated.
- **The Action** captures Marek's specific commitment with a deadline. High confidence because it's an explicit, unambiguous commitment.
- **Chris's 👍** is correctly interpreted as approval (he's a co-founder with authority), not as a separate action.
- **Will's question about email/password** [2] is NOT extracted as a separate QUESTION because it was immediately answered [3] and resolved.

---

## 9. Step 4: Conviction Scoring

The LLM provides an initial confidence score (0.0-1.0). BrainShare adjusts this into a final conviction score:

```python
def calculate_conviction(primitive, llm_confidence, actors, existing_graph):
    # Start with LLM's confidence
    conviction = llm_confidence
    
    # Authority weight: decisions approved by founders/leads = higher
    if primitive.type == "DECISION":
        max_authority = max(
            get_actor(a).authority_weight 
            for a in primitive.content.approved_by
        )
        conviction *= (0.7 + 0.3 * max_authority)  # range: 0.7x to 1.0x
    
    # Explicitness weight
    if primitive.type == "DECISION":
        if primitive.content.decision_type == "explicit":
            conviction *= 1.0
        else:  # implicit
            conviction *= 0.75
    
    # Hard-to-vary bonus (Deutsch test):
    # If rationale contains specific, testable, interconnected reasons
    # (not just "it seems good"), add a small bonus
    if primitive.type == "DECISION" and primitive.content.rationale:
        specificity = assess_rationale_specificity(primitive.content.rationale)
        conviction += specificity * 0.1  # up to +0.1 bonus
    
    # Clamp to [0.0, 1.0]
    return min(max(conviction, 0.0), 1.0)
```

### Authority Weight Examples

| Actor Role | authority_weight | Rationale |
|-----------|-----------------|-----------|
| Founder / CEO | 1.0 | Ultimate decision authority |
| Co-founder with domain authority | 0.95 | Very high, but might defer in some areas |
| Lead engineer (employee) | 0.85 | High technical authority |
| Freelance engineer | 0.75 | Trusted contributor, but not final authority |
| Contractor (new) | 0.5 | Limited trust, limited context |
| AI agent (Claude, etc.) | 0.6 | Proposes well, but humans approve |

These weights are set per Actor during onboarding and can be adjusted.

### Conviction Thresholds — What BrainShare Does

```
conviction >= 0.8  →  ASSERT
  Store as fact. Act on it (create cards, notify team, update tools).
  In conversation: "The spec says Y." No hedging.

conviction 0.5-0.8 →  FLAG
  Store, but seek confirmation from the team.
  In conversation: "It sounds like you decided X — is that right?"

conviction < 0.5   →  ASK
  Don't store yet. Surface as a question.
  In conversation: "Were you exploring X, or did you decide on it?"
```

---

## 10. Step 5: Graph Validation

Before storing, check extracted primitives against the existing Graphiti graph:

### Duplicate Detection

Semantic similarity check against existing primitives of the same type. Use Graphiti's built-in vector search to find similar Decision/Assumption/Action nodes.

If a near-duplicate is found:
- Same meaning, same actors → skip (already captured)
- Same topic but updated/modified → create a new version, link to the old one
- Same topic but different conclusion → flag as a potential conflict

### Conflict Detection

Does this new primitive contradict an existing active primitive?

```python
def check_conflicts(new_primitive, graph):
    if new_primitive.type == "DECISION":
        # Find existing active decisions on similar topics
        similar = graph.search_similar(
            type="Decision",
            status="active",
            query=new_primitive.content.statement,
            threshold=0.75
        )
        for existing in similar:
            if is_contradictory(new_primitive, existing):
                # Mark old decision as superseded
                existing.status = "superseded"
                new_primitive.supersedes = existing.id
                return ConflictResult(
                    type="supersession",
                    old=existing,
                    new=new_primitive
                )
    return None
```

### Goal Linkage

Can BrainShare connect this primitive to an existing goal in the Why Chain? This is a semantic search against existing Goal nodes. If a match is found, create a relationship. If not, the primitive is an "orphan" — still stored, but flagged for future linkage.

---

## 11. Step 6: Storage

Write validated primitives to Graphiti.

```python
async def store_primitive(primitive, graph, episode):
    # Create the entity in Graphiti
    entity = await graph.add_entity(
        name=primitive.content.statement,
        entity_type=primitive.type,
        properties={
            **primitive.content.__dict__,
            "conviction": primitive.conviction,
            "status": get_initial_status(primitive),
        }
    )
    
    # Create relationships
    if primitive.type == "DECISION":
        for actor_name in primitive.content.approved_by:
            actor = await graph.get_entity(name=actor_name, type="Actor")
            await graph.add_relationship(entity, "approved_by", actor)
        
        proposer = await graph.get_entity(
            name=primitive.content.proposed_by, type="Actor"
        )
        await graph.add_relationship(entity, "proposed_by", proposer)
        
        if primitive.supersedes:
            old = await graph.get_entity(id=primitive.supersedes)
            await graph.add_relationship(entity, "supersedes", old)
    
    if primitive.type == "ASSUMPTION":
        for decision_ref in primitive.content.linked_decisions:
            decision = await graph.get_entity(
                name=decision_ref, type="Decision"
            )
            await graph.add_relationship(decision, "depends_on", entity)
    
    if primitive.type == "ACTION":
        owner = await graph.get_entity(
            name=primitive.content.owner, type="Actor"
        )
        await graph.add_relationship(entity, "owned_by", owner)
        
        if primitive.content.linked_decision:
            decision = await graph.get_entity(
                name=primitive.content.linked_decision, type="Decision"
            )
            await graph.add_relationship(entity, "serves", decision)
    
    # Link to source episode
    await graph.add_relationship(entity, "source", episode)
    
    return entity
```

---

## 12. Step 7: Action

After storing, BrainShare acts on what it extracted.

### Notification in Source Tool

Post a confirmation in the same channel/thread where the conversation happened:

```
🧠 BrainShare: Captured —
  📌 Decision: Use Firebase Auth (Google, Apple, email/password)
     Proposed by Ziga, approved by Will and Chris
  ⚠️ Assumption tracked: 50k MAU sufficient for launch (untested)
  📋 Action: @Marek — update sign-in designs by tomorrow
  
  Anything wrong? Just tell me.
```

Short, factual. Gives the team a chance to correct immediately.

### Write to WorkOS

- If a relevant card or stack exists → update its post stream with the decision, link assumptions, add the action. Sometimes a stack is the right scope (strategic decisions spanning multiple cards); sometimes a card (specific implementation choices).
- If no relevant card/stack exists → create one, populated with the decision as context
- Update card status if appropriate (e.g., if the decision unblocks work)

### Write to Other Connected Tools

- If the team uses Notion → create or update a decision record
- If the team uses ClickUp / Asana / Linear → update the relevant task
- If the team uses Google Docs → add to a running decisions document

### Feed Future AI Sessions

Store the primitive in Graphiti such that future context assembly queries will find it. When anyone on the team asks Claude about auth, SSO, or sign-in, this decision (with rationale and assumption status) will be included in the context payload.

### Monitor for Completion (Actions Only)

For extracted Actions, BrainShare watches for completion signals:
- Marek updates Figma → check if it relates to the sign-in screen action
- If completed → mark action as complete, log the completion
- If past deadline with no activity → gentle nudge based on conviction level

---

## 13. Generalizing to Other Tools

The 7-step pipeline applies to every tool. Only Steps 1-3 change per tool:

### Discord / Slack
- **Episode:** Batch of messages per channel per time window
- **Chunking:** Time gaps (>15min = new chunk) + topic shifts + thread boundaries
- **Extraction nuances:** Decisions often implicit. Emoji reactions = approval. Need to handle threads vs. main channel.

### Notion / Google Docs
- **Episode:** Document version or edit session
- **Chunking:** Per-document. If document is long, chunk by section/heading.
- **Extraction nuances:** More formal/structured. Decisions may be written explicitly. Look for TODO items, resolved questions, stated conclusions.

### Figma
- **Episode:** Frame changes, comments, version history entries
- **Chunking:** Per-frame or per-comment thread
- **Extraction nuances:** Design decisions ("went with option B for the nav"). "Ready for dev" signals. Need visual understanding for frame-to-card matching (semantic matching on frame names/descriptions vs. card titles).

### GitHub
- **Episode:** PRs, issues, issue comments, commit messages, code review comments
- **Chunking:** Per-PR or per-issue thread
- **Extraction nuances:** Technical decisions are often in PR descriptions and code review comments. Merge = implicit approval. Need to detect architectural decisions vs. implementation details.

### Meeting Transcripts (Fathom, Granola, etc.)
- **Episode:** Full transcript of a meeting
- **Chunking:** By speaker turns + topic boundaries. Meetings are DENSE with decisions — need to separate discussion from conclusions.
- **Extraction nuances:** A lot of brainstorming will happen before a decision. The prompt needs to distinguish "we discussed X" from "we decided X." Look for closing language: "ok so we'll...", "let's go with...", "the plan is..."

### Claude / ChatGPT Conversations — PRIMARY FIRST PIPELINE

AI conversations are the richest source of decision-making context for AI-native teams. This is the first pipeline to build.

**Why this source first:**
- This is where decisions, architecture, specs, and strategy are being actively developed
- Every AI-heavy knowledge worker experiences the pain of "my AI forgot everything from last session"
- Demonstrating "your AI never forgets" is BrainShare's most immediately visceral value prop
- Conversations are moderately structured (clear turn-taking, longer messages) — harder than Factor, easier than Discord
- This pipeline directly enables BrainShare's core promise: context continuity across AI tools

**Episode format:** A full conversation thread (or a project/chat within Claude Projects, a ChatGPT conversation). Each episode includes all messages with speaker attribution (human vs. AI), timestamps, and any attached files or artifacts.

**Data access:**
- Claude: MCP connection to Claude's conversation history (preferred — real-time, no manual export); fallback to API conversation history or Claude Projects file access
- ChatGPT: Data export (Settings → Export data), shared conversation links, or API conversation history. MCP not yet available for ChatGPT.
- Claude Code: Session transcripts via MCP, CLAUDE.md context, git commit history produced during sessions
- CLI fallback: `brainshare ingest ./conversation-export.json` for manual ingestion of exported conversation files
- All sources: BrainShare should detect and handle multiple export formats (JSON, Markdown, HTML) gracefully

**Chunking strategy:**
- Per-conversation is the default episode unit
- Long conversations (like this one) should be chunked by TOPIC, not by time — a single conversation may cover 10 distinct topics over several hours
- Topic boundaries detected by: explicit topic shifts ("ok, now let's talk about..."), long pauses in the conversation, changes in the subject matter being discussed
- Maximum chunk size: ~50 turns or ~15,000 tokens, whichever comes first

**Critical extraction principle: Conviction always traces to human signal, not AI generation.**

Both humans and AI produce content in conversations. An AI can write the best spec in the world; a human can make the clearest decision statement imaginable. The content can come from anyone. But conviction — the confidence that something is true, decided, or adopted — always traces to human signal weighted by authority:

- An AI suggestion is NOT a decision until a human with authority confirms it
- A human statement IS potential content, with conviction based on how explicitly it was stated and the human's authority in the relevant domain
- In human-to-human conversations (Discord, Slack), both sides produce content AND signal — conviction comes from convergence and authority
- In human-to-AI conversations, the AI often produces the richest content (frameworks, analysis, specs), but the human's response determines whether it's adopted as team context

| Human Signal | Conviction Interpretation |
|-------------|--------------------------|
| "Yes, that feels right" / "exactly" / "perfect" | High conviction — AI content is validated |
| "I agree with all your answers" | High conviction — multiple points validated at once |
| "Yes but [modification]" / "close, but..." | Medium-high conviction — core is right, details adjusted |
| "I'm not sure about that" / "let me think" | Low conviction — tentative, don't store as decided |
| "No, that's wrong because..." | Rejection — don't store AI content; store the human's correction |
| "Let's come back to this" / topic change | Deferred — store as open question, not decision |
| Silence (moving on without commenting on a specific point) | Medium conviction — implicit acceptance, but not explicit |
| "nah" / "not yet" / brief dismissal | Low conviction — AI content not accepted |
| "this is great" / enthusiastic engagement + building on it | High conviction — AI content adopted and extended |

**Extraction nuances:**
- An AI suggestion is NOT a decision until the human confirms it. "I'd recommend using Graphiti" from Claude is a suggestion. "Yes, let's build on Graphiti" from the human is a decision.
- When the human says "update the spec with this," that's a high-conviction decision to adopt whatever was just discussed
- Watch for the human DIRECTING the AI — "now let's work on X" or "focus on Y" — these are implicit priority/scope decisions
- Multi-turn refinement patterns: the AI proposes → human pushes back → AI refines → human accepts. The FINAL accepted version is the decision, not the intermediate proposals.
- Artifact/document generation: when the AI produces a spec, plan, or document and the human approves it, the entire document is context — not just the approval message
- Cross-conversation references: "as we discussed in the ChatGPT session" — BrainShare should link these once it has both conversations ingested

**Example extraction from this actual conversation:**

```
CONVERSATION CHUNK:
[1] Human: "columns should just be called columns"
[2] Human: "Swarm should be a bot that can be invoked from 
    the bottom right of the screen"
[3] Human: "I desperately need a dark mode option for v1"
[4] Human: "dont mention Factor at all in the spec"
[5] AI: [produces updated spec with all changes]
[6] Human: "this looks good. but for the widget, is bottom 
    right the best call? what if it's instead a chat panel 
    at the bottom of the screen..."
[7] AI: "That's a better instinct..." [explains why]
[8] Human: "oooh what if the main page content, side panel, 
    and AI panel can all be dragged and snapped..."
[9] AI: [describes the flexible panel system]
[10] Human: "1 - start with just 3 for now. 2 - per 
     workspace, yes. 3 - no..."
```

**Expected extraction:**

```json
{
  "primitives": [
    {
      "type": "DECISION",
      "content": {
        "statement": "Board columns are called 'columns', not 'work stages' or any other term",
        "rationale": "Simplicity and clarity",
        "proposed_by": "Will",
        "approved_by": ["Will"],
        "type": "explicit"
      },
      "supporting_messages": [1],
      "confidence": 0.95
    },
    {
      "type": "DECISION",
      "content": {
        "statement": "The AI surface is a full-width chat panel at the bottom of the screen, not a bottom-right widget",
        "rationale": "Matches the ChatGPT/Claude UI pattern that users already know. Coexists cleanly with the detail panel instead of competing with it.",
        "proposed_by": "Will",
        "approved_by": ["Will"],
        "type": "explicit"
      },
      "supporting_messages": [6, 7],
      "confidence": 0.95
    },
    {
      "type": "DECISION",
      "content": {
        "statement": "The main content area supports up to 3 draggable, snappable, resizable panels. Layout persists per workspace.",
        "rationale": "Maximum flexibility for different work modes. Users can arrange board, detail, and AI panels however they want.",
        "proposed_by": "Will",
        "approved_by": ["Will"],
        "type": "explicit"
      },
      "supporting_messages": [8, 9, 10],
      "confidence": 0.95
    },
    {
      "type": "DECISION",
      "content": {
        "statement": "Dark mode is required for v1 launch, not deferred",
        "rationale": "Personal requirement from founder",
        "proposed_by": "Will",
        "approved_by": ["Will"],
        "type": "explicit"
      },
      "supporting_messages": [3],
      "confidence": 0.95
    },
    {
      "type": "DECISION",
      "content": {
        "statement": "No references to Factor.ai in the WorkOS spec — the spec should read as if WorkOS was designed from first principles",
        "rationale": "WorkOS should have its own identity. Claude Code shouldn't need to know Factor exists.",
        "proposed_by": "Will",
        "approved_by": ["Will"],
        "type": "explicit"
      },
      "supporting_messages": [4],
      "confidence": 0.95
    }
  ],
  "no_extractable_context": false
}
```

Note: The AI (Claude) produced the rationale and the spec updates, but the human (Will) made all the decisions. The conviction is high across the board because Will's statements were explicit directives, not tentative exploration.

### Steps 4-7 Are Tool-Agnostic

Conviction scoring, graph validation, storage, and action work the same regardless of source tool. The primitive types are universal.

---

## 14. Error Handling

### False Positives (BrainShare extracts a decision that wasn't one)

Team corrects in chat: "That wasn't a decision, we were just brainstorming."

BrainShare response:
1. Mark the primitive as `retracted`
2. Lower confidence for similar extraction patterns from this channel/context
3. Confirm: "Got it — removed. I'll be more careful about brainstorming vs. decisions in this channel."

### False Negatives (BrainShare misses a real decision)

Team tells BrainShare explicitly: "BrainShare, we just decided to use Firebase Auth."

BrainShare response:
1. Create the primitive from the explicit instruction
2. Set conviction to maximum (explicit human instruction)
3. Confirm: "Captured. Want to add any rationale or assumptions?"

### Ambiguity (Low Confidence)

When extraction confidence < 0.5, BrainShare asks rather than assumes:

"It sounds like you might have decided to use Firebase Auth — is that right, or were you still exploring options?"

### Corrections

Any stored primitive can be corrected by the team at any time. Corrections are new Episodes that modify existing graph nodes. The correction history is preserved (Graphiti's temporal model handles this natively — the old version is superseded, not deleted).

---

## 15. Tech Stack for This Pipeline

| Component | Technology |
|-----------|-----------|
| Knowledge graph | Graphiti (Python, Apache 2.0) on Neo4j |
| LLM for extraction | Claude API (claude-sonnet-4-20250514) — fast, accurate, cost-effective for structured extraction |
| LLM for conviction assessment | Same Claude call (conviction is part of extraction output) |
| Discord bot | discord.py (Python) |
| Message queue | Redis or Supabase Realtime (for buffering incoming messages before chunking) |
| Vector search | Graphiti's built-in (backed by Neo4j vector index) |
| Storage | Neo4j (via Graphiti) for the graph; Supabase Postgres for metadata, user accounts, tool connections |
| API | FastAPI (Python) — serves the extraction pipeline as an internal service |

### Why Python

Graphiti is Python-native. The extraction pipeline involves heavy LLM interaction and graph operations, both of which have mature Python libraries. The pipeline runs as a backend service, separate from the WorkOS frontend (which is React/TypeScript).

---

## 16. What to Build First

### Minimum Viable Pipeline — AI Conversation Extraction

1. Ingest Claude/ChatGPT conversation exports (JSON or shared links)
2. Chunk by topic within long conversations
3. Extraction prompt against Claude API — with the "AI produces content, human produces conviction" principle
4. Store results in Graphiti as typed primitives
5. Surface extracted primitives in WorkOS Memory tab (manual review/confirm)
6. On next AI session, assemble relevant context from the graph and inject it — proving "your AI never forgets"

### Second Pipeline — Discord

7. Discord bot receives messages in real time
8. Time-based chunking + thread boundaries
9. Same extraction prompt (with Discord-specific nuances: emoji approval, implicit decisions)
10. Store in same Graphiti graph
11. Post confirmation back to Discord
12. Cross-source linking: connect Discord decisions to AI conversation decisions about the same topics

### Defer for Now

- Conviction scoring beyond the LLM's initial confidence (implement the full formula later)
- Graph validation / conflict detection (start with simple duplicate check)
- Write-back to external tools beyond WorkOS and Discord (start simple)
- Semantic matching across tools (Figma-to-card matching)
- Meeting transcript processing
- Monitoring for action completion
- Factor/Notion/ClickUp ingestion (comes after the core pipeline is proven)
