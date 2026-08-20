import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/0034_working_model_reason_traces.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(sql, /create table if not exists memory_primitive_evidence/i);
assert.match(sql, /create table if not exists memory_primitive_edges/i);
assert.match(sql, /create table if not exists context_retrieval_overrides/i);
assert.match(sql, /create table if not exists reason_traces/i);
assert.match(
  sql,
  /response_post_id\s+uuid\s+references posts\(id\) on delete set null/i
);
assert.match(
  sql,
  /create unique index[\s\S]+context_retrieval_overrides[\s\S]+where cleared_at is null/i
);
assert.match(sql, /raise exception 'reason traces are immutable'/i);
assert.match(sql, /raise exception 'memory evidence is append-only'/i);
assert.match(sql, /alter table reason_traces enable row level security/i);
assert.match(sql, /create or replace function rpc_correct_memory_primitive/i);
assert.match(sql, /human_signal[\s\S]+explicit_correction/i);
assert.match(sql, /relationship_kind[\s\S]+revises/i);
assert.match(sql, /status = 'superseded'/i);
assert.match(sql, /status = 'retracted'/i);
assert.match(sql, /invalid_upstream_assumption/i);
assert.match(
  sql,
  /insert into workos_events[\s\S]+memory\.corrected/i,
  "the correction event must commit in the same transaction as the claim change"
);
assert.match(
  sql,
  /if tg_op = 'DELETE'[\s\S]+not exists[\s\S]+from instances/i,
  "account deletion cascades must bypass ordinary immutability guards"
);
