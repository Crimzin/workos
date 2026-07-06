import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/0033_focus_foundation.sql",
  "utf8"
);

for (const required of [
  "create table if not exists focus_sessions",
  "create table if not exists focus_messages",
  "create table if not exists focus_items",
  "create table if not exists focus_item_threads",
  "mode text not null",
  "window_key text not null",
  "role text not null",
  "message_kind text not null",
  "dedupe_key text",
  "anchor_status text not null default 'anchored'",
  "thread_role text not null default 'primary'",
  "unique(instance_id, actor_id, window_key)",
  "unique(id, instance_id)",
  "unique(focus_session_id, message_kind, dedupe_key)",
  "unique(focus_session_id, dedupe_key)",
  "unique(focus_item_id, thread_id)",
  "constraint focus_messages_session_instance_fk",
  "constraint focus_items_session_instance_fk",
  "create or replace function rpc_upsert_focus_item_with_threads",
  "alter table focus_sessions enable row level security",
  "alter table focus_messages enable row level security",
  "alter table focus_items enable row level security",
  "alter table focus_item_threads enable row level security",
]) {
  assert.match(
    sql,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
}

assert.match(
  sql,
  /check \(mode in \('weekly', 'morning', 'midday', 'end_of_day', 'friday_reflection', 'ad_hoc'\)\)/
);
assert.match(sql, /check \(role in \('user', 'workos', 'system'\)\)/);
assert.match(
  sql,
  /check \(message_kind in \('briefing', 'reply', 'status', 'repair_prompt'\)\)/
);
assert.match(
  sql,
  /check \(status in \('proposed', 'accepted', 'deferred', 'dismissed', 'completed'\)\)/
);
assert.match(
  sql,
  /check \(anchor_status in \('anchored', 'needs_thread', 'dismissed'\)\)/
);
assert.match(sql, /create index if not exists focus_sessions_instance_active_idx/);
assert.match(sql, /create index if not exists focus_messages_session_created_idx/);
assert.match(sql, /create index if not exists focus_items_session_rank_idx/);
assert.match(sql, /create index if not exists focus_item_threads_thread_idx/);
assert.match(sql, /notify pgrst, 'reload schema'/);
