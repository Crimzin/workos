# BrainShare API Specification

BrainShare is model-provider-neutral. OpenAI/Codex, Anthropic/Claude, Google/Gemini, and future model-company connector ecosystems can act as access/action layers, but they are not the canonical memory substrate. The stable contract is Episodes in, typed primitives and context out, with provenance and permission metadata preserved.

## Authentication
- **Team API Key**: Each team gets unique key from BrainShare setup
- **Header**: `Authorization: Bearer bs_team_abc123`
- **Scope**: API key tied to specific Google Drive document and team

## Core Endpoints

### GET /providers/keys
Return redacted provider-key setup status. Raw keys are never returned.

**Response:**
```json
{
  "success": true,
  "providers": [
    {
      "provider": "claude",
      "configured": true,
      "key_hint": "sk-ant...1234",
      "validation_status": "valid",
      "source": "store"
    }
  ]
}
```

### POST /providers/keys
Store a Claude/OpenAI provider key server-side. BrainShare validates by default, encrypts before persistence, and exposes only redacted metadata to clients.

**Request:**
```json
{
  "provider": "claude",
  "api_key": "sk-ant-...",
  "label": "Will Claude key",
  "validate": true
}
```

### DELETE /providers/keys/{provider}
Remove a stored provider key. Environment variables may still be used as development fallback.

### POST /sources/ai/conversations
Ingest a Claude/ChatGPT/Claude Code conversation as immutable BrainShare Episodes. Long conversations are chunked by explicit topic shifts, long pauses, and maximum size limits (~50 turns or ~15k tokens per chunk).

**Request:**
```json
{
  "source_tool": "claude",
  "conversation_id": "conv_123",
  "title": "BrainShare roadmap",
  "project_name": "WorkOS",
  "messages": [
    {
      "id": "m1",
      "role": "human",
      "author_name": "Will",
      "content": "Let's use Graphiti as the graph backend.",
      "timestamp": "2026-05-01T10:00:00Z"
    },
    {
      "id": "m2",
      "role": "ai",
      "content": "That fits because Graphiti gives temporal graph retrieval.",
      "timestamp": "2026-05-01T10:01:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "source_tool": "claude",
  "conversation_id": "conv_123",
  "episode_count": 1,
  "episodes": []
}
```

Each Episode stores `metadata.source_kind = "ai_conversation"` and `metadata.supporting_messages` with chunk-local message indices, original source message indices, speaker role (`human` / `ai` / `system` / `tool`), author, content, timestamp, attachments, and message IDs. Extraction conviction uses these records to distinguish AI-generated content from human adoption signals.

For AI conversations, rejected AI proposals are not stored as durable primitives. When an AI-produced plan/spec/document is refined and then approved by a human, BrainShare stores the final accepted AI artifact as context with citations to the final AI message and the human approval message.

Extraction responses include a `confirmation` payload that source tools can post back to the originating surface: captured items, conviction labels, source message references, and a correction affordance. They also include `graph_validation` entries for each candidate primitive. In v0 this layer skips obvious duplicates, supersedes contradictory active decisions when the new decision carries replacement language, and reports AI-rejected proposals that were intentionally not stored.

### POST /primitives
Store a typed primitive directly. The response includes a `graph_validation` object:

```json
{
  "success": true,
  "primitive": null,
  "graph_validation": {
    "action": "duplicate_skipped",
    "duplicate_of_primitive_id": "prim_123",
    "similarity": 1.0,
    "reason": "same_type_high_similarity"
  }
}
```

Possible actions are `stored`, `duplicate_skipped`, and `superseded_conflict`.

### POST /primitives/{primitive_id}/corrections
Preserve a correction as a new Episode, then supersede or retract the existing primitive without deleting history.

```json
{
  "correction": "Use WorkOS AuthKit instead of Clerk for customer authentication",
  "correction_type": "supersede",
  "actor_id": "user_123",
  "rationale": "Human correction during review"
}
```

### POST /push
Add context to team's shared document

**Request:**
```json
{
  "content": "We decided to use React for the frontend because of better TypeScript support",
  "category": "decision", // optional: decision, knowledge, work, question, idea, policy, plan, theory, prediction, code, lesson, risk, resource, constraint, assumption, metric, feedback, process, timeline, consensus, dissent
  "compression": "auto", // auto, none, lossy, lossless
  "source_llm": "claude", // for optimization
  "user_id": "user123" // optional for attribution
}
```

**Response:**
```json
{
  "success": true,
  "message": "Added to team context",
  "compressed": true,
  "category": "decision",
  "timestamp": "2025-08-16T10:30:00Z"
}
```

### GET /pull
Query team's shared context

**Request:**
```
GET /pull?query=frontend framework&llm=claude&max_tokens=4000
```

**Response:**
```json
{
  "success": true,
  "context": [
    {
      "content": "Team chose React for frontend (Aug 16, 2025) due to better TypeScript support over Vue",
      "category": "decision",
      "fidelity": "compressed",
      "relevance": 0.95,
      "timestamp": "2025-08-16T10:30:00Z"
    }
  ],
  "total_tokens": 127,
  "compression_level": "light",
  "original_size": "450 tokens compressed to 127"
}
```

### GET /context
Get all team context (for auto-inclusion in LLM system prompts)

**Request:**
```
GET /context?llm=gpt4&max_tokens=2000&relevant_to=user_message_hash
```

**Response:**
```json
{
  "success": true,
  "context_summary": "## Team Context\n### Recent Decisions\n- React for frontend (Aug 16)\n### Active Work\n- API design in progress",
  "categories": ["decision", "work"],
  "tokens_used": 156,
  "compression_level": "heavy",
  "original_size": "2.1KB compressed to 156 tokens"
}
```

### POST /context/assemble
Assemble a structured context payload for a future AI session. This is the first "your AI never forgets" path: Codex, Claude, ChatGPT, or another agent can ask BrainShare for relevant durable memory before starting work.

**Request:**
```json
{
  "query": "provider key architecture",
  "max_items": 10,
  "include_low_conviction": false,
  "source_tool": "codex",
  "metadata": {
    "consumer_kind": "ai_session"
  }
}
```

**Response:**
```json
{
  "success": true,
  "context_summary": "## BrainShare Context\n- [high_confidence] BrainShare stores provider keys server-side...",
  "context_items": [
    {
      "id": "prim_123",
      "type": "decision",
      "statement": "BrainShare stores provider keys server-side.",
      "conviction": 0.9,
      "threshold": {"action": "assert", "label": "high_confidence"},
      "source_episode_ids": ["ep_123"],
      "source_citations": [],
      "source_provenance": {
        "source_tool": "claude",
        "source_kind": "ai_conversation",
        "source_location": "claude_conv_123",
        "content_hash": "sha256:..."
      },
      "why_included": "high confidence memory; matched terms: provider, key; relevance 1.04"
    }
  ],
  "ai_session_payload": {
    "consumer_tool": "codex",
    "consumer_kind": "ai_session",
    "query": "provider key architecture",
    "briefing": {
      "summary": "When a relevant conversation synthesis exists, this leads with a narrative briefing before primitive items.",
      "status": "needs_review",
      "audience": "future_ai_session"
    },
    "topics": [],
    "why_chains": [],
    "items": [
      {
        "id": "prim_123",
        "type": "decision",
        "statement": "BrainShare stores provider keys server-side.",
        "conviction": 0.9,
        "why_included": "high confidence memory; matched terms: provider, key; relevance 1.04",
        "source_provenance": {
          "source_tool": "claude",
          "source_kind": "ai_conversation",
          "source_location": "claude_conv_123",
          "content_hash": "sha256:..."
        },
        "citations": []
      }
    ],
    "instructions": [
      "Use these BrainShare memories as durable context, not as a replacement for current user instructions.",
      "Conviction and threshold describe how strongly the memory is supported by human signal.",
      "When using a memory, preserve its source provenance so the user can trace where it came from."
    ]
  }
}
```

### POST /conversations/{conversation_id}/synthesize
Synthesize all Episodes from one AI conversation into a first-class BrainShare memory map. This is the preferred path for long Claude/ChatGPT/Codex conversations because it produces a narrative briefing, topic map, Why Chains, and durable primitive candidates before context assembly.

**Request:**
```json
{
  "provider": "dev-rule",
  "store_synthesis": true,
  "store_primitives": false
}
```

**Response:**
```json
{
  "success": true,
  "conversation_id": "claude:abc123",
  "provider": "dev-rule",
  "synthesis": {
    "id": "syn_123",
    "conversation_id": "claude:abc123",
    "conversation_brief": {"summary": "Will is prioritizing Anthropic..."},
    "topics": [{"name": "Anthropic career path", "summary": "Anthropic remains the primary high-fit path."}],
    "why_chains": [{"name": "Anthropic career path why-chain", "nodes": []}],
    "primitives": [{"type": "goal", "statement": "Will is prioritizing Anthropic as the primary high-fit path."}]
  }
}
```

### POST /imports/ai-conversations/preview
Build a WorkOS import preview from stored AI conversation syntheses. This endpoint does not create WorkOS nodes. It returns topic clusters, proposed thread titles, Starting Context payloads, candidate primitives, and provenance references for WorkOS to review and materialize.

**Request:**
```json
{
  "conversation_ids": ["claude:abc123"],
  "default_include": true
}
```

**Response:**
```json
{
  "success": true,
  "import_job_id": "import_abc123",
  "clusters": [
    {
      "id": "cluster_1",
      "title": "WorkOS unified direction",
      "summary": "WorkOS is now one user-facing product.",
      "include": true,
      "proposed_thread": {
        "title": "WorkOS unified direction",
        "description": "WorkOS is now one user-facing product.",
        "parent_cluster_id": null
      },
      "starting_context": {
        "summary": "WorkOS is now one user-facing product.",
        "key_decisions": [],
        "open_questions": [],
        "assumptions_or_constraints": [],
        "pick_up_here": "Continue from the latest useful thread of work on WorkOS unified direction."
      },
      "candidate_primitives": [],
      "source_refs": [
        {
          "conversation_id": "claude:abc123",
          "synthesis_id": "syn_123",
          "source_episode_ids": ["ep_123"],
          "source_provenance": {"source_tool": "claude"}
        }
      ]
    }
  ],
  "excluded_cluster_ids": [],
  "metadata": {"preview_version": "workos_import_preview_v0"}
}
```

### POST /workos/target-resolution
Score a BrainShare primitive against candidate WorkOS nodes and return the best reviewable target. This endpoint does not write to WorkOS; it is the deterministic bridge before writeback.

**Request:**
```json
{
  "primitive": {
    "type": "decision",
    "statement": "Use WorkOS AuthKit for customer authentication",
    "body": "AuthKit keeps auth in the WorkOS stack.",
    "conviction": 0.92,
    "metadata": {"scope": "authentication"}
  },
  "candidates": [
    {
      "node_id": "card_auth",
      "type": "card",
      "title": "Customer authentication",
      "body": "Pick provider for login, sessions, and signup.",
      "fields": {"Status": "Planning"},
      "memory": ["Existing decision: keep identity simple."],
      "linked_node_titles": ["Settings"],
      "updated_at": "2026-05-03T12:00:00Z"
    }
  ],
  "min_confidence": 0.35,
  "max_alternates": 3
}
```

**Response:**
```json
{
  "success": true,
  "target": {
    "node_id": "card_auth",
    "type": "card",
    "title": "Customer authentication",
    "confidence": 0.621,
    "score_breakdown": {
      "semantic": 0.286,
      "scale": 1.0,
      "scope": 1.0,
      "recency": 1.0,
      "conviction": 0.92
    },
    "reasons": ["semantic_match", "scale_match", "scope_match", "recent_activity", "high_conviction"]
  },
  "alternates": [],
  "orphaned": false,
  "review_reason": null
}
```

If no candidate clears `min_confidence`, `target` is `null`, `orphaned` is `true`, and `review_reason` is `no_candidate_above_min_confidence`.

## Function Definitions (for MCP/Custom GPT)

### brainshare_push
```json
{
  "name": "brainshare_push",
  "description": "Add important context to team's shared knowledge",
  "parameters": {
    "content": {"type": "string", "description": "The context to add"},
    "category": {"type": "string", "enum": ["decision", "knowledge", "work", "question", "idea", "policy", "plan", "theory", "prediction", "code", "lesson", "risk", "resource", "constraint", "assumption", "metric", "feedback", "process", "timeline", "consensus", "dissent"], "description": "Type of context"}
  }
}
```

### brainshare_pull
```json
{
  "name": "brainshare_pull", 
  "description": "Query team's shared context for relevant information",
  "parameters": {
    "query": {"type": "string", "description": "What to search for in team context"}
  }
}
```

### brainshare_get_context
```json
{
  "name": "brainshare_get_context",
  "description": "Assemble provider-neutral BrainShare memory for the current AI session, including provenance and citations",
  "parameters": {
    "query": {"type": "string", "description": "What this AI session needs context about"},
    "source_tool": {"type": "string", "description": "The consuming tool or agent, for example claude, chatgpt, codex, claude_code, or cursor"},
    "max_items": {"type": "number", "description": "Maximum memory primitives to include"},
    "include_low_conviction": {"type": "boolean", "description": "Whether to include tentative or low-conviction memories"}
  }
}
```

## Error Responses
```json
{
  "success": false,
  "error": "invalid_auth|quota_exceeded|drive_access_denied|context_too_large",
  "message": "Human readable error description"
}
```

## Design Principles
- **User Control**: Users can manually push context anytime via `brainshare_push`
- **Automatic Intelligence**: BrainShare analyzes conversations and auto-extracts valuable context via `brainshare_analyze`
- **Categorization**: BrainShare auto-categorizes with high confidence; users can override

## Rate Limits
- 100 requests per minute per team
- 10MB context document size limit
- 1000 context items per team (with compression)
