import assert from "node:assert/strict";
import {
  buildPostTurnMemoryExtractionPrompt,
  extractThreadContextSheetPostTurnUpdate,
  parsePostTurnMemoryExtraction,
} from "./thread-context-extractor.ts";
import type { ThreadContextSheet } from "./types.ts";

const existingSheet: ThreadContextSheet = {
  id: "sheet-1",
  instance_id: "instance-1",
  thread_id: "thread-1",
  active_working: [
    {
      id: "active-old",
      statement: "Current focus: financial planning.",
      source_refs: [],
      status: "active",
    },
  ],
  short_term: [],
  long_term: [
    {
      id: "old-runway",
      statement: "From \"Career and Finance Strategy\": Runway was 6-8 weeks.",
      source_refs: [{ source_node_id: "career-finance" }],
      status: "active",
    },
  ],
  markdown: "",
  metadata: {},
  created_at: "2026-07-02T12:00:00.000Z",
  updated_at: "2026-07-02T12:00:00.000Z",
};

const prompt = buildPostTurnMemoryExtractionPrompt({
  threadTitle: "Finances",
  userText:
    "Actually my cash is now $42k and burn is closer to $7k/month. I want to plan runway first.",
  assistantText:
    "That updates the runway picture: about six months of cash before touching investments. The next focus is runway planning.",
  existingSheet,
  attachedContextFacts: [
    {
      sourceTitle: "Career and Finance Strategy",
      sourceRole: "core",
      facts: [
        "Apple stock transfer should not be treated as available until it lands.",
      ],
    },
  ],
});

assert.match(prompt.system, /Return strict JSON only/);
assert.match(prompt.user, /old-runway/);
assert.match(prompt.user, /Apple stock transfer/);
assert.ok(prompt.user.length < 8000);

const parsed = parsePostTurnMemoryExtraction(
  JSON.stringify({
    active_working: [
      "Current focus: runway planning with updated cash and burn.",
    ],
    short_term: [
      "The next useful step is to update cash, income, and burn assumptions before modeling housing or investments.",
    ],
    long_term: [
      "Current cash is now $42k and monthly burn is closer to $7k.",
      "Apple stock transfer should not be treated as available until it lands.",
    ],
    superseded_long_term_ids: ["old-runway"],
  }),
  {
    existingSheet,
    now: new Date("2026-07-02T12:30:00.000Z"),
  }
);

assert.equal(parsed.activeWorking?.length, 1);
assert.equal(parsed.shortTerm?.length, 1);
assert.equal(parsed.longTerm?.length, 3);
assert.equal(
  parsed.longTerm?.find((item) => item.id === "old-runway")?.status,
  "superseded"
);
assert.deepEqual(
  parsed.longTerm
    ?.filter((item) => item.status !== "superseded")
    .map((item) => item.statement),
  [
    "Current cash is now $42k and monthly burn is closer to $7k.",
    "Apple stock transfer should not be treated as available until it lands.",
  ]
);

const invalid = parsePostTurnMemoryExtraction("not json", {
  existingSheet,
  now: new Date("2026-07-02T12:40:00.000Z"),
});
assert.deepEqual(invalid, {});

async function main() {
  const extracted = await extractThreadContextSheetPostTurnUpdate(
    {
      threadTitle: "Finances",
      userText: "My current cash is now $42k.",
      assistantText: "Use $42k as the current cash baseline.",
      existingSheet,
      attachedContextFacts: [],
      now: new Date("2026-07-02T12:35:00.000Z"),
    },
    async () =>
      JSON.stringify({
        active_working: ["Current focus: runway planning."],
        short_term: [],
        long_term: ["Current cash is now $42k."],
        superseded_long_term_ids: [],
      })
  );

  assert.deepEqual(
    extracted.longTerm
      ?.filter((item) => item.status !== "superseded")
      .map((item) => item.statement),
    ["Current cash is now $42k."]
  );
}

main().catch((err: unknown) => {
  throw err;
});
