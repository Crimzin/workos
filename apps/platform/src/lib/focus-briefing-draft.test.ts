import assert from "node:assert/strict";
import { buildFocusBriefingDraft } from "./focus-briefing-draft.ts";

const draft = buildFocusBriefingDraft({
  window: {
    mode: "weekly",
    windowKey: "weekly:2026-07-06",
    localDate: "2026-07-06",
    localHour: 9,
    localWeekday: 1,
    timeZone: "America/New_York",
  },
  actorName: "Will",
  candidateThreads: [
    {
      id: "thread-workos",
      title: "WorkOS Focus V1",
      updated_at: "2026-07-05T20:00:00.000Z",
    },
    {
      id: "thread-saglo",
      title: "Saglo engagement",
      updated_at: "2026-07-04T20:00:00.000Z",
    },
  ],
});

assert.match(draft.body, /Happy Monday/);
assert.match(draft.body, /WorkOS Focus V1/);
assert.match(draft.body, /Saglo engagement/);
assert.equal(draft.items.length, 2);
assert.deepEqual(draft.items.map((item) => item.threadIds), [
  ["thread-workos"],
  ["thread-saglo"],
]);
assert.equal(draft.items[0].anchorStatus, "anchored");

const lowContext = buildFocusBriefingDraft({
  window: {
    mode: "morning",
    windowKey: "morning:2026-07-07",
    localDate: "2026-07-07",
    localHour: 9,
    localWeekday: 2,
    timeZone: "America/New_York",
  },
  actorName: "Will",
  candidateThreads: [],
});

assert.match(lowContext.body, /I do not have enough active threads/);
assert.equal(lowContext.items.length, 1);
assert.equal(lowContext.items[0].anchorStatus, "needs_thread");
assert.deepEqual(lowContext.items[0].threadIds, []);
