# BrainShare MVP Build & Test Plan

## Phase 1: Test Local API with File Storage (30 minutes)

### Step 1.1: Start the API
1. **Open Terminal** (Cmd+Space, type "Terminal")
2. **Run these commands** (copy/paste one by one):
   ```bash
   cd /Users/williamcorbett/Desktop/Claude-Projects/WorkOS/apps/brainshare
   uv run python app/app.py
   ```
3. **Look for**: `Uvicorn running on http://0.0.0.0:3100`
4. **Test health**: Open browser to `http://localhost:3100/health`
   - Should show: `{"status": "healthy", "version": "0.2.0", ...}`

### Step 1.2: Test API Functions
**Open a second Terminal window** and run these tests:

**Test 1 - Add context:**
```bash
curl -X POST http://localhost:3100/push \
  -H "Authorization: Bearer bs_team_abc123" \
  -H "Content-Type: application/json" \
  -d '{"content": "We decided to use React for frontend", "category": "decision"}'
```

**Test 2 - Query context:**
```bash
curl "http://localhost:3100/pull?query=React" \
  -H "Authorization: Bearer bs_team_abc123"
```

**Expected**: You should see success responses, and a `brainshare-dev-store.json` file created in the app directory unless `BRAINSHARE_STORE_FILE` points elsewhere.

**Test 3 - Ingest Discord messages as Episodes:**
```bash
curl -X POST http://localhost:3100/sources/discord/messages \
  -H "Authorization: Bearer bs_team_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "guild_id": "burn-dev",
    "guild_name": "Burn",
    "messages": [
      {
        "id": "m1",
        "channel_id": "c1",
        "channel_name": "development",
        "author_id": "will",
        "author_name": "Will",
        "content": "I think we should use Firebase Auth",
        "timestamp": "2026-04-29T10:00:00Z"
      }
    ]
  }'
```

**Test 4 - Extract primitives from an Episode:**
Use the `id` returned by Test 3 as `EPISODE_ID`.

```bash
curl -X POST http://localhost:3100/episodes/EPISODE_ID/extract \
  -H "Authorization: Bearer bs_team_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dev-rule",
    "store_primitives": true,
    "actor_context": {
      "chris": {
        "name": "Chris",
        "authority": "founder approval",
        "authority_weight": 0.9
      }
    }
  }'
```

**Expected**: The response includes the strict extraction prompt, extracted primitives, and stored BrainShare primitives. Stored primitives include `source_episode_ids`, `supporting_messages`, and `metadata.source_citations` so each item can be traced back to specific Discord message IDs. Decision primitives also include `metadata.conviction_factors`; authority-weighted approval reactions can raise conviction and appear in `approved_by`.

**Test 5 - Inspect the extraction prompt contract:**
```bash
curl http://localhost:3100/extraction/prompt \
  -H "Authorization: Bearer bs_team_abc123"
```

**Expected**: The response includes the BrainShare system prompt and strict JSON response schema. The `dev-rule` extractor is only a local stand-in; production extraction still needs the Claude API implementation.

### Step 1.3: Graphiti Backend
Graphiti is the default backend. It requires Python 3.10+, Neo4j, and a quota-enabled `OPENAI_API_KEY`. Use `uv` so BrainShare runs on a project-local Python 3.10+ runtime instead of macOS system Python.

To run the graph-backed path:
```bash
cd /Users/williamcorbett/Desktop/Claude-Projects/WorkOS/apps/brainshare
source "../../API keys"
docker compose up -d neo4j
NEO4J_URI=bolt://localhost:7687 \
NEO4J_USER=neo4j \
NEO4J_PASSWORD=brainshare-dev \
uv run python app/app.py
```

The API will still expose the same endpoints. In graph mode, writes also flow through Graphiti's `add_episode` API.

For file-only local development, set `BRAINSHARE_STORE_BACKEND=json` before starting the API.

## Phase 2: Add Claude Code Integration (20 minutes)

### Step 2.1: Configure Claude Code
1. **Open Claude Code settings**: Cmd+, (comma)
2. **Find "MCP Servers"** section
3. **Copy the entire contents** of `/Users/williamcorbett/Desktop/Claude-Projects/WorkOS/apps/brainshare/mcp/claude-config-example.json`
4. **Add to your MCP settings**
5. **Save and restart Claude Code**

### Step 2.2: Test in Claude Code
Start a **new Claude Code session** and try:
- "Use brainshare_push to add 'We're using Python for the backend' as a decision"
- "Use brainshare_pull to search for React"

**Expected**: Should see responses about context being added/found

## Phase 3: Real Usage Test (1 week)

### Step 3.1: Use for Actual Work
- Keep the API running while working on projects
- Add real decisions and insights to BrainShare
- Query for past context when needed
- Watch the `brainshare-dev-store.json` file grow

### Step 3.2: Add a Teammate
**If you have a teammate with ChatGPT Plus:**
1. Share your API token: `bs_team_abc123`
2. Help them create a Custom GPT using BrainShare API
3. Test sharing context across different LLMs

## What to Watch For
- **File persistence**: Context survives API restarts
- **Search quality**: Can you find relevant past context?
- **Usage patterns**: When do you naturally want to push/pull?
- **Value moments**: Times when shared context genuinely helped

## Next Steps After Validation
- Replace local file with Google Drive
- Add web interface for direct editing
- Improve context analysis intelligence

## Troubleshooting
- **API won't start**: Make sure port 3100 is free or set `BRAINSHARE_PORT`
- **MCP not working**: Check Claude Code logs for errors
- **Context not saving**: Check file permissions in app directory
