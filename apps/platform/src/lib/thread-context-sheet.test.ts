import assert from "node:assert/strict";
import {
  buildThreadContextSheetSeedUpdate,
  buildThreadContextSheetUpsertPayload,
  buildThreadContextSheetMarkdown,
  isMissingThreadContextSheetTableError,
  mergeThreadContextSheetUpdate,
  selectThreadSheetForPrompt,
  shouldUseThreadContextSheetForTurn,
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

const supersededUpdate = mergeThreadContextSheetUpdate(sheet, {
  longTerm: [
    {
      id: "durable",
      statement: "Balances may be stale; strategy is more durable.",
      source_refs: [],
      status: "superseded",
      updated_at: "2026-07-02T13:00:00.000Z",
    },
  ],
});

assert.equal(supersededUpdate.long_term.length, 1);
assert.equal(supersededUpdate.long_term[0].status, "superseded");
assert.deepEqual(
  selectThreadSheetForPrompt(supersededUpdate).map((item) => item.id),
  ["active", "source"]
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

const seededUpdate = buildThreadContextSheetSeedUpdate({
  currentText: "help me with financial planning",
  resolvedQuery: "personal financial planning cash runway housing marriage",
  decisions: [
    {
      sourceNodeId: "career-finance",
      sourceTitle: "Career and Finance Strategy",
      sourceRole: "core",
      confidence: 0.92,
      sourcePostId: "post-career",
      sourceMessageId: "message-career",
      usefulFacts: [
        "Runway, job search urgency, housing timing, and inheritance assumptions were discussed together.",
        "Apple stock transfer should not be treated as available until it lands.",
      ],
    },
    {
      sourceNodeId: "prenup",
      sourceTitle: "Evaluating a prenuptial agreement",
      sourceRole: "supporting",
      confidence: 0.86,
      sourcePostId: "post-prenup",
      sourceMessageId: "message-prenup",
      usefulFacts: [
        "Prenup planning may affect household obligations and financial planning.",
      ],
    },
    {
      sourceNodeId: "swarm",
      sourceTitle: "Swarm, Brainshare",
      sourceRole: "watchlist",
      confidence: 0.74,
      sourcePostId: "post-swarm",
      sourceMessageId: "message-swarm",
      usefulFacts: ["Token budgeting and context-router design were discussed."],
    },
  ],
  now: new Date("2026-07-02T12:00:00.000Z"),
});

assert.equal(seededUpdate.activeWorking?.length, 1);
assert.match(
  seededUpdate.activeWorking?.[0]?.statement ?? "",
  /Current focus: personal financial planning cash runway housing marriage/
);
assert.equal(seededUpdate.shortTerm?.length, 1);
assert.match(
  seededUpdate.shortTerm?.[0]?.statement ?? "",
  /Career and Finance Strategy \(core\)/
);
assert.match(
  seededUpdate.shortTerm?.[0]?.statement ?? "",
  /Swarm, Brainshare \(watchlist\)/
);
assert.deepEqual(
  seededUpdate.longTerm?.map((item) => item.statement),
  [
    'From "Career and Finance Strategy": Runway, job search urgency, housing timing, and inheritance assumptions were discussed together.',
    'From "Career and Finance Strategy": Apple stock transfer should not be treated as available until it lands.',
    'From "Evaluating a prenuptial agreement": Prenup planning may affect household obligations and financial planning.',
  ]
);
assert.deepEqual(seededUpdate.longTerm?.[0]?.source_refs, [
  {
    source_node_id: "career-finance",
    source_title: "Career and Finance Strategy",
    source_role: "core",
    confidence: 0.92,
    source_post_id: "post-career",
    source_message_id: "message-career",
  },
]);

const seededSheet = mergeThreadContextSheetUpdate(
  {
    ...sheet,
    active_working: [],
    short_term: [],
    long_term: [],
  },
  seededUpdate
);

assert.equal(
  shouldUseThreadContextSheetForTurn({
    resolvedQuery: "financial planning runway housing inheritance",
    sheet: seededSheet,
    activeAttachmentCount: 3,
  }),
  true
);
assert.equal(
  shouldUseThreadContextSheetForTurn({
    resolvedQuery: "MBA network opportunity cost",
    sheet: seededSheet,
    activeAttachmentCount: 3,
  }),
  false
);
assert.equal(
  shouldUseThreadContextSheetForTurn({
    resolvedQuery: "financial planning runway housing inheritance",
    sheet: seededSheet,
    activeAttachmentCount: 0,
  }),
  false
);

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
