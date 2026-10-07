# Burn Swarm implementation handoff to Claude

Prepared for Will Corbett and Claude on October 7, 2026. This document captures the product decisions, implementation, verified results, and remaining work from the Codex session. Continue the existing implementation; do not restart the design or rebuild the worker from scratch.

## Latest update and immediate objective

Will reports: **“I got the connection working in Claude. I'm gonna continue working on this in Claude.”** Use that working connection to inspect the real Factor tools and finish integration, then validate and deploy the scheduled worker to the existing Railway workspace.

The worker framework is implemented and committed, but the end-to-end Discord → Factor workflow is **not deployed or verified**. The remaining work is substantial integration work, not just switching on a schedule. Factor mappings are deliberately empty because Codex never obtained its authenticated tool inventory.

A working connector in Claude does not automatically authenticate the standalone Railway process. Establish how the hosted worker can obtain and refresh its own authorized MCP credentials. Do not extract Claude's private session tokens.

## What Will wants

Swarm should become the orchestrator of context for Burn. It should read Discord a few times per day and update Factor cards or create relevant new ones without Will being the go-between. The implementation must be very lean, inexpensive, and efficient: read only messages not yet processed, with limited older context retrieval when necessary.

These decisions were explicitly settled with Will:

1. **Record the team's discussion and decisions.** Initially Swarm should not independently propose and prioritize work from its own strategic judgment.
2. **Automatically capture worthwhile new ideas.** A concrete idea can warrant a card before the team commits to pursuing it. Clearly distinguish an idea from agreed work.
3. **Understand the complete Factor card.** Titles, descriptions, posts/comments, and structured fields all contain relevant context and can need updates.
4. **New cards go in the most active stack's “this week” column.** This creates an intake queue for Wednesday morning sprint planning. Placement is not a commitment to deliver that week.
5. **Infer the most active stack from Factor's per-stack velocity.** Do not substitute message counts or an invented activity metric.
6. **Existing topics update their existing cards wherever they live.** Do not move cards into the current stack or duplicate them merely because routing changes.
7. **Use MCP for integrations.** The worker must access Discord and Factor through MCP.
8. **Host it cheaply.** Railway is acceptable; use the existing account if possible. Avoid an always-on second bot, a separate database service, vector database, graph infrastructure, or multi-agent runtime.
9. Will approved the design spec and explicitly said **“looks great. go build it.”** The next assistant has authorization to continue implementation; there is no need to repeat product discovery or ask permission to begin coding.

Operational policy chosen in the design:

- Preserve uncertainty and conflicting statements until the team resolves them.
- Change owner, status, priority, and deadline only when explicit discussion supports that change.
- Keep the description useful as the current understanding; use posts to explain meaningful changes and link evidence.
- Preserve human detail and recognizable titles. Avoid cosmetic rewriting.
- Every substantive update needs Discord source links.
- Quiet/no-change runs should incur no model inference.
- Do not send routine Discord notifications unless a notification destination and behavior are agreed. None are configured.

## Factor destination and workspace distinction

Initial stack supplied by Will:

https://burn.factor.work/team/64b1a4f7c103fd52529f64d0/experiments?selected=67de3bd5185531168a9c2cc0&type=AssignedChallenge&tab=Playground&sView=yOCKEeolJO0zXS69oWRcL

The original pasted link had a trailing period after the sView value; it was treated as punctuation. Verify canonical IDs through Factor. In particular, do not assume the `selected` object is the stack itself.

- Burn Factor host: `burn.factor.work`
- Burn team ID from the URL: `64b1a4f7c103fd52529f64d0`
- MCP endpoint: `https://burn.factor.work/mcp`
- Target column label: `this week`

An earlier screenshot of Claude showed a successful read through **“Ask Factor (willc)”** against `willc.factor.ai`, whose team was **! alynOS**. That proved read access to a different workspace, not Burn. The screenshot also mentioned a `tell_factor` write tool, with writes untested. Those are clues to the interface, not verified Burn tool contracts.

Will subsequently reports that the connection is working in Claude. Start with the now-connected tools, verify that results belong to **Burn**, and inspect actual tool schemas. Do not assume the screenshot describes the latest connection or that the generic names are the exact MCP names.

## Where the code lives

The chat's original directory was:

`/Users/williamcorbett/Desktop/Claude-Projects/Burn`

That directory is not itself a Git repository. It contains separate projects, including an existing Node Discord bot in `discord-bot/`.

Swarm's existing code actually lives in the WorkOS monorepo:

`/Users/williamcorbett/Desktop/Claude-Projects/WorkOS/apps/swarm`

The implementation was isolated in a sibling Git worktree:

**Worktree:** `/Users/williamcorbett/Desktop/Claude-Projects/WorkOS-swarm-sync`

**Branch:** `codex/burn-swarm-sync`

**Worker directory:** `/Users/williamcorbett/Desktop/Claude-Projects/WorkOS-swarm-sync/apps/swarm/context_sync`

**Implementation HEAD at handoff:** `55f2364`

Commits:

| Commit | Content |
|---|---|
| `d6e977f` | Approved design spec, originally committed in the primary WorkOS checkout |
| `fe575e0` | Durable sync state, policy validation, implementation plan |
| `eb0689a` | MCP transport/auth, bundled Discord MCP, planner, reconciliation |
| `55f2364` | CLI, recovery protections, configuration, operator guide, Railway packaging |

These implementation commits were not merged into main or pushed during this task. Recheck Git status before editing because the user may continue working elsewhere. The worktree was clean before this handoff document was added.

Read the repository's `AGENTS.md` and `CLAUDE.md` when working locally. The existing interactive Swarm bot remains separate and unchanged by the new worker.

Existing project documents, relative to the worktree root:

- `docs/superpowers/specs/2026-10-06-burn-swarm-factor-sync-design.md`
- `docs/superpowers/plans/2026-10-06-burn-swarm-factor-sync.md`
- `apps/swarm/SYNC.md`

Some historical status text in those files is stale: the spec still says “for user review,” although Will approved it; the operator guide records Codex's OAuth failure before Will's latest success in Claude. Use this handoff for the latest conversation state, and actual tools/code for current runtime facts. The plan's execution record is more informative than its original unchecked task boxes.

If running only in Claude chat without filesystem access, these paths identify files on Will's Mac, not attachments automatically available to the model. Use Claude Code/Cowork with access to the worktree, or have the relevant source files attached. The MCP connector alone does not provide this repository's source code.

## Implementation map

All paths below are relative to `apps/swarm/` in the worktree.

| File | Responsibility |
|---|---|
| `context_sync/state.py` | SQLite storage, transactional ingestion, checkpoints, pending actions, spend reservations, process lock, recovery |
| `context_sync/policy.py` | Velocity selection and validation of proposed changes/evidence |
| `context_sync/mcp_io.py` | MCP SDK Streamable HTTP and stdio connections, discovery, schema validation, explicit operation mappings |
| `context_sync/auth.py` | Encrypted OAuth token/client storage and explicit loopback browser login |
| `context_sync/discord_mcp.py` | Bundled read-only Discord MCP server using the existing bot token |
| `context_sync/planner.py` | Bounded candidate selection and structured change planning through Anthropic |
| `context_sync/runner.py` | Ingestion, context assembly, card retrieval, proposals, routing, write application |
| `context_sync/__main__.py` | `discover`, `login`, `check`, `run`, `status`, and `replan` CLI commands |
| `context_sync/config.example.json` | Incomplete deployment configuration; deliberate empty Factor mappings and channel scope |
| `requirements-sync.txt` | Separate pinned worker dependencies |
| `Dockerfile.sync` | Python 3.12 container definition |
| `railway-sync.toml` | Cron service definition, initially dry-run |
| `SYNC.md` | Operator instructions, normalization contracts, authentication, recovery, deployment |
| `test_sync_*.py` | New unit and controlled-boundary tests |

Pinned direct dependencies: `mcp==1.30.0`, `anthropic==0.125.0`, `cryptography==46.0.7`, `httpx==0.28.1`, `jsonschema==4.26.0`. Legacy bot dependencies remain in their original requirements file.

## Worker behavior

### Incremental ingestion and context

- One process lock prevents overlapping local executions against the same state database.
- SQLite transactions save a page before advancing its per-channel/thread message-ID checkpoint.
- The bootstrap cutoff is persisted once; default history is seven days.
- Reads are oldest-first, up to 100 messages per page, with ten pages per source per run by default. Unread backlog remains for later runs.
- A bounded overlap rereads up to twenty retained messages per source to detect content edits; these are intentional repeat reads, not a full-history scan.
- Active and recently archived public/joined private threads are discovered under configured channels. Thread parent IDs keep scope filtering correct.
- Removing a configured channel filters its retained threads and clears retained notes/tail context. Pending writes whose evidence leaves scope are held.
- Bot messages advance checkpoints but are excluded from human reasoning batches.
- Default planning batch is 100 messages. The worker currently plans one batch per run, not the entire backlog.
- Context includes project configuration, bounded unresolved notes, the last ten human messages, and up to ten specifically referenced older messages.
- Confirmed missing reply targets become unavailable context; authentication/network errors remain failures.
- Attachments are links/metadata only. No image, audio, or document extraction is implemented.

### Factor context and reasoning

- A compact card index is cached for 24 hours by default, with bounded paginated refresh.
- A first model call chooses at most eight candidate existing cards; full current contents are then retrieved.
- A second model call produces structured create/update actions or no changes, plus short unresolved notes.
- Validators reject invented source IDs, unavailable update targets, unsupported fields, oversized output, and field changes without literal quoted source evidence.
- The evidence quote check verifies that the text exists; semantic interpretation of whether it truly expresses a commitment still depends on model quality. It is not a proof of intent.
- Conversation content is treated as evidence rather than instructions. The model does not receive arbitrary MCP write-tool control.

### Pending writes and recovery

- Dry-run persists proposals but performs no Factor writes. Unresolved proposals block further planning, which prevents subsequent dry-run batches from duplicating pending ideas.
- Before creation, a fresh card index is compared with the proposal's index fingerprint. A changed index holds the action for replanning.
- Before updating, the current card's fingerprint is compared with the retrieved version. The actual server revision is passed separately if available.
- Title/description/field overwrites require verified conditional-update support and a real revision. Additive posts can proceed without those overwrites.
- Source content hashes invalidate proposals when messages are edited after planning.
- The write ledger is marked `uncertain` before dispatch. A crash or missing acknowledgement cannot silently trigger a blind retry.
- Confirmed successful writes retain remote IDs and invalidate the index cache. Exact-action reconciliation is supported if Factor exposes a suitable read operation.
- New-card descriptions and update posts carry source links and `Swarm action: <key>` provenance markers.
- `replan --action <key>` only supersedes unwritten pending/conflict actions and requeues retained source messages. It refuses uncertain writes.
- Processed raw messages are eligible for pruning after 30 days; current implementation skips pruning while unresolved actions exist. Durable action/source provenance remains.

### Routing

The selected destination is the highest-velocity eligible stack when velocity semantics have been verified. Ties, absent measurements, or incomplete velocity data retain the previous destination. Until `velocity_verified` is enabled, the confirmed initial stack is used.

Only new cards enter the destination's uniquely identified `this week` column. A missing or ambiguous column holds creations. Existing cards are not moved. Determine whether Swarm writes themselves increase Factor velocity, to avoid self-reinforcing routing.

## Factor integration is the main unfinished component

`factor_operations` is **empty**, and `fallback_stack` is **empty**, in the example configuration. No real Factor tool names or response shapes were guessed.

The generic adapter expects these logical operations:

| Operation | Expected normalized result |
|---|---|
| `index(cursor, limit)` | `{items:[{id,title,summary,fields}], next:cursor-or-null}` across the relevant Burn cards |
| `card(card_id)` | Complete `{id,title,description,fields,posts,revision?}` |
| `stacks()` | `[{id,velocity,archived,columns:[{id,name}]}]` |
| `create(payload, action_key)` | `{id}` confirming the actual new card |
| `update(card_id, payload, action_key, expected_revision)` | `{id}` confirming application; revision precondition when supported |
| `reconcile(action_key)` | Optional exact `{id,action_key}` when a prior write can be located |

Mappings specify an exact tool name, typed argument substitutions, and basic output-path/field normalization. See `SYNC.md` and `mcp_io.py` for the actual limits of this small mapping layer. It is not an arbitrary transformation engine.

If Factor exposes only natural-language `ask_factor` and `tell_factor` tools, adapt to that actual interface. Do not pretend it provides deterministic CRUD, strict JSON, idempotency, or atomic revisions without verification. Inspect costs/latency too: a tool may run its own AI layer, affecting both the efficiency design and billing assumptions.

If changing one card requires multiple remote tools, implement a concrete Factor adapter and journal each independently consequential step. Do not put several writes behind one ledger entry and claim safe retry behavior.

If Factor lacks conditional writes, the current worker will hold overwrite proposals. Resolve this limitation deliberately with evidence-preserving behavior rather than setting the verification flag to bypass it. Likewise, if velocity is not exposed, surface the gap and retain the agreed fallback stack.

## Authentication findings

Codex observed:

1. `GET https://burn.factor.work/mcp` returned 405.
2. An unauthenticated MCP initialize POST returned 401 and advertised protected-resource metadata at `https://burn.factor.work/.well-known/oauth-protected-resource/mcp`.
3. That metadata identified the resource as Factor MCP for `burn.factor.work` and the authorization server as `https://factor-mcp.app.factor.work/`.
4. Authorization metadata advertised authorization-code PKCE, refresh tokens, and dynamic client registration.
5. The SDK registered a client and opened the authorization page, but the browser displayed **403 Forbidden** before any consent screen. The local callback eventually timed out. The cause was not established.
6. No authenticated Factor tool inventory or Factor access token was obtained by this worker.

Will's successful connection in Claude is new evidence. Do not assume the old 403 is still present; investigate from the working connector. Equally, do not assume Claude's connection proves an independently registered Railway client will work.

The implemented local login callback is `http://127.0.0.1:8765/callback`. OAuth tokens and client information are stored using Fernet encryption, atomic writes, and mode 0600. Interactive authorization is only available through `login`; scheduled runs fail when fresh consent is required.

Environment variable names:

- `DISCORD_BOT_TOKEN`
- `ANTHROPIC_API_KEY`
- `SWARM_TOKEN_KEY` for the deployed encryption key
- `SWARM_TOKEN_KEY_FILE` for an optional local key-file path
- `SWARM_STATE_DIR`

Existing credential presence was confirmed without revealing values in `/Users/williamcorbett/Desktop/Claude-Projects/WorkOS/apps/swarm/.env`. The existing token successfully authenticated the bundled Discord MCP server. Do not print or copy credential values into this document, chat, Git, or logs.

Local ignored setup state exists under `apps/swarm/.sync-state/` in the worktree, including a local encryption key and encrypted OAuth client registration. It should not be assumed to contain valid Factor access tokens. Keep the encryption key outside the persistent volume in production; use deployment secret storage.

## Discord connection and proposed scope

No Discord MCP configuration was found in standard Claude/Codex local configuration files. A small read-only MCP server was therefore bundled into the worker. It starts as a local stdio child process during the scheduled job and uses Discord's API internally. The orchestrator itself still accesses Discord through MCP. This adds no separate hosted service.

Live bot access found:

| Server | ID |
|---|---|
| BURN | `958764126342086816` |
| BURN 🔥 | `1097697742991667250` |

The newer server is the proposed target. Initial channels proposed to Will, but not yet confirmed in this chat:

| Channel | ID |
|---|---|
| general | `1097697744564527257` |
| design | `1097877622962274334` |
| core-team | `1102835138091552768` |
| bug-reports | `1120633313523142736` |
| product-ideas | `1180586686397296692` |
| feedback | `1227838970793296002` |
| backend | `1380171441882005764` |
| founders | `1478232782898597898` |
| feature-requests | `1478233002457956394` |
| engineering | `1478233172033540167` |
| standup | `1478233232129523753` |

Other channels exist, including announcements, releases, burn-feed, swat, inspiration, and swarm-testing. Decide scope explicitly; do not assume every historical/community channel is relevant.

Live verification succeeded for guild listing, channel listing, active thread discovery, archived public/joined-private thread discovery, and an incremental seven-day read of core-team. That message page was empty, so no non-empty live history batch or model-quality evaluation was demonstrated.

## Hosting and cost decisions

Railway browser login confirmed an existing **Burn** project in **schradoc's Projects**, a **Pro** workspace, with three services online.

- Project ID: `c646c02e-8999-4dba-92e9-64211826251e`
- Workspace ID seen in the dashboard: `13895832-1335-4ea1-90c2-9fd45285f580`
- Dashboard: `https://railway.com/project/c646c02e-8999-4dba-92e9-64211826251e`

The existing Burn Node Discord bot has its own configuration at `/Users/williamcorbett/Desktop/Claude-Projects/Burn/discord-bot/railway.toml`. Do not overwrite or replace that service when adding the sync job.

The prepared Swarm configuration uses:

- One Railway cron service, one replica.
- WorkOS repository root as Docker build context.
- `apps/swarm/Dockerfile.sync` and `apps/swarm/railway-sync.toml`.
- Persistent volume mounted at `/data`; configuration at `/data/config.json`.
- Python process runs once and exits; no HTTP healthcheck server.
- Restart policy `NEVER` so a failed run waits for the next scheduled attempt.
- Schedule `0 12,17,22 * * *` in UTC: 08:00/13:00/18:00 EDT, or 07:00/12:00/17:00 EST.
- Actual Wednesday meeting time still needs confirmation. Preserve the requirement to run before planning; the exact schedule is provisional.
- Default start command is dry-run; applying requires adding `--apply` and enabling `live_writes_verified` after a real review.

No Swarm Railway service or deployment was created. No billable hosting action was taken for this worker. CLI access was not configured during the task; browser workspace access was verified.

The implementation retains Anthropic, matching the original Swarm bot. It currently selects `claude-haiku-4-5-20251001` with implementation-time pricing constants of $1/M input and $5/M output tokens. Reverify pricing before deployment and evaluate quality against actual Burn discussions.

The $5/month model budget is a proposed operating cap, not a demonstrated workload estimate. Token counting precedes each call, a maximum-cost reservation is stored durably, actual usage settles successful calls, and uncertain billing retains the reservation. SDK automatic retries are disabled. No paid model inference occurred in this task.

Hosting, model API usage, and any Factor MCP charges are separate. A Claude subscription/connector login is not a model API billing arrangement.

## Verification and remaining limitations

Last full test run: **51 passed**, with one existing `discord.py` warning about `audioop` deprecation. Python compilation and Git whitespace checks passed. The total includes legacy tests and inherited test cases; it is not a claim of 51 independent production scenarios.

Run from the worktree root using the already-created Python 3.12 environment:

```sh
.venv-sync/bin/python -m pytest apps/swarm -q
.venv-sync/bin/python -m compileall -q apps/swarm/context_sync
git diff --check
```

An independent review identified issues that were fixed with regressions: stale card indexes before creation, index invalidation after uncertain-write recovery, removed-channel ingestion, real server revision handling, recent edits, missing velocity data, source changes after proposals, and pending writes from removed channels. Not every behavior described in the design has a dedicated automated or live test; inspect coverage rather than treating the count as certification.

Docker build was attempted but could not connect to the local Docker daemon. The image has not been built or run successfully. Start the daemon or validate via an appropriate builder before deployment.

Material limitations to preserve or improve:

- No authenticated Factor integration or real end-to-end dry-run yet.
- No live validation of token refresh, velocity semantics, field mappings, or writes.
- Full index refresh before creation is conservative and may conflict on unrelated changes; tune after observing real Factor behavior.
- There remains a race between pre-write reads and concurrent human changes unless Factor supplies atomic preconditions/uniqueness.
- An unresolved action blocks all new planning, so operator recovery can become a bottleneck. Avoid a redesign until real failures justify it, but do not hide this behavior.
- Candidate selection is capped at eight cards and context at 120,000 characters; oversized/ambiguous workloads may stop rather than process partially.
- The ten-minute timeout wraps reconciliation, not necessarily every preceding connection/auth step.
- Recent edits are detected; arbitrary old edits, message deletions, and attachment contents are not fully tracked.
- No outbound failure notifications have been configured.
- There is no safe general CLI to mark an uncertain action as remotely completed; exact MCP reconciliation is preferred, otherwise implement an audited recovery path after understanding Factor.

## Recommended continuation

1. **Verify Burn through the working Claude connector.** Read the workspace identity, stacks, velocity values, target column, and a representative complete card. Do not repeat the mistaken willc/! alynOS check.
2. **Inspect actual Factor schemas and auth behavior.** Determine whether the interface is structured operations or an agentic ask/tell layer. Identify autonomous client authorization and refresh support.
3. **Open the existing worktree and inspect the code.** Preserve unrelated changes. Use the current spec and this document; product intent is already approved.
4. **Implement the concrete Factor adapter.** Complete all needed surfaces, scope restrictions, result validation, provenance, and safe retry/reconciliation behavior. Add regression tests using realistic captured response shapes with secrets removed.
5. **Resolve the few remaining configuration choices.** Confirm channel scope, canonical initial stack/column IDs, velocity meaning/window, and Wednesday meeting time. Leave unsupported capabilities explicitly disabled.
6. **Run a bounded real dry-run.** Show a small set of actual proposed creates and before/after card changes, with source links and intended destination. Measure inference and any MCP-side cost. Do not silently ingest all Discord history.
7. **Build and validate the container.** Provision the existing Railway workspace's separate cron service, persistent volume, configuration, and secrets securely. Keep existing services intact.
8. **Enable scheduled writes after reviewing real output.** Verify at least one completed scheduled run, persisted checkpoints after restart, and duplicate-safe retry. Report deployed status only after these checks.

The desired finish is a working, inexpensive scheduled service that removes Will from routine context transfer. A generic worker with an empty Factor mapping, a successful Claude read, or a green test suite alone does not satisfy that outcome.
