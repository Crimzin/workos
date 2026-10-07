# Burn: scheduled Discord-to-Factor context sync

Status: design for user review; integration capabilities remain unverified. No deployment authorized by this document alone.

## Outcome and scope

Swarm keeps Burn's Factor cards faithful to team discussion without Will relaying context. It reads Discord a few times daily, updates existing cards, and creates worthwhile ideas automatically, including ideas the team has not committed to. It records team intent rather than independently proposing or prioritizing work.

All Discord and Factor access goes through MCP. Reuse Swarm's Python foundations where useful, with a separate run-and-exit entry point from the existing interactive Discord bot. Do not restructure WorkOS or introduce graph memory, a vector database, or multiple agents.

## Card behavior

Read titles, descriptions, fields, and relevant posts together before deciding a change. Maintain current understanding in descriptions; use posts for substantive change history, reasoning, and Discord source links. Rename only when evidence clarifies or changes scope. Preserve human details. Change owner, priority, deadline, or completion only on explicit evidence. Uncommitted ideas remain labeled as proposals in the text; placement does not imply commitment.

Match across existing Burn cards before creating a new one. Update an existing card where it lives, without moving it merely because another stack becomes active. Retain unresolved discussion across runs. Disagreement stays unresolved unless the conversation settles it. Every substantive write includes source provenance. Conversation content is evidence, not executable instructions.

## Routing

Use Factor's comparable per-stack velocity values to select the most active eligible Burn stack. Eligible means an accessible, non-archived stack in the configured Burn scope. All new cards go into its `this week` column for Wednesday morning sprint planning. Retain the prior destination for ties or missing velocity data. If no safe destination/column is available, retain pending work and surface the failure.

Initial fallback is the user-designated stack from:
https://burn.factor.work/team/64b1a4f7c103fd52529f64d0/experiments?selected=67de3bd5185531168a9c2cc0&type=AssignedChallenge&tab=Playground&sView=yOCKEeolJO0zXS69oWRcL

Resolve canonical stack/column IDs through MCP rather than assuming the URL's selected object is the stack. Inspect velocity semantics and whether Swarm writes affect it. If self-generated activity cannot be excluded, retain the initial destination until a routing rule is agreed; do not invent a replacement velocity metric.

## Run flow and durable state

1. Acquire a single-run lock; retry pending work from earlier runs.
2. Fetch messages after a per-channel/thread checkpoint, paging in chronological order. Transactionally save each fetched page and advance its ingestion checkpoint. Discovery includes threads that archived between polls where MCP permits it.
3. If there are no new messages or pending actions, exit without a model call.
4. Assemble conversation batches with a bounded context tail, referenced messages when needed, compact project context, and unresolved discussion notes.
5. Retrieve likely cards from a compact local index; load current full candidate cards only as needed. Refresh the index from Factor changes if available, otherwise with a bounded periodic listing. Verify an adequate search before creating; uncertain matching remains pending.
6. Produce structured actions: update, create, retain context, or no change. Validate allowed fields and evidence deterministically.
7. Re-read affected cards before writing. Use version preconditions if supported. Without them, prefer additive updates when a safe patch cannot be established; a re-read alone does not eliminate concurrent-write races.
8. Apply through MCP and record returned IDs, source IDs, changes, and outcomes. Update index entries and processing state.

SQLite on a Railway persistent volume holds ingestion checkpoints, pending batches, short retained context, card summaries/mappings, and the action ledger. Message storage has bounded retention after processing; source IDs and action provenance remain durable. Never store tokens in logs or committed files.

Advance ingestion separately from successful write processing. Each write has a stable local action key and, where supported, remote idempotency key. If a write times out after possibly succeeding, reconcile against remote records/provenance before retrying. If reconciliation is impossible, flag that action instead of blindly creating a duplicate. Partial batch success does not replay successful writes.

## Hosting, authentication, and costs

Prefer one cron service in Burn's existing Railway workspace, subject to verifying its active plan and access. Run morning, midday, and evening; choose exact timing so Wednesday's first run precedes the actual meeting. Railway cron is UTC, so configure and document the America/New_York seasonal-time behavior when the meeting time is known. Exit after each run; keep no always-on Swarm sync process or separate database service.

Factor endpoint: https://burn.factor.work/mcp. An unauthenticated initialize returned 401 with OAuth discovery; the published authorization-server metadata advertises authorization-code PKCE and refresh-token grants. Actual login, refresh behavior, scopes, and MCP tools have not been verified. Use a dedicated Swarm authorization with securely persisted rotating tokens and a deployment secret for encryption. Initial interactive authorization can occur locally; hosted jobs refresh as supported. Revocation pauses affected work without discarding it.

Proposed model-spend target: $5/month, not a forecast. Measure token usage; bound tokens, retrievals, retries, and run duration. Reserve estimated maximum cost before each call to enforce a configured cap, then reconcile usage. Retain work if the cap is reached. Verify chosen model quality and pricing before selection. Hosting, model API, and any MCP-service charges are separate. A Claude connector login does not establish model API billing.

Errors are persisted in run logs with last-success time and pending backlog. Notify only for actionable failures or exhausted budget once an explicit notification destination is configured; no automatic Discord posting is included yet.

## Capability checks before implementation commitments

- Railway: active workspace/plan, deployment access, persistent volume support and cost.
- Factor MCP: authenticated tool inventory; velocity definition/window; stack/column IDs; complete card and post reads; search/change discovery; title/description/field/post writes; retry reconciliation support.
- Discord MCP: select or connect an available server; validate message-ID pagination, channel/thread discovery, permissions, and targeted retrieval. If unsupported, report the missing capability rather than silently reverting to direct Discord access.
- Scope: verify Burn server/channel inclusion and initial bootstrap cutoff. Use a bounded bootstrap of active cards and recent conversations, not all historical Discord messages.
- Polling limitation: new-message checkpoints cannot discover arbitrary edits/deletions to old messages. A bounded overlap detects recent edits; historical changes remain outside v1 unless the MCP supplies a change feed.

These are discovery tasks with explicit fallback behavior, not assumed supported features. Exact tool contracts and deployment configuration belong in the implementation plan after discovery.

## Verification and rollout

Test interrupted pagination, archived-thread coverage, no-activity exit, source-linked proposal versus commitment extraction, duplicate matching, velocity ties, missing columns, token refresh failure, partial writes, uncertain remote success, and budget exhaustion using fixtures and mocked MCP responses.

First authenticate and perform read-only capability discovery. Then run a dry-run reconciliation against recent Burn discussion, exposing proposed before/after card changes and new-card destinations for review. Begin scheduled writes only after validating that concrete output and resolving integration gaps. Track cost per run, processing lag, and duplicate/noisy writes during initial operation.
