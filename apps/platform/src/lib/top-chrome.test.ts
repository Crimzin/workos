import assert from "node:assert/strict";
import {
  formatTopChromeCollapsed,
  getTopChromeToggleLabel,
  parseTopChromeCollapsed,
  TOP_CHROME_COLLAPSED_KEY,
} from "./top-chrome";

assert.equal(TOP_CHROME_COLLAPSED_KEY, "workos-top-chrome-collapsed");

assert.equal(parseTopChromeCollapsed(null), false);
assert.equal(parseTopChromeCollapsed("0"), false);
assert.equal(parseTopChromeCollapsed("1"), true);
assert.equal(parseTopChromeCollapsed("true"), false);

assert.equal(formatTopChromeCollapsed(true), "1");
assert.equal(formatTopChromeCollapsed(false), "0");

assert.equal(getTopChromeToggleLabel(false), "Collapse top chrome");
assert.equal(getTopChromeToggleLabel(true), "Expand top chrome");
