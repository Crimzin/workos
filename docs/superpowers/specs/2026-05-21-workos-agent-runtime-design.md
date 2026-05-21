# WorkOS Conversational Agent Runtime Design

## Goal

Make WorkOS the place where humans can work with coding agents such as Codex, Claude Code, and future AI teammates by chatting with them as normal actors in card and stack threads. The user should not have to enter a separate coding mode, open a dashboard, or manually recreate agent context across app tabs.

The first implementation should build the provider-neutral runtime spine, not the full future agent OS. The chosen approach is:

- Build a conversational runtime with structured policy enforcement.
- Use prompt-only standards as a fallback when provider enforcement is unavailable.
- Shape the data model so living standards, skill packs, scouts, and recommendations can grow later.

## Product Model

Agents remain first-class WorkOS actors. Invocation happens through normal conversation:

1. A human posts in a card or stack thread and mentions an AI teammate.
2. WorkOS routes the mention to the correct provider based on the actor's capabilities.
3. For coding-capable agents, the first response is a short interpretation and plan.
4. The agent waits for confirmation before making file edits.
5. After confirmation, a background worker runs the agent in an isolated repo environment.
6. The agent posts concise progress and final results back into the same thread.

The target experience:

```text
Will: @Codex can you fix this?
Codex: I read this as X. I’ll inspect A/B/C, then make the smallest safe change and verify with Y. Say "go" and I’ll start.
Will: go
Codex: I’m starting a run on branch codex/...
Codex: I found the issue...
Codex: Done. Changed these files, ran these checks, here’s the branch/commit/PR.
```

The thread is the interface. Run metadata exists quietly behind the posts: branch, worktree, logs, changed files, tests, commits, and PR links.

## Runtime Architecture

The existing hardcoded `@Claude` path should become provider-neutral routing:

```text
createPost()
  -> findAgentMentions()
  -> resolve mentioned actors
  -> route by actor capabilities
  -> if chat-only: current inline reply flow
  -> if coding-capable: create agent_run
  -> post first interpretation/plan
  -> wait for user confirmation
  -> worker executes run
  -> post progress/results
```

Proposed module shape:

```text
apps/platform/src/lib/agents/
  router.ts
  capabilities.ts
  context.ts
  standards.ts
  runs.ts
  providers/
    inline-claude.ts
    codex.ts
    claude-code.ts
```

Coding execution should not run inside a Next.js `after()` callback. Long-running file edits, shell commands, and verification need a separate local worker process:

```text
apps/platform-worker/
  watches Supabase for queued agent_runs
  creates worktree/branch
  invokes provider adapter
  streams structured events back to Supabase
```

A temporary tick endpoint or local script is acceptable for early development, but the durable architecture should be a worker.

## Run Lifecycle

Suggested statuses:

```text
mentioned
planning
awaiting_confirmation
queued
running
needs_input
verifying
completed
failed
cancelled
```

For coding-capable agents, the initial mention creates a run in `planning` or `awaiting_confirmation`. A simple confirmation parser can initially accept requester replies such as `go`, `yes`, `do it`, or `proceed`. Later, confirmation can become richer and more contextual.

## Data Model

Minimum tables:

```text
agent_actor_capabilities
  actor_id
  capability
  config

agent_runs
  id
  instance_id
  workspace_id
  target_node_id
  trigger_post_id
  requester_actor_id
  agent_actor_id
  provider_key
  status
  branch_name
  worktree_path
  summary
  error
  created_at
  updated_at

agent_run_events
  id
  run_id
  event_type
  message
  payload
  created_at

agent_run_artifacts
  id
  run_id
  artifact_type
  title
  uri
  payload
  created_at
```

Capabilities should be provider-neutral:

```text
chat
code
shell
git
browser
github
database
web
```

## Provider Contract

Provider adapters differ internally, but WorkOS should depend on one contract:

```ts
interface AgentProvider {
  key: string;
  capabilities: AgentCapability[];
  renderPlanPrompt(input: AgentPlanInput): ProviderPrompt;
  startRun(input: AgentRunInput): AsyncIterable<AgentRunEvent>;
  cancelRun(runId: string): Promise<void>;
}
```

Codex and Claude Code receive the same WorkOS brief: goal, target card/thread, relevant linked context, standards, repo instructions, run policy, confirmation state, and allowed actions.

## Standards And Policy Layers

The existing AI standards layer should expand from `interaction` and `output` into `execution`.

Execution standards should include:

- Start with a short interpretation and plan before edits.
- Read repo instructions before coding.
- Start/check AiDex session.
- Prefer AiDex search before broad filesystem search.
- Use an isolated branch or worktree for file edits.
- Avoid destructive commands without explicit approval.
- Verify before claiming completion.
- Leave a run summary and AiDex note after substantial work.

Standards should have multiple enforcement surfaces:

```text
WorkOS standard record
  -> prompt instruction
  -> runtime policy
  -> provider config
  -> provider hook/skill projection
```

Prompt-only rendering remains the fallback when a provider cannot enforce a standard directly.

## AiDex

AiDex should be a first-class coding tool:

```text
Tool: AiDex
Kind: code index / session memory
Required for: coding agents in indexed repos
Startup action: aidex_session(projectPath)
Search action: aidex_query(...)
Completion action: aidex_note(...)
Fallback: rg/filesystem if missing or stale
```

Per-repo tool availability can be tracked later:

```text
repo_tools
  repo_id
  tool_key
  status
  config
  last_checked_at
```

If AiDex is unavailable, the agent should say so and continue with a fallback when safe:

```text
I can work from files directly, but this repo’s AiDex index is not available. Want me to set it up as a standard tool for future coding runs?
```

## Codex Hooks And Provider Hooks

Codex hooks are relevant as a provider-specific enforcement layer, not as the core WorkOS abstraction.

WorkOS should own provider-neutral policies. Provider adapters project those policies into the native provider mechanisms when available:

```text
WorkOS policy engine
  -> always active at worker level
  -> projected into Codex hooks/config for Codex runs
  -> projected into Claude Code equivalents when available
```

Example mapping:

| WorkOS Standard | Runtime Enforcement | Codex Hook Use |
| --- | --- | --- |
| Start with interpretation/plan | WorkOS requires first post before execution | SessionStart adds run context |
| Use AiDex first | Required startup step | SessionStart verifies or injects AiDex context |
| Avoid destructive commands | Worker policy blocks high-risk operations | PreToolUse filters shell commands |
| Verify before completion | Completion checklist requires evidence | Stop hook checks warnings |
| Leave session memory | WorkOS post + AiDex note | Stop hook writes summary |

Hooks provide defense in depth. Worker-level policy remains authoritative.

## Context Budgeting

Naive WorkOS agent runs could become more token-intensive than native CLIs because WorkOS can see card context, thread history, standards, skills, repo docs, BrainShare memories, and prior runs. Context assembly must be budgeted.

Principles:

- Send the agent a brief, not the whole office.
- Use AiDex and filesystem access for retrieval instead of pasting source code.
- Separate planning context from execution context.
- Include summaries for old threads and prior runs, not raw logs.
- Include only triggered skills, not every available skill.
- Cache rendered standards and repo instructions by version/hash.
- Let BrainShare decide relevance instead of blindly including memories.

Suggested context layers:

| Context Layer | Strategy |
| --- | --- |
| AI standards | Compact rendered block; cache by version/hash |
| Repo instructions | Load `AGENTS.md`, `CLAUDE.md`, and relevant docs |
| Card/thread | Include target post, recent thread, pinned rationale, decisions |
| Linked nodes | Include titles/summaries first; full bodies only when relevant |
| Codebase | Retrieve on demand via AiDex/filesystem |
| Skills | Include only applicable skill instructions |
| Prior runs | Include final summaries/artifacts, not raw logs |
| Logs | Include only when debugging requires them |

## Run-Scoped Approvals

Avoid approval fatigue by approving intent and risk class, not every small action.

When the requester says "go", WorkOS grants a run-scoped approval bundle for low and medium risk work inside the isolated worktree.

Suggested policy:

| Risk Level | Examples | Behavior |
| --- | --- | --- |
| Read-only | inspect files, search, `git status`, AiDex queries | auto-allow |
| Safe local edits | edit files in isolated worktree, run tests, formatters | allowed after "go" |
| Dependency/install | package installs, upgrades, new MCP/tool | ask once |
| Database/schema | migrations, remote Supabase push | explicit approval |
| Destructive | delete files, git reset, force push, env changes | explicit approval or block |
| External side effects | push branch, open PR, deploy, send email | explicit approval |

For Codex, this means WorkOS should run Codex in a configuration that avoids provider-level approval prompts for every safe local action, while relying on WorkOS worker policy and hooks to block high-risk actions.

## Living Standards And Scouts

The future option C should grow through recommendations, not silent mutation.

Suggested table:

```text
standard_recommendations
  id
  title
  rationale
  evidence
  proposed_standard
  source_agent_id
  status
  created_at
  updated_at
```

A future Standards Scout can propose:

- useful new Codex or Claude Code features;
- MCP servers or tools such as AiDex;
- repeated workflow pain;
- repeated user corrections;
- outdated repo standards;
- emerging best practices for agentic coding.

The scout creates normal WorkOS cards, for example:

```text
Possible new coding standard: require AiDex startup notes for long-running agent sessions.
Evidence: repeated context loss across sessions.
Add this?
```

## MVP Sequence

1. Generalize current `@Claude` routing into provider-neutral agent routing.
2. Add actor capability metadata.
3. Add `agent_runs`, `agent_run_events`, and `agent_run_artifacts`.
4. Implement coding-agent planning flow without execution.
5. Add confirmation detection and queued runs.
6. Build local worker with fake provider for end-to-end testing.
7. Add Codex provider adapter.
8. Add AiDex startup/search/summary behavior.
9. Add standards and runtime policy enforcement.
10. Add artifact capture: changed files, verification output, branch, commit, PR URL.
11. Add Claude Code provider adapter.

Deferred:

- fancy run UI;
- full logs viewer;
- automatic PR creation;
- Standards Scout;
- multi-agent delegation;
- remote/cloud workers;
- full BrainShare adaptive retrieval.

## Open Questions

- Should coding agents be able to commit locally after successful verification, or should commit creation require explicit approval?
- Should `go` authorize all safe local edits for the whole run, or only until the next meaningful plan change?
- Should WorkOS store provider hook/config projections as generated artifacts, or regenerate them for every run?
- What is the minimal fake provider contract needed to test the full WorkOS flow before invoking real Codex?

