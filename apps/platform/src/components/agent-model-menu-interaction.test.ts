import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./posts-tab-content.tsx", import.meta.url),
  "utf8"
);

assert.equal(
  source.includes("onMouseLeave={() => setOpen(false)}"),
  false,
  "AgentModelMenu should not close on mouseleave; the absolute flyout sits outside the trigger box."
);

assert.match(
  source,
  /document\.addEventListener\("pointerdown"/,
  "AgentModelMenu should close from an outside pointerdown listener instead."
);
