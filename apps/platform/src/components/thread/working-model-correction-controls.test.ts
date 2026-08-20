import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./working-model-correction-controls.tsx", import.meta.url),
  "utf8"
);

assert.match(source, /This belief is wrong/);
assert.match(source, /Not relevant here/);
assert.match(source, /Undo/);
assert.match(source, /correctWorkingModelClaim/);
assert.match(source, /excludeWorkingModelClaimHere/);
assert.match(source, /clearWorkingModelOverride/);
assert.match(source, /aria-live="polite"/);
assert.doesNotMatch(source, /(?:bg|text|border)-\[#/);
