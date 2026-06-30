import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/0030_context_memory_and_sheets.sql",
  "utf8",
);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const required of [
  "create table if not exists account_memory_records",
  "category text not null",
  "sensitivity_label text not null default 'normal'",
  "status text not null default 'active'",
  "source_refs jsonb not null default '[]'::jsonb",
  "supersedes_memory_id uuid references account_memory_records(id)",
  "create table if not exists thread_context_sheets",
  "thread_id uuid not null references nodes(id) on delete cascade",
  "long_term jsonb not null default '[]'::jsonb",
  "short_term jsonb not null default '[]'::jsonb",
  "active_working jsonb not null default '[]'::jsonb",
  "alter table agent_runs",
  "add column if not exists current_stage text",
  "add column if not exists prompt_manifest jsonb not null default '{}'::jsonb",
]) {
  assert.match(sql, new RegExp(escapeRegex(required)));
}

assert.match(sql, /check \(category in \('identity', 'role', 'current_project'/);
assert.match(
  sql,
  /check \(status in \('active', 'tentative', 'superseded', 'retracted'\)\)/,
);
assert.match(
  sql,
  /create index if not exists account_memory_records_instance_status_idx/,
);
assert.match(
  sql,
  /create unique index if not exists thread_context_sheets_thread_idx/,
);
assert.match(
  sql,
  /alter table account_memory_records enable row level security/,
);
assert.match(
  sql,
  /alter table thread_context_sheets enable row level security/,
);
