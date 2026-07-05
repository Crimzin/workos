import assert from "node:assert/strict";
import {
  classifyFocusWindow,
  focusWindowTitle,
  localDateKey,
} from "./focus-windows.ts";

assert.equal(
  localDateKey(new Date("2026-07-06T13:00:00.000Z"), "America/New_York"),
  "2026-07-06"
);

const mondayMorning = classifyFocusWindow(
  new Date("2026-07-06T13:00:00.000Z"),
  "America/New_York"
);
assert.equal(mondayMorning.mode, "weekly");
assert.equal(mondayMorning.windowKey, "weekly:2026-07-06");
assert.equal(focusWindowTitle(mondayMorning), "Weekly Focus");

const tuesdayMorning = classifyFocusWindow(
  new Date("2026-07-07T13:30:00.000Z"),
  "America/New_York"
);
assert.equal(tuesdayMorning.mode, "morning");
assert.equal(tuesdayMorning.windowKey, "morning:2026-07-07");

const midday = classifyFocusWindow(
  new Date("2026-07-07T17:15:00.000Z"),
  "America/New_York"
);
assert.equal(midday.mode, "midday");
assert.equal(midday.windowKey, "midday:2026-07-07");

const endOfDay = classifyFocusWindow(
  new Date("2026-07-07T21:45:00.000Z"),
  "America/New_York"
);
assert.equal(endOfDay.mode, "end_of_day");
assert.equal(endOfDay.windowKey, "end_of_day:2026-07-07");

const friday = classifyFocusWindow(
  new Date("2026-07-10T19:00:00.000Z"),
  "America/New_York"
);
assert.equal(friday.mode, "friday_reflection");
assert.equal(friday.windowKey, "friday_reflection:2026-07-10");
