import assert from "node:assert/strict";
import {
  DEFAULT_MOBILE_NAV_OPEN,
  MOBILE_DRAWER_EDGE_WIDTH,
  getMobileDrawerSwipeIntent,
} from "./mobile-shell.ts";

assert.equal(DEFAULT_MOBILE_NAV_OPEN, true);
assert.equal(MOBILE_DRAWER_EDGE_WIDTH, 72);

assert.equal(
  getMobileDrawerSwipeIntent({
    drawerOpen: false,
    startX: 60,
    deltaX: 92,
    deltaY: 9,
  }),
  "open"
);

assert.equal(
  getMobileDrawerSwipeIntent({
    drawerOpen: false,
    startX: 104,
    deltaX: 120,
    deltaY: 4,
  }),
  "none"
);

assert.equal(
  getMobileDrawerSwipeIntent({
    drawerOpen: false,
    startX: 12,
    deltaX: 84,
    deltaY: 70,
  }),
  "none"
);

assert.equal(
  getMobileDrawerSwipeIntent({
    drawerOpen: true,
    startX: 260,
    deltaX: -88,
    deltaY: 12,
  }),
  "close"
);

assert.equal(
  getMobileDrawerSwipeIntent({
    drawerOpen: true,
    startX: 260,
    deltaX: -36,
    deltaY: 4,
  }),
  "none"
);
