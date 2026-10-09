# Burn context sync

A separate scheduled worker alongside Swarm's interactive Discord bot. It reads Discord through the bundled read-only MCP server, reasons over new discussion and relevant Factor cards, and writes through Factor MCP. Default mode is dry-run.

## Current integration status

Verified on October 7, 2026 through an authenticated Burn connector and the live board:

- Factor's MCP server for `burn.factor.work` exposes `read_card`, `read_stack`, `ask_factor`, `tell_factor` and artifact upload/download tools. Reads return rendered markdown. `tell_factor` is a natural-language agent and is the only write path. There is no structured CRUD, revision, idempotency key or stack listing tool.
- The stack in the original link is `67de3bd5185531168a9c2cc0`, "EPIC 0: Immediate post-launch polish", on team "! Burn launch" (`64b1a4f7c103fd52529f64d0`). It is the configured `fallback_stack`.
- "This week" is not a column object. The Quarterly roadmap view groups cards by **End date** in Sunday-Saturday weeks; a card whose End date is the end of the current week appears there.
- Velocity is a per-stack weekly figure in Factor's UI. No MCP tool returns it, so `velocity_verified` stays false and new cards go to the fallback stack.
- `ask_factor` is slow: four of six questions exceeded the connector's timeout. The worker does not depend on it.

Verified on October 8-9, 2026 with the worker's own authorization:

- The worker logs in to Factor itself (`login --server factor`, loopback redirect) and refreshes its one-hour token unattended. Expiry and the token endpoint are stored with the encrypted tokens, because the MCP SDK keeps them only in memory and each scheduled run is a new process.
- Both write paths work live: a new card in EPIC 0 placed in this week, and a post on an existing card, each confirmed by reading the card back. A write takes roughly 20-40 seconds because `tell_factor` is an agent, so a run writes at most `max_writes_per_run` (12) and the rest wait for the next run.
- The workspace inbox stack (`65ad70e5e7fbb4562b04b88f`) cannot be read as a normal stack and is not in `stack_ids`.
- The Swarm bot cannot read #general or #backend. Most discussion is in #swat.

Railway deployment is prepared, not deployed.

## What a post looks like

A post is Markdown, rendered by Factor: a one-to-three sentence summary, then the cited Discord messages word for word in a quote block with real names and times, then an optional italic note, then numbered source links and `Swarm action: <first 12 characters of the key>`.

- Only the summary and note are written by the model. Quoted messages are copied from stored messages by `render.py`.
- Uncited messages inside a short exchange (cited neighbours within 30 minutes, at most six messages between) are included.
- For a message over 400 characters the model may name an excerpt; it is used only if it is an exact passage of the message, with the cut marked.
- `people` in the config maps Discord handles to names, for authors and `<@id>` mentions.
- Image attachments are copied into Factor with `upload_artifact_from_url` (3 MiB limit, `max_images_per_post`), once each. Videos and other files are named, not copied.
- Screenshots already on a card are downloaded with `download_artifact`, transcribed once by the model and cached, so discussion a person pasted as an image is not posted again. Only the last 10 posts of a candidate card are read.
- An update is dropped when every message it cites is already linked from the card.

Known limits: the model's choice of what to record varies between runs, and it can still propose a new card for a topic that already has one. Discussion recorded on one card as a screenshot is not noticed when the model files it under a different card.

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

## Factor adapter

Copy `context_sync/config.example.json` to `.sync-state/config.json` and set `channel_ids`. With `"adapter": "factor"`, `context_sync/factor.py` is used instead of the generic `factor_operations` mapping, which remains available for servers with structured JSON tools.

| Operation | How it works against Factor |
|---|---|
| `index` | `read_stack` for every ID in `stack_ids`; card IDs, titles and Factor's one-line summaries are parsed from the markdown. Stacks cannot be discovered, so add new ones to `stack_ids`. |
| `card` | `read_card` with all posts, parsed into title, description, fields and posts. A digest of the full content detects changes; the model sees at most the last 10 posts, 1,500 characters each. |
| `stacks` | The configured stacks with no velocity and the single `this week` End date bucket. |
| `create` | One `tell_factor` request: new card in the destination stack, End date set to this week's Saturday, body published as the first post. |
| `update` | One `tell_factor` request that publishes a post on the card. Title, description and field changes are refused because Factor has no conditional update. |
| `reconcile` | Reads the card, or cards created in the destination stack since the action, and looks for the action marker. |

`tell_factor` returns prose, so its reply is never treated as proof. After each write the adapter reads the card back and requires the `Swarm action: <key>` marker; only then is the action done. A lost acknowledgement is recovered the same way. A write that cannot be confirmed stays uncertain and is not retried. `placement_verified: false` in a create result means the card exists but its End date or stack is not as requested.

Content sent to `tell_factor` is wrapped in delimiters and declared literal, and content containing a delimiter is refused. This reduces, but cannot remove, the chance that Factor's agent acts on text that originated in Discord.

Each index refresh reads every configured stack, and a single stack can exceed 200 KB. Measure a real run against the ten-minute limit before adding stacks.

## Running and reviewing

```sh
python -m context_sync check --config .sync-state/config.json
python -m context_sync run --config .sync-state/config.json
python -m context_sync status
```

Inspect private `.sync-state/last-run.json` for proposed changes and provenance. Dry-run saves proposals without writing Factor; pending proposals stop new planning so later batches cannot create duplicates. No new work means no model inference. The first bootstrap covers seven days by default, with a fixed persisted start point.

After verifying the actual dry-run, enable `live_writes_verified` in config and explicitly pass `--apply`. Leave `conditional_updates_verified` false: Factor has no revision precondition. Live write gates require all of these configuration checks; ordinary deployment retains dry-run.

The planner uses Claude Haiku 5.5 (`claude-haiku-5-5`, set by `model`) at $0.10/M input and $0.50/M output tokens, checked on October 8, 2026. A run over about 100 messages costs roughly $0.02. It counts inputs and reserves the worst-case call cost against a $5 monthly cap before inference; SDK automatic retries are disabled. Failed/unknown calls retain their reservation. Measure real dry-run quality before treating this model choice as production-proven. Model API billing is separate from a Claude subscription and Railway hosting.

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
