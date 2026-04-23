# BrainShare API Specification

## Authentication
- **Team API Key**: Each team gets unique key from BrainShare setup
- **Header**: `Authorization: Bearer bs_team_abc123`
- **Scope**: API key tied to specific Google Drive document and team

## Core Endpoints

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