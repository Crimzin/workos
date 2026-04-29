# BrainShare Extraction Pipeline — Build Spec v0.1

*Everything needed to implement the core pipeline that turns raw tool data into structured context primitives.*

---

## 1\. What This Document Is

This is the build spec for BrainShare's extraction pipeline — the core system that watches connected tools (Discord, Slack, Notion, Figma, Google Docs, GitHub, etc.), detects high-signal context (decisions, assumptions, actions, open questions), and writes structured primitives to a persistent knowledge graph.

This pipeline is the foundation of BrainShare. Everything else — the conviction meter, the context assembly for LLMs, the cross-tool sync, the WorkOS auto-generation — builds on top of what this pipeline produces.

The spec uses **Discord message extraction** as the reference implementation. Section 12 explains how the same pattern generalizes to every other tool.

---

## 2\. What BrainShare Is (Context for the Builder)

BrainShare is the shared memory layer for teams of humans and AI agents. It connects to the tools a team already uses, builds a structured understanding of their work, and ensures the right context is in the right place at the right time.

**The core problem:** Teams make decisions in Slack threads that never get captured. Specs change in Figma but nobody updates the project cards. Contractors don't know what changed since last week. AI assistants (Claude, ChatGPT) start every session from zero because they have no persistent memory of the team's context.

**What BrainShare does:** It watches all connected tools, extracts structured context primitives (decisions, assumptions, actions, etc.), stores them in a temporal knowledge graph, and uses that graph to keep every tool and every AI session informed.

**BrainShare is both a product and infrastructure.** It's a standalone product teams interact with (via chat, via Slack bot, via a web UI). And it's the context engine underneath WorkOS (a work management platform) and Swarm (an operational intelligence layer).

---

## 3\. Technical Foundation: Graphiti

BrainShare's knowledge graph is built on **Graphiti** — Zep's open-source temporal knowledge graph engine (Apache 2.0 license, 20,000+ GitHub stars).

**Why Graphiti:** It handles the hard infrastructure problems that we don't want to rebuild:

- Constructs knowledge graphs from unstructured data  
- Every fact has a temporal validity window (when it became true, when it was superseded)  
- Entities evolve over time with updated summaries  
- Everything traces back to "Episodes" — the raw source data that produced it  
- Hybrid vector \+ graph retrieval  
- Built on Neo4j  
- Proven at production scale (millions of hourly requests)

**What we build on top of Graphiti:** Typed primitives (Decision, Assumption, Action, etc.) with specific semantics and behaviors. A conviction scoring system. An extraction prompt pipeline. Tool-specific ingestion adapters. Action/write-back logic.

**Installation:** `pip install graphiti-core` — see [https://github.com/getzep/graphiti](https://github.com/getzep/graphiti)

---

## 4\. The Typed Primitives

BrainShare extracts and stores these specific types. They are not generic "entities" — each type has defined fields and behaviors.

### DECISION

An explicit or implicit agreement to do something, use something, or go in a particular direction.

Decision {

  id: string (auto-generated)

  statement: string             // what was decided, one clear sentence

  rationale: string             // why — as actually discussed, not invented

  proposed\_by: Actor            // who first suggested it

  approved\_by: Actor\[\]          // who confirmed or agreed

  decision\_type: "explicit" | "implicit"

  status: "active" | "superseded" | "reversed"

  supersedes: Decision | null   // link to prior decision this replaces

  conviction: float (0.0-1.0)

  source\_episodes: Episode\[\]    // raw data that produced this

  created\_at: datetime

  updated\_at: datetime

}

### ASSUMPTION

A belief the team is operating on that could be wrong. Often embedded in reasoning ("since...", "because...", "assuming that...", "as long as...", "given that...").

Assumption {

  id: string

  statement: string             // the belief, one clear sentence

  basis: string                 // why they believe this, or "unstated"

  status: "untested" | "validated" | "invalidated"

  linked\_decisions: Decision\[\]  // which decisions depend on this

  conviction: float (0.0-1.0)

  source\_episodes: Episode\[\]

  created\_at: datetime

  updated\_at: datetime

}

### ACTION

A commitment by a specific person (or agent) to do a specific thing.

Action {

  id: string

  statement: string             // what will be done

  owner: Actor                  // who committed

  deadline: datetime | null     // if mentioned

  status: "pending" | "in\_progress" | "completed" | "dropped"

  linked\_decision: Decision | null

  conviction: float (0.0-1.0)

  source\_episodes: Episode\[\]

  created\_at: datetime

  updated\_at: datetime

}

### QUESTION

An unresolved question raised but not answered.

Question {

  id: string

  statement: string             // the question

  raised\_by: Actor

  context: string               // why it matters

  status: "open" | "resolved"

  resolution: string | null     // the answer, when resolved

  source\_episodes: Episode\[\]

  created\_at: datetime

  updated\_at: datetime

}

### CONTEXT\_UPDATE

A factual update about the state of work that doesn't fit the above categories.

ContextUpdate {

  id: string

  statement: string             // what happened or is now true

  actor: Actor                  // who provided the update

  relates\_to: string            // what topic or work item

  source\_episodes: Episode\[\]

  created\_at: datetime

}

### ACTOR

A human or AI agent on the team.

Actor {

  id: string

  name: string

  type: "human" | "agent"

  roles: string\[\]               // e.g., \["co-founder", "product"\]

  authority\_domains: string\[\]   // e.g., \["product", "strategy"\]

  authority\_weight: float       // 0.0-1.0, used in conviction scoring

  agent\_subtype: string | null  // e.g., "claude", "claude\_code", "swarm"

}

### EPISODE

The raw source data. Immutable. Every primitive traces back to its source episodes.

Episode {

  id: string

  source\_tool: string           // "discord", "slack", "notion", "figma", etc.

  source\_location: string       // channel name, page ID, file name, etc.

  timestamp\_start: datetime

  timestamp\_end: datetime

  actors: Actor\[\]               // who participated

  raw\_content: string           // the full text content

  message\_count: number | null  // for chat-based tools

}

### Relationships Between Primitives

These are the edges in the graph. Every relationship has temporal metadata (valid\_from, valid\_to) inherited from Graphiti.

Decision  \--proposed\_by--\>     Actor

Decision  \--approved\_by--\>     Actor

Decision  \--depends\_on--\>      Assumption

Decision  \--supersedes--\>      Decision

Decision  \--spawned--\>         Action

Decision  \--source--\>          Episode

Decision  \--addresses\_goal--\>  Goal (if Why Chain exists)

Assumption \--linked\_to--\>      Decision

Assumption \--source--\>         Episode

Action    \--owned\_by--\>        Actor

Action    \--serves--\>          Decision

Action    \--source--\>          Episode

Question  \--raised\_by--\>       Actor

Question  \--source--\>          Episode

---

## 5\. The Pipeline (7 Steps)

Raw Data (e.g., Discord messages)

    |

    v

\[Step 1\] EPISODE CREATION — store raw data as immutable Episodes

    |

    v

\[Step 2\] CHUNKING — group messages into coherent conversation chunks

    |

    v

\[Step 3\] EXTRACTION — LLM extracts typed primitives from each chunk

    |

    v

\[Step 4\] CONVICTION SCORING — score each primitive for confidence

    |

    v

\[Step 5\] GRAPH VALIDATION — check against existing graph for conflicts/duplicates

    |

    v

\[Step 6\] STORAGE — write validated primitives to Graphiti

    |

    v

\[Step 7\] ACTION — notify team, write to external tools, update cards

---

## 6\. Step 1: Episode Creation

Every piece of raw data becomes an Episode — the immutable ground truth.

For Discord, an episode is a batch of messages from a single channel within a time window. BrainShare connects to Discord via bot (using discord.py or discord.js) and receives messages in real time.

\# Pseudocode

def create\_episode(messages: list\[DiscordMessage\]) \-\> Episode:

    return Episode(

        id=generate\_id(),

        source\_tool="discord",

        source\_location=messages\[0\].channel\_name,

        timestamp\_start=messages\[0\].timestamp,

        timestamp\_end=messages\[-1\].timestamp,

        actors=extract\_unique\_actors(messages),

        raw\_content=format\_messages(messages),

        message\_count=len(messages)

    )

---

## 7\. Step 2: Chunking

Before extraction, group messages into conversation chunks — coherent threads that belong together.

**Chunking heuristics for Discord/Slack:**

- Messages within 5 minutes of each other in the same channel \= same chunk  
- A gap of \>15 minutes starts a new chunk  
- A topic shift (detected by lightweight semantic similarity between messages) starts a new chunk  
- A Discord thread is always its own chunk  
- Maximum chunk size: 50 messages (break larger conversations into multiple chunks)

\# Pseudocode

def chunk\_messages(messages: list\[DiscordMessage\]) \-\> list\[Chunk\]:

    chunks \= \[\]

    current\_chunk \= \[messages\[0\]\]

    

    for msg in messages\[1:\]:

        time\_gap \= msg.timestamp \- current\_chunk\[-1\].timestamp

        

        if time\_gap \> timedelta(minutes=15):

            chunks.append(current\_chunk)

            current\_chunk \= \[msg\]

        elif len(current\_chunk) \>= 50:

            chunks.append(current\_chunk)

            current\_chunk \= \[msg\]

        else:

            current\_chunk.append(msg)

    

    chunks.append(current\_chunk)

    return chunks

---

## 8\. Step 3: Extraction — The Core Prompt

An LLM reads each conversation chunk and extracts typed primitives.

### System Prompt

You are BrainShare's extraction engine. Your job is to read a

conversation between team members and extract structured context

primitives.

You extract the following types:

DECISION — an explicit or implicit agreement to do something, 

use something, or go in a particular direction. A decision has:

\- statement: what was decided (one clear sentence)

\- rationale: why (may be explicit or inferred from discussion)

\- proposed\_by: who first suggested it

\- approved\_by: who confirmed or agreed (may be multiple people)

\- type: "explicit" (someone said "let's do X") or "implicit" 

  (the group converged without a formal statement)

ASSUMPTION — a belief the team is operating on that could be 

wrong. Often embedded in reasoning. An assumption has:

\- statement: the belief (one clear sentence)

\- basis: why they believe this (evidence cited, or "unstated")

\- status: "untested" (default for new assumptions)

\- linked\_decision: which decision this assumption supports

ACTION — a commitment by a specific person to do a specific 

thing. An action has:

\- statement: what will be done

\- owner: who committed to doing it

\- deadline: if mentioned (otherwise null)

\- linked\_decision: which decision this action serves

QUESTION — an unresolved question that was raised but not 

answered. A question has:

\- statement: the question

\- raised\_by: who asked

\- context: why it matters

\- status: "open"

CONTEXT\_UPDATE — a factual update about the state of work 

that doesn't fit the above categories but is worth recording.

Has:

\- statement: what happened or what is now true

\- actor: who provided the update

\- relates\_to: what work item or topic this is about

RULES:

1\. Only extract what is ACTUALLY in the conversation. Do not 

   invent or infer things that weren't discussed.

2\. For IMPLICIT decisions, you must be able to point to 

   specific messages that demonstrate convergence. If it's 

   ambiguous, extract it as a QUESTION instead.

3\. Every extraction must reference the specific messages that 

   support it (by message index).

4\. If a conversation is purely social or off-topic, return 

   an empty extraction. Not everything is work context.

5\. Prefer fewer, higher-quality extractions over many low-

   confidence ones.

6\. Rationale for decisions should capture the ACTUAL reasons 

   discussed, not generic justifications.

7\. Assumptions are often hidden in phrases like "since," 

   "because," "assuming that," "as long as," "given that."

8\. An emoji reaction (thumbs up, etc.) from a person with 

   decision authority counts as approval.

### User Prompt Template

TEAM CONTEXT:

{foundation\_context}

This is background information about the team. Use it to understand

who has authority over what, what the team is working on, and what

the current priorities are. This helps you correctly identify who

is proposing vs. approving decisions, and which topics are relevant.

ACTORS IN THIS CONVERSATION:

{actor\_list\_with\_roles\_and\_authority}

CONVERSATION:

{chunked\_messages\_with\_numbered\_indices}

\---

Extract all context primitives from this conversation. For each

primitive, cite the specific message indices that support it.

Return ONLY valid JSON, no preamble, no markdown backticks:

{

  "primitives": \[

    {

      "type": "DECISION" | "ASSUMPTION" | "ACTION" | "QUESTION" | "CONTEXT\_UPDATE",

      "content": { ... type-specific fields as described above ... },

      "supporting\_messages": \[1, 3, 5\],

      "confidence": 0.0 to 1.0

    }

  \],

  "no\_extractable\_context": true | false

}

### Foundation Context

The `{foundation_context}` variable is populated from BrainShare's Foundation memory layer — the slow-changing facts about the team. This is assembled once during onboarding and updated rarely. Example:

Burn is a social fitness game for iOS, targeting public launch in 

summer 2026\. The team has been building for 5 years with two major 

redesigns.

Team:

\- Will: Co-founder. Product authority. Based in NYC.

\- Chris: Co-founder. Authority over business, QA, and approvals. 

  Based in Hong Kong.

\- Marek: Co-founder. Design authority. Based in Hong Kong. 

  Sometimes unavailable for late meetings due to timezone.

\- Ziga: iOS engineer (freelancer). Sole engineer on the project. 

  Based in Slovenia.

How they work: Weekly sprint planning on Wednesdays via Discord. 

Async the rest of the week. Tools: Discord (communication), 

Factor/WorkOS (project management), Figma (design), GitHub (code).

Current focus: Building gamified onboarding experience, SSO, and 

gamer tags for public launch. Transitioning from PWA to native iOS.

### Worked Example

**Input conversation (from a Discord \#development channel):**

ACTORS IN THIS CONVERSATION:

\- Ziga (iOS Engineer, technical authority on implementation)

\- Will (Co-founder, product authority)

\- Marek (Designer, co-founder, design authority)

\- Chris (Co-founder, business authority)

CONVERSATION:

\[1\] Ziga: hey, I looked into the SSO options. Firebase Auth 

    supports Google and Apple sign-in out of the box. I think 

    we should just use that instead of building our own auth flow

\[2\] Will: makes sense. what about email/password?

\[3\] Ziga: Firebase handles that too. and it's free up to 50k 

    monthly active users which is way more than we need for launch

\[4\] Will: ok let's go with Firebase Auth then. @marek can you 

    update the sign-in screen designs to show Google and Apple 

    buttons?

\[5\] Marek: sure, will do tomorrow

\[6\] Chris: 👍

**Expected LLM output:**

{

  "primitives": \[

    {

      "type": "DECISION",

      "content": {

        "statement": "Use Firebase Auth for authentication, including Google Sign-In, Apple Sign-In, and email/password",

        "rationale": "Firebase Auth supports Google and Apple sign-in out of the box, handles email/password, and is free up to 50k MAU which exceeds launch needs. Avoids building custom auth.",

        "proposed\_by": "Ziga",

        "approved\_by": \["Will", "Chris"\],

        "type": "explicit"

      },

      "supporting\_messages": \[1, 2, 3, 4, 6\],

      "confidence": 0.95

    },

    {

      "type": "ASSUMPTION",

      "content": {

        "statement": "50,000 monthly active users is sufficient capacity for the public launch",

        "basis": "Ziga stated this is 'way more than we need for launch' and nobody challenged it",

        "status": "untested",

        "linked\_decision": "Use Firebase Auth for authentication"

      },

      "supporting\_messages": \[3\],

      "confidence": 0.8

    },

    {

      "type": "ASSUMPTION",

      "content": {

        "statement": "Building custom auth would be significantly more work than using Firebase Auth",

        "basis": "Implied by Ziga's framing of 'instead of building our own auth flow' — the team did not discuss the effort difference explicitly",

        "status": "untested",

        "linked\_decision": "Use Firebase Auth for authentication"

      },

      "supporting\_messages": \[1\],

      "confidence": 0.7

    },

    {

      "type": "ACTION",

      "content": {

        "statement": "Update sign-in screen designs to show Google and Apple sign-in buttons",

        "owner": "Marek",

        "deadline": "Tomorrow",

        "linked\_decision": "Use Firebase Auth for authentication"

      },

      "supporting\_messages": \[4, 5\],

      "confidence": 0.95

    }

  \],

  "no\_extractable\_context": false

}

### Why This Extraction Is Correct

- **The Decision** captures the full scope (Google, Apple, AND email/password — because messages \[2\] and \[3\] expanded the scope beyond Ziga's initial proposal). The rationale is what was actually discussed, not a generic justification.  
- **Assumption 1** (50k MAU) catches the implicit assumption hiding in message \[3\]. It's marked "untested" because nobody verified launch MAU projections.  
- **Assumption 2** (custom auth harder) catches the deeper assumption in Ziga's framing in message \[1\]. Lower confidence (0.7) because it's implied, not stated.  
- **The Action** captures Marek's specific commitment with a deadline. High confidence because it's an explicit, unambiguous commitment.  
- **Chris's 👍** is correctly interpreted as approval (he's a co-founder with authority), not as a separate action.  
- **Will's question about email/password** \[2\] is NOT extracted as a separate QUESTION because it was immediately answered \[3\] and resolved.

---

## 9\. Step 4: Conviction Scoring

The LLM provides an initial confidence score (0.0-1.0). BrainShare adjusts this into a final conviction score:

def calculate\_conviction(primitive, llm\_confidence, actors, existing\_graph):

    \# Start with LLM's confidence

    conviction \= llm\_confidence

    

    \# Authority weight: decisions approved by founders/leads \= higher

    if primitive.type \== "DECISION":

        max\_authority \= max(

            get\_actor(a).authority\_weight 

            for a in primitive.content.approved\_by

        )

        conviction \*= (0.7 \+ 0.3 \* max\_authority)  \# range: 0.7x to 1.0x

    

    \# Explicitness weight

    if primitive.type \== "DECISION":

        if primitive.content.decision\_type \== "explicit":

            conviction \*= 1.0

        else:  \# implicit

            conviction \*= 0.75

    

    \# Hard-to-vary bonus (Deutsch test):

    \# If rationale contains specific, testable, interconnected reasons

    \# (not just "it seems good"), add a small bonus

    if primitive.type \== "DECISION" and primitive.content.rationale:

        specificity \= assess\_rationale\_specificity(primitive.content.rationale)

        conviction \+= specificity \* 0.1  \# up to \+0.1 bonus

    

    \# Clamp to \[0.0, 1.0\]

    return min(max(conviction, 0.0), 1.0)

### Authority Weight Examples

| Actor Role | authority\_weight | Rationale |
| :---- | :---- | :---- |
| Founder / CEO | 1.0 | Ultimate decision authority |
| Co-founder with domain authority | 0.95 | Very high, but might defer in some areas |
| Lead engineer (employee) | 0.85 | High technical authority |
| Freelance engineer | 0.75 | Trusted contributor, but not final authority |
| Contractor (new) | 0.5 | Limited trust, limited context |
| AI agent (Claude, etc.) | 0.6 | Proposes well, but humans approve |

These weights are set per Actor during onboarding and can be adjusted.

### Conviction Thresholds — What BrainShare Does

conviction \>= 0.8  →  ASSERT

  Store as fact. Act on it (create cards, notify team, update tools).

  In conversation: "The spec says Y." No hedging.

conviction 0.5-0.8 →  FLAG

  Store, but seek confirmation from the team.

  In conversation: "It sounds like you decided X — is that right?"

conviction \< 0.5   →  ASK

  Don't store yet. Surface as a question.

  In conversation: "Were you exploring X, or did you decide on it?"

---

## 10\. Step 5: Graph Validation

Before storing, check extracted primitives against the existing Graphiti graph:

### Duplicate Detection

Semantic similarity check against existing primitives of the same type. Use Graphiti's built-in vector search to find similar Decision/Assumption/Action nodes.

If a near-duplicate is found:

- Same meaning, same actors → skip (already captured)  
- Same topic but updated/modified → create a new version, link to the old one  
- Same topic but different conclusion → flag as a potential conflict

### Conflict Detection

Does this new primitive contradict an existing active primitive?

def check\_conflicts(new\_primitive, graph):

    if new\_primitive.type \== "DECISION":

        \# Find existing active decisions on similar topics

        similar \= graph.search\_similar(

            type="Decision",

            status="active",

            query=new\_primitive.content.statement,

            threshold=0.75

        )

        for existing in similar:

            if is\_contradictory(new\_primitive, existing):

                \# Mark old decision as superseded

                existing.status \= "superseded"

                new\_primitive.supersedes \= existing.id

                return ConflictResult(

                    type="supersession",

                    old=existing,

                    new=new\_primitive

                )

    return None

### Goal Linkage

Can BrainShare connect this primitive to an existing goal in the Why Chain? This is a semantic search against existing Goal nodes. If a match is found, create a relationship. If not, the primitive is an "orphan" — still stored, but flagged for future linkage.

---

## 11\. Step 6: Storage

Write validated primitives to Graphiti.

async def store\_primitive(primitive, graph, episode):

    \# Create the entity in Graphiti

    entity \= await graph.add\_entity(

        name=primitive.content.statement,

        entity\_type=primitive.type,

        properties={

            \*\*primitive.content.\_\_dict\_\_,

            "conviction": primitive.conviction,

            "status": get\_initial\_status(primitive),

        }

    )

    

    \# Create relationships

    if primitive.type \== "DECISION":

        for actor\_name in primitive.content.approved\_by:

            actor \= await graph.get\_entity(name=actor\_name, type="Actor")

            await graph.add\_relationship(entity, "approved\_by", actor)

        

        proposer \= await graph.get\_entity(

            name=primitive.content.proposed\_by, type="Actor"

        )

        await graph.add\_relationship(entity, "proposed\_by", proposer)

        

        if primitive.supersedes:

            old \= await graph.get\_entity(id=primitive.supersedes)

            await graph.add\_relationship(entity, "supersedes", old)

    

    if primitive.type \== "ASSUMPTION":

        for decision\_ref in primitive.content.linked\_decisions:

            decision \= await graph.get\_entity(

                name=decision\_ref, type="Decision"

            )

            await graph.add\_relationship(decision, "depends\_on", entity)

    

    if primitive.type \== "ACTION":

        owner \= await graph.get\_entity(

            name=primitive.content.owner, type="Actor"

        )

        await graph.add\_relationship(entity, "owned\_by", owner)

        

        if primitive.content.linked\_decision:

            decision \= await graph.get\_entity(

                name=primitive.content.linked\_decision, type="Decision"

            )

            await graph.add\_relationship(entity, "serves", decision)

    

    \# Link to source episode

    await graph.add\_relationship(entity, "source", episode)

    

    return entity

---

## 12\. Step 7: Action

After storing, BrainShare acts on what it extracted.

### Notification in Source Tool

Post a confirmation in the same channel/thread where the conversation happened:

🧠 BrainShare: Captured —

  📌 Decision: Use Firebase Auth (Google, Apple, email/password)

     Proposed by Ziga, approved by Will and Chris

  ⚠️ Assumption tracked: 50k MAU sufficient for launch (untested)

  📋 Action: @Marek — update sign-in designs by tomorrow

  

  Anything wrong? Just tell me.

Short, factual. Gives the team a chance to correct immediately.

### Write to WorkOS

- If a relevant card exists → update its post stream with the decision, link assumptions, add the action as a sub-task  
- If no relevant card exists → create one, populated with the decision as context  
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

## 13\. Generalizing to Other Tools

The 7-step pipeline applies to every tool. Only Steps 1-3 change per tool:

### Discord / Slack

- **Episode:** Batch of messages per channel per time window  
- **Chunking:** Time gaps (\>15min \= new chunk) \+ topic shifts \+ thread boundaries  
- **Extraction nuances:** Decisions often implicit. Emoji reactions \= approval. Need to handle threads vs. main channel.

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
- **Extraction nuances:** Technical decisions are often in PR descriptions and code review comments. Merge \= implicit approval. Need to detect architectural decisions vs. implementation details.

### Meeting Transcripts (Fathom, Granola, etc.)

- **Episode:** Full transcript of a meeting  
- **Chunking:** By speaker turns \+ topic boundaries. Meetings are DENSE with decisions — need to separate discussion from conclusions.  
- **Extraction nuances:** A lot of brainstorming will happen before a decision. The prompt needs to distinguish "we discussed X" from "we decided X." Look for closing language: "ok so we'll...", "let's go with...", "the plan is..."

### Claude / ChatGPT Conversations

- **Episode:** A conversation thread  
- **Chunking:** Per-conversation or per-topic within a conversation  
- **Extraction nuances:** Need to identify what the HUMAN chose vs. what the AI suggested. An AI suggestion is not a decision. A human saying "yes, let's do that" in response to AI's suggestion IS a decision.

### Steps 4-7 Are Tool-Agnostic

Conviction scoring, graph validation, storage, and action work the same regardless of source tool. The primitive types are universal.

---

## 14\. Error Handling

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

When extraction confidence \< 0.5, BrainShare asks rather than assumes:

"It sounds like you might have decided to use Firebase Auth — is that right, or were you still exploring options?"

### Corrections

Any stored primitive can be corrected by the team at any time. Corrections are new Episodes that modify existing graph nodes. The correction history is preserved (Graphiti's temporal model handles this natively — the old version is superseded, not deleted).

---

## 15\. Tech Stack for This Pipeline

| Component | Technology |
| :---- | :---- |
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

## 16\. What to Build First

### Minimum Viable Pipeline

1. Discord bot that receives messages in real time  
2. Chunking logic (time-based, simple)  
3. Extraction prompt against Claude API  
4. Store results in Graphiti  
5. Post confirmation back to Discord  
6. Simple web UI to browse extracted primitives (or use WorkOS)

### Defer for Now

- Conviction scoring beyond the LLM's initial confidence (implement the full formula later)  
- Graph validation / conflict detection (start with simple duplicate check)  
- Write-back to external tools beyond Discord (start with WorkOS only)  
- Semantic matching across tools (Figma-to-card matching)  
- Meeting transcript processing  
- Monitoring for action completion

