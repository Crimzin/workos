import assert from "node:assert/strict";
import {
  buildThreadContextSheetMarkdown,
  mergeThreadContextSheetUpdate,
  selectThreadSheetForPrompt,
} from "./thread-context-sheet.ts";
import type { ThreadContextSheet } from "./types.ts";

const sheet: ThreadContextSheet = {
  id: "sheet-1",
  instance_id: "instance-1",
  thread_id: "thread-1",
  active_working: [
    {
      id: "active",
      statement: "We are comparing Roth conversion timing.",
      source_refs: [],
    },
  ],
  short_term: [
    {
      id: "source",
      statement: "Imported finance chat was useful last turn.",
      source_refs: [{ node_id: "finance-chat" }],
    },
  ],
  long_term: [
    {
      id: "durable",
      statement: "Balances may be stale; strategy is more durable.",
      source_refs: [],
    },
  ],
  markdown: "",
  metadata: {},
  created_at: "2026-06-30T12:00:00.000Z",
  updated_at: "2026-06-30T12:00:00.000Z",
};

assert.deepEqual(
  selectThreadSheetForPrompt(sheet).map((item) => item.id),
  ["active", "source", "durable"]
);

const updated = mergeThreadContextSheetUpdate(sheet, {
  activeWorking: [
    {
      id: "active-2",
      statement: "Now focusing on charitable giving.",
      source_refs: [],
    },
  ],
  shortTerm: [
    {
      id: "source",
      statement: "Imported finance chat was useful last turn.",
      source_refs: [{ node_id: "finance-chat" }],
    },
  ],
  longTerm: [
    {
      id: "durable",
      statement: "Balances may be stale; strategy is more durable.",
      source_refs: [],
    },
  ],
});

assert.deepEqual(
  updated.active_working.map((item) => item.id),
  ["active-2"]
);
assert.equal(updated.short_term.length, 1);
assert.equal(updated.long_term.length, 1);

const markdown = buildThreadContextSheetMarkdown(updated);
assert.match(markdown, /# Thread Context Sheet/);
assert.match(markdown, /## Active Working Memory/);
assert.match(markdown, /Now focusing on charitable giving/);
assert.match(markdown, /## Thread Long-Term Memory/);
assert.match(markdown, /Balances may be stale/);
