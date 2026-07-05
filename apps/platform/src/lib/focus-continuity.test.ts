import assert from "node:assert/strict";
import { decideFocusBriefingTurn } from "./focus-continuity.ts";

const currentWindow = {
  mode: "morning" as const,
  windowKey: "morning:2026-07-07",
  localDate: "2026-07-07",
  localHour: 9,
  localWeekday: 2,
  timeZone: "America/New_York",
};

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "morning:2026-07-07",
      mode: "morning",
      lastMessageAt: "2026-07-07T13:00:00.000Z",
    },
    triggers: {},
  }).action,
  "resume"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: null,
    triggers: {},
  }).reason,
  "no_active_session"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "midday:2026-07-07",
      mode: "midday",
      lastMessageAt: "2026-07-07T17:00:00.000Z",
    },
    triggers: {},
  }).reason,
  "planning_window_changed"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "morning:2026-07-07",
      mode: "morning",
      lastMessageAt: "2026-07-07T13:00:00.000Z",
    },
    triggers: { userRequestedReplan: true },
  }).reason,
  "user_requested_replan"
);

assert.equal(
  decideFocusBriefingTurn({
    currentWindow,
    activeSession: {
      id: "session-1",
      windowKey: "morning:2026-07-07",
      mode: "morning",
      lastMessageAt: "2026-07-07T13:00:00.000Z",
    },
    triggers: { materialCalendarChange: true },
  }).reason,
  "material_calendar_change"
);
