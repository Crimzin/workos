import assert from "node:assert/strict";
import {
  buildThreadContextSheetUpsertPayload,
  buildThreadContextSheetMarkdown,
  isMissingThreadContextSheetTableError,
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

const partialUpdate = mergeThreadContextSheetUpdate(sheet, {
  activeWorking: [
    {
      id: "active-3",
      statement: "The current task moved to withdrawal sequencing.",
      source_refs: [],
    },
  ],
});

assert.deepEqual(
  partialUpdate.short_term.map((item) => item.id),
  ["source"]
);
assert.deepEqual(
  partialUpdate.long_term.map((item) => item.id),
  ["durable"]
);

const payload = buildThreadContextSheetUpsertPayload({
  instanceId: "instance-1",
  threadId: "thread-1",
  existingSheet: sheet,
  update: {
    activeWorking: [
      {
        id: "active-4",
        statement: "Only the active working band changed.",
        source_refs: [],
      },
    ],
  },
});

assert.deepEqual(
  payload.short_term.map((item) => item.id),
  ["source"]
);
assert.deepEqual(
  payload.long_term.map((item) => item.id),
  ["durable"]
);
assert.match(payload.markdown, /Only the active working band changed/);
assert.match(payload.markdown, /Imported finance chat was useful last turn/);

const markdown = buildThreadContextSheetMarkdown(updated);
assert.match(markdown, /# Thread Context Sheet/);
assert.match(markdown, /## Active Working Memory/);
assert.match(markdown, /Now focusing on charitable giving/);
assert.match(markdown, /## Thread Long-Term Memory/);
assert.match(markdown, /Balances may be stale/);

assert.equal(
  isMissingThreadContextSheetTableError({
    code: "PGRST205",
    message: "Could not find the table 'public.thread_context_sheets' in the schema cache",
  }),
  true
);
assert.equal(
  isMissingThreadContextSheetTableError({
    code: "PGRST205",
    message: "Could not find the table 'public.other_table' in the schema cache",
  }),
  false
);
