import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dirname, "0028_import_and_continuation.sql"),
  "utf8"
);

assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+import_sessions/i);
assert.match(
  sql,
  /source_apps\s+text\[\]\s+not\s+null\s+default\s+'\{\}'::text\[\]\s+check\s+\(source_apps\s+<@\s+array\['claude',\s*'chatgpt',\s*'unknown'\]::text\[\]\)/i
);
assert.match(
  sql,
  /create\s+table\s+if\s+not\s+exists\s+thread_context_attachments/i
);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*source_kind/i);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*source_app/i);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*imported_visibility/i);
assert.match(sql, /alter\s+table\s+nodes[\s\S]*suggestion_status/i);
assert.match(
  sql,
  /source_app\s+text\s+check\s+\(source_app\s+is\s+null\s+or\s+source_app\s+in\s+\('workos',\s*'claude',\s*'chatgpt',\s*'unknown'\)\)/i
);
assert.match(sql, /status\s+text\s+not\s+null\s+default\s+'active'/i);
assert.match(sql, /unique\s*\(thread_id,\s*context_source_node_id\)/i);
assert.match(
  sql,
  /create\s+index\s+if\s+not\s+exists\s+nodes_imported_chats_idx/i
);
assert.match(
  sql,
  /create\s+unique\s+index\s+if\s+not\s+exists\s+nodes_source_conversation_idx\s+on\s+nodes\s*\(\s*instance_id,\s*source_app,\s*source_conversation_id\s*\)/i
);
assert.match(
  sql,
  /create\s+index\s+if\s+not\s+exists\s+thread_context_active_idx/i
);
assert.match(sql, /alter\s+table\s+import_sessions\s+enable\s+row\s+level\s+security/i);
assert.match(
  sql,
  /alter\s+table\s+thread_context_attachments\s+enable\s+row\s+level\s+security/i
);
assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i);
