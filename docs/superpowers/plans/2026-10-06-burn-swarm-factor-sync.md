# Burn Swarm context sync implementation plan

> Execute inline using superpowers:executing-plans. User approved the spec and explicitly requested the build; proceed without a redundant approval round.

**Goal:** A scheduled MCP-only worker that incrementally turns Burn discussions into sourced Factor updates.
**Architecture:** Separate Python package beside the interactive bot. SQLite transactions own ingestion, pending actions, budgets, and cache. MCP SDK handles remote transport/auth; explicit capability mappings isolate server-specific schemas. Fail closed on unverified integrations.
**Tech stack:** Python 3.12, MCP Python SDK 1.x, Anthropic SDK, SQLite, cryptography, Railway cron.
**Spec:** ../specs/2026-10-06-burn-swarm-factor-sync-design.md

## Constraints and rulings
- MCP-only Discord and Factor access; no invented live tool contracts.
- Existing Anthropic provider retained; no OpenAI integration or API usage.
- Default dry-run, no live writes or automatic deployment before actual capability discovery and review.
- Ruling: native worktree tool failed because chat root Burn is not a repository; use isolated sibling WorkOS-swarm-sync checkout.
- Ruling: server contracts require authentication. Build and test normalized adapters with explicit configuration; do not label unverified live integration complete.

## Review focus
- Crash after a remote write but before acknowledgement: retain uncertain state, reconcile before retry.
- Messages or cards containing instructions: model cannot invoke arbitrary tools; validate evidence/targets.
- Checkpoint jumps dropping unread messages: reject invalid page ordering and non-progress.
- Dry-run accidentally consuming work: persist proposals but do not apply them without write opt-in.
- Stale card content: compare current revision/content immediately before write and replan on conflict.

## Task 1: Durable state and deterministic policy
Files: apps/swarm/context_sync/state.py, policy.py, test_sync_state.py.
Interfaces: Store.ingest(channel, messages); pending_messages(limit); save_plan(ids, actions, notes); actions(); reserve(cost, cap); choose_stack(stacks, previous).
- [ ] Write tests for restart-safe checkpoints, atomic ingestion, duplicate action keys, uncertain writes, monthly budget reservation and velocity ties.
- [ ] Run pytest and observe missing-feature failures.
- [ ] Implement SQLite state, POSIX single-run lock, strict action validation and routing.
- [ ] Run tests; commit.

## Task 2: MCP boundary and authentication
Files: context_sync/mcp_io.py, auth.py, test_sync_mcp.py.
Interfaces: MCPConnection.call(name,args); ToolAdapter.call(operation, variables); encrypted SDK TokenStorage; CLI discovery/login.
- [ ] Test argument mapping, response normalization, tool error rejection, encrypted token roundtrip and missing capabilities.
- [ ] Implement SDK Streamable HTTP / stdio sessions; explicit mapping with schema validation, encrypted OAuth persistence, loopback authorization.
- [ ] Run tests; commit.

## Task 3: Reconciliation pipeline
Files: context_sync/runner.py, planner.py, test_sync_runner.py.
Interfaces: run_once(store, discord, factor, planner, config, apply); Planner.plan(messages,cards,context).
- [ ] Test no-activity exit, ingestion pagination, matching/update/create, missing destination, conflicts, uncertain writes, pending retry and dry-run.
- [ ] Implement bounded pagination, card indexing/current retrieval, structured plans, evidence validation, provenance and write ledger; cap inference with token-count reservation.
- [ ] Run all Swarm tests; commit.

## Task 4: CLI, deployment and operator guide
Files: context_sync/__main__.py, config.example.json, requirements-sync.txt, Dockerfile.sync, railway-sync.toml, SYNC.md.
- [ ] Implement discover, login, check, run (dry-run default), status and fixture demo commands; validate required config before network access.
- [ ] Document real integration gaps, setup, OAuth transfer, UTC schedule/DST, spend cap, recovery and data retention.
- [ ] Run offline end-to-end demo, full Swarm suite, compile checks and diff check.
- [ ] Fresh reviewer checks worker boundaries and failure paths; fix important findings with regression tests.
- [ ] Commit and report tested implementation separately from blocked authentication/deployment.
