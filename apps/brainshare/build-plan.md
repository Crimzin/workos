# BrainShare MVP Build & Test Plan

## Phase 1: Test Local API with File Storage (30 minutes)

### Step 1.1: Start the API
1. **Open Terminal** (Cmd+Space, type "Terminal")
2. **Run these commands** (copy/paste one by one):
   ```bash
   cd /Users/williamcorbett/BrainShare/app
   python3 app.py
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

## Phase 2: Add Claude Code Integration (20 minutes)

### Step 2.1: Configure Claude Code
1. **Open Claude Code settings**: Cmd+, (comma)
2. **Find "MCP Servers"** section
3. **Copy the entire contents** of `/Users/williamcorbett/BrainShare/mcp/claude-config-example.json`
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
