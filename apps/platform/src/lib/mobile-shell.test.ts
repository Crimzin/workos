import assert from "node:assert/strict";
import {
  MOBILE_DRAWER_EDGE_WIDTH,
  getMobileDrawerSwipeIntent,
} from "./mobile-shell.ts";

assert.equal(MOBILE_DRAWER_EDGE_WIDTH, 28);

assert.equal(
  getMobileDrawerSwipeIntent({
    drawerOpen: false,
    startX: 16,
    deltaX: 92,
    deltaY: 9,
  }),
  "open"
);

assert.equal(
  getMobileDrawerSwipeIntent({
    drawerOpen: false,
    startX: 80,
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
