import assert from "node:assert/strict";
import {
  DEFAULT_WORKOS_TIME_ZONE,
  formatAbsoluteDateTime,
  formatPromptTimestamp,
  formatRelativeAge,
  formatTemporalContext,
  getElapsedGapLabel,
  getWorkOSNow,
} from "./time.ts";

const now = new Date("2026-06-22T16:43:00.000Z");

assert.equal(DEFAULT_WORKOS_TIME_ZONE, "America/New_York");

const clock = getWorkOSNow("America/Los_Angeles");
assert.ok(clock.instant instanceof Date);
assert.equal(clock.iso, clock.instant.toISOString());
assert.equal(clock.timeZone, "America/Los_Angeles");
assert.match(clock.label, /America\/Los_Angeles$/);

assert.equal(
  formatAbsoluteDateTime("2026-06-22T16:43:00.000Z"),
  "Monday, June 22, 2026 at 12:43 PM America/New_York"
);

assert.equal(
  formatTemporalContext(now),
  "Current WorkOS time: Monday, June 22, 2026 at 12:43 PM America/New_York."
);

assert.equal(
  formatRelativeAge("2026-06-22T16:42:30.000Z", now),
  "just now"
);
assert.equal(formatRelativeAge("2026-06-22T16:38:00.000Z", now), "5m ago");
assert.equal(formatRelativeAge("2026-06-22T15:43:00.000Z", now), "1h ago");
assert.equal(formatRelativeAge("2026-06-21T16:43:00.000Z", now), "1d ago");
assert.equal(formatRelativeAge("2026-03-21T16:43:00.000Z", now), "93d ago");
assert.equal(formatRelativeAge("2026-06-22T16:43:30.000Z", now), "in <1m");
assert.equal(formatRelativeAge("2026-06-22T16:48:00.000Z", now), "in 5m");
assert.equal(formatRelativeAge("2026-06-22T18:43:00.000Z", now), "in 2h");
assert.equal(formatRelativeAge("2026-06-25T16:43:00.000Z", now), "in 3d");

assert.equal(
  formatPromptTimestamp("2026-03-21T16:43:00.000Z", now),
  "Saturday, March 21, 2026 at 12:43 PM America/New_York - 93d ago"
);

assert.equal(
  getElapsedGapLabel(
    "2026-03-21T16:43:00.000Z",
    "2026-06-22T16:43:00.000Z"
  ),
  "93 days pass"
);
assert.equal(
  getElapsedGapLabel(
    "2026-06-21T16:43:00.000Z",
    "2026-06-22T16:43:00.000Z"
  ),
  null
);
assert.equal(
  getElapsedGapLabel("not-a-date", "2026-06-22T16:43:00.000Z"),
  null
);

assert.equal(
  formatAbsoluteDateTime("not-a-date"),
  "not-a-date"
);
