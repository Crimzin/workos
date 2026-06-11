import assert from "node:assert/strict";
import {
  COMPOSER_DEFAULT_MAX_HEIGHT,
  COMPOSER_SCROLL_AWAY_MULTIPLIER,
  COMPOSER_FIXED_MAX_HEIGHT,
  COMPOSER_FIXED_MIN_HEIGHT,
  clampComposerHeight,
  getNextComposerCompactState,
} from "./composer-resize";

assert.equal(COMPOSER_DEFAULT_MAX_HEIGHT, 192);
assert.equal(COMPOSER_SCROLL_AWAY_MULTIPLIER, 1.25);
assert.equal(clampComposerHeight(10), COMPOSER_FIXED_MIN_HEIGHT);
assert.equal(clampComposerHeight(999), COMPOSER_FIXED_MAX_HEIGHT);
assert.equal(clampComposerHeight(180), 180);

assert.equal(getNextComposerCompactState(false, 400, 400), false);
assert.equal(getNextComposerCompactState(false, 500, 400), false);
assert.equal(getNextComposerCompactState(false, 501, 400), true);

assert.equal(getNextComposerCompactState(true, 500, 400), true);
assert.equal(getNextComposerCompactState(true, 97, 400), true);
assert.equal(getNextComposerCompactState(true, 96, 400), false);
assert.equal(getNextComposerCompactState(false, 180, 260), false);
