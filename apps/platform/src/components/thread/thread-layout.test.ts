import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const threadSurface = readFileSync(
  new URL("./thread-surface.tsx", import.meta.url),
  "utf8"
);
const contextPanel = readFileSync(
  new URL("./context-panel.tsx", import.meta.url),
  "utf8"
);
const nodeDetailTabs = readFileSync(
  new URL("../node-detail-tabs.tsx", import.meta.url),
  "utf8"
);

assert.match(
  threadSurface,
  /<main className="flex h-full min-h-0 overflow-hidden bg-bg-primary">/,
  "thread surface should prevent outer page scrolling so chat and side panel scroll independently"
);

assert.match(
  threadSurface,
  /<div className="min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">/,
  "thread content column should be a constrained flex column"
);

assert.match(
  threadSurface,
  /pinIdentityHeader/,
  "thread surface should opt into a pinned chat header"
);

assert.match(
  nodeDetailTabs,
  /pinIdentityHeader/,
  "node detail tabs should expose opt-in pinned identity header behavior"
);

assert.match(
  nodeDetailTabs,
  /sticky top-0 z-30 bg-bg-primary/,
  "pinned identity header should stay above the chat while the chat scrolls"
);

assert.match(
  contextPanel,
  /md:sticky md:top-0/,
  "right context panel should stay pinned to the top on desktop"
);

assert.match(
  contextPanel,
  /^"use client";/,
  "right context panel should be interactive for collapse and resize"
);

assert.match(
  contextPanel,
  /aria-label="Toggle context panel"/,
  "right context panel should have a top collapse toggle"
);

assert.match(
  contextPanel,
  /aria-label="Resize context panel"/,
  "right context panel should expose a left-edge resize handle"
);

assert.match(
  contextPanel,
  /min-h-0 flex-1 overflow-y-auto/,
  "right context panel body should own its vertical scroll"
);

assert.match(
  contextPanel,
  /overscroll-contain/,
  "right context panel should not chain scroll into the main chat area"
);
