# Burn context sync

A separate scheduled worker alongside Swarm's interactive Discord bot. It reads Discord through the bundled read-only MCP server, reasons over new discussion and relevant Factor cards, and writes through Factor MCP. Default mode is dry-run.

## Current integration status

The bundled Discord MCP server has connected live with Swarm's existing token and listed both Burn servers and their channels. The likely current server is BURN 🔥 (`1097697742991667250`); channel scope still requires confirmation.

Factor's MCP endpoint advertises OAuth at `https://factor-mcp.app.factor.work/`. Dynamic client registration completed, but the browser authorization page returned **403 Forbidden** on October 6, 2026. No Factor tokens or tool inventory were obtained. Do not populate mappings from guessed tool names or enable live writes. Provider-side authorization access must be resolved first.

Railway deployment is prepared, not deployed. The existing Burn Discord bot has Railway configuration; browser sign-in confirmed the Burn project in a Pro workspace with three services online. No paid model calls or Factor writes have been made during development.

## Local setup

From `apps/swarm`, use Python 3.12 and a virtual environment:

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-sync.txt
.venv/bin/python -m context_sync --help
```

Provide `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY` through the environment. Reuse the existing Swarm credentials only in the intended deployment. Never put tokens into config JSON or commit them. Dependencies for this worker are separate from the older bot's requirements.

For OAuth, create a Fernet key into a mode-0600 local file without printing it. Set `SWARM_TOKEN_KEY_FILE` to that path locally, or `SWARM_TOKEN_KEY` as a Railway deployment secret. Persist both the encrypted OAuth state and the same key across redeployments. Keep the key outside the persistent volume in production.

```sh
python -m context_sync login --server factor --state-dir .sync-state
python -m context_sync discover --server factor --state-dir .sync-state
python -m context_sync discover --server discord --tool list_guilds
python -m context_sync discover --server discord --tool list_channels --arguments '{"guild_id":"1097697742991667250"}'
```

Login opens the system browser and listens only on `127.0.0.1:8765` for the OAuth callback. The SDK validates state and PKCE. Scheduled execution never prompts for interactive login; revoked or expired access is surfaced as an error. Encrypted token updates are atomic and mode 0600. Configure Factor's supported redirect policy before deployment; localhost login support has not been established.

## Factor tool mapping

Copy `context_sync/config.example.json` to `.sync-state/config.json`. Resolve the actual stack and column IDs through authenticated discovery. The selected object in the original Factor URL is not assumed to be the stack ID.

`factor_operations` maps each logical operation to a real discovered MCP tool. Each rule has:

- `tool`: exact discovered name.
- `arguments`: JSON template; an entire string such as `$card_id`, `$cursor`, `$limit`, `$payload`, `$action_key`, or `$expected_revision` is replaced by the corresponding typed value. Workspace restrictions are fixed literals in the mapping.
- `result`: optional `path` (dot-separated object path), `fields` (output field → input path), or `each` (same mapping for list items). Omit to retain the returned JSON shape.

Required normalized read contracts:

| Operation | Inputs | Output |
|---|---|---|
| `index` | cursor, limit | `{items:[{id,title,summary,fields}], next:null or cursor}`; complete scoped card listing, including existing topics outside the active stack |
| `card` | card_id | `{id,title,description,fields,posts,revision?}`; complete relevant current content |
| `stacks` | none | `[{id,velocity,archived,columns:[{id,name}]}]` with comparable velocity windows |

Write contracts:

| Operation | Inputs | Output |
|---|---|---|
| `create` | payload, action_key | `{id}`; payload contains title, description, optional fields/post, stack_id and column_id |
| `update` | card_id, payload, action_key, expected_revision | `{id}`; atomically patch requested content, with revision precondition for overwrites |
| `reconcile` (optional) | action_key | `{id,action_key}` only when the exact action can be found remotely |

Input schemas are validated against MCP discovery before calls. A tool error, malformed response or unknown contract fails closed. If Factor exposes separate operations per card surface, implement a concrete Factor adapter with separately journaled steps after discovery; do not hide multiple remote writes behind one untracked mapping. If it lacks atomic conditional updates, additive posts can work, but title/description/field changes remain held instead of risking overwrites. These constraints mean the generic adapter is not yet a verified Factor integration.

Verify whether agent activity contributes to velocity before setting `velocity_verified`. Until verified, use the confirmed initial stack. Missing measurements or ties retain the last destination. Missing/ambiguous `this week` holds creations.

## Running and reviewing

```sh
python -m context_sync check --config .sync-state/config.json
python -m context_sync run --config .sync-state/config.json
python -m context_sync status
```

Inspect private `.sync-state/last-run.json` for proposed changes and provenance. Dry-run saves proposals without writing Factor; pending proposals stop new planning so later batches cannot create duplicates. No new work means no model inference. The first bootstrap covers seven days by default, with a fixed persisted start point.

After verifying the actual dry-run, enable `live_writes_verified` in config and explicitly pass `--apply`. Do not enable `conditional_updates_verified` until the remote precondition contract is tested. Live write gates require all of these configuration checks; ordinary deployment retains dry-run.

The planner uses Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) at the verified implementation-time rates of $1/M input and $5/M output tokens. It counts inputs and reserves the worst-case call cost against a $5 monthly cap before inference; SDK automatic retries are disabled. Failed/unknown calls retain their reservation. Measure real dry-run quality before treating this model choice as production-proven. Model API billing is separate from a Claude subscription and Railway hosting.

## Reliability and limitations

SQLite stores ingestion checkpoints separately from the outbox. Each page is saved transactionally before its checkpoint advances. Recent overlap rereads up to twenty retained messages per source, detecting changes in returned content. Arbitrary historical edits and deletions are not covered. Explicitly deleted reply targets are marked unavailable; other retrieval failures stay errors.

A fresh card index is compared before creates. Changed content/revisions hold updates for replanning. This is conservative protection, not a remote transaction: another human could still create a matching topic in the short interval after revalidation unless Factor offers a uniqueness/idempotency facility.

Each remote write is recorded as uncertain *before* dispatch. An unknown result is never blindly retried. A configured exact-action reconciliation may confirm success; otherwise inspect Factor for the `Swarm action: <key>` provenance marker before resolving the action. Use `python -m context_sync replan --action <key>` to supersede an unwritten pending/conflict proposal and requeue its retained source messages. This command refuses uncertain writes. Conflicts and uncertain writes require operator recovery; the worker does not claim exactly-once execution without server support.

Bounded discovery includes active threads and recently archived public/joined private threads under configured channels. Old discovered threads remain tracked while their parent is in scope. Permissions failures are errors, not empty histories. Discovery and per-source page limits prevent unbounded calls; unread backlog stays behind durable checkpoints. Raw processed messages expire after 30 days, while source links and actions remain. Source attachments are retained as references, not downloaded or interpreted.

## Railway deployment

Create a cron service in the existing paid Burn workspace, after confirming plan and cost. Use the WorkOS repo root as build context, `apps/swarm/railway-sync.toml` as the config path, and a persistent volume mounted at `/data`.

Provision `/data/config.json`, the encrypted Factor OAuth state, and deployment variables `DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `SWARM_TOKEN_KEY`. Copy credentials only through secure deployment tooling, never logs or Git. Use one replica. No inbound web endpoint, healthcheck server or separate database is needed.

The prepared schedule is `12:00`, `17:00`, `22:00` UTC: 08:00/13:00/18:00 EDT or 07:00/12:00/17:00 EST. Confirm the Wednesday meeting time before enabling it. Keep restart policy `NEVER` so a failure waits for the next scheduled run; the ledger safely resumes. Process execution is capped at ten minutes. Railway skips a scheduled run if the previous one is still active.

After connection testing and dry-run review, add `--apply` to the Railway start command. No automatic Discord notifications are configured; monitor job failures, last success and the private report. Hosting and any provider MCP fees are separate from the model cap.

## Verification

From the repo root with worker and legacy test dependencies installed:

```sh
python -m pytest apps/swarm -q
python -m compileall -q apps/swarm/context_sync
```

Tests use temporary SQLite databases and controlled remote boundaries; they do not incur model charges or write to Discord/Factor. Live verification covers Discord MCP tool discovery, guild/channel listing, active and archived thread discovery, and a bounded incremental message read in core-team. That seven-day message page was empty. Factor writes and container execution remain unverified; local Docker daemon was unavailable.
