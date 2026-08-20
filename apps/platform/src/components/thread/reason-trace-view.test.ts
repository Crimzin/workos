import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./reason-trace-view.tsx", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /snapshot\.answer\.anchors\.flatMap\(\(anchor\) => anchor\.belief_refs\)/,
  "Rested on must be derived from answer-anchor belief references"
);
assert.match(source, /restedOnClaims\.map/);
assert.match(source, /Also available in context/);
