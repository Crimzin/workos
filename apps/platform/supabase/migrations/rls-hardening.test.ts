import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const migrationsDir = new URL(".", import.meta.url);
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort();

interface MigrationSql {
  file: string;
  sql: string;
}

const migrations: MigrationSql[] = migrationFiles.map((file) => ({
  file,
  sql: readFileSync(join(migrationsDir.pathname, file), "utf8"),
}));

const createdTables = new Map<string, number>();

for (const [index, { sql }] of migrations.entries()) {
  for (const match of sql.matchAll(
    /create\s+table(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*)/gi
  )) {
    createdTables.set(match[1], index);
  }
}

const hardeningMigration = migrationFiles.find((file) =>
  /rls|security|hardening/i.test(file)
);

assert.ok(
  hardeningMigration,
  "Expected a security hardening migration for public table RLS"
);

const hardeningSql = readFileSync(
  join(migrationsDir.pathname, hardeningMigration),
  "utf8"
);

for (const [fileIndex, { file, sql }] of migrations.entries()) {
  for (const match of sql.matchAll(
    /alter\s+table\s+([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi
  )) {
    const createdAt = createdTables.get(match[1]);
    assert.ok(
      createdAt === undefined || createdAt <= fileIndex,
      `${file} must not enable RLS on future table ${match[1]}`
    );
  }
}

for (const [table, createdAt] of [...createdTables.entries()].sort()) {
  const enablePattern = new RegExp(
    `alter\\s+table\\s+${table}\\s+enable\\s+row\\s+level\\s+security`,
    "i"
  );
  const enablingMigration = migrations
    .slice(createdAt)
    .find(({ sql }) => enablePattern.test(sql));

  assert.ok(
    enablingMigration,
    `${table} must enable RLS in ${migrationFiles[createdAt]} or a later migration`
  );
}

assert.match(
  hardeningSql,
  /alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+all\s+on\s+tables\s+from\s+anon,\s*authenticated/i,
  `${basename(hardeningMigration)} must revoke future public table grants`
);
