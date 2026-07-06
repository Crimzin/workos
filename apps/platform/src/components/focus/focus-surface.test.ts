import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const surface = readFileSync("src/components/focus/focus-surface.tsx", "utf8");
const composer = readFileSync("src/components/focus/focus-composer.tsx", "utf8");
const page = readFileSync("src/app/focus/page.tsx", "utf8");
const sidebar = readFileSync("src/components/sidebar.tsx", "utf8");
const home = readFileSync("src/app/page.tsx", "utf8");

assert.match(surface, /export function FocusSurface/);
assert.match(surface, /FocusItemCard/);
assert.match(surface, /FocusComposer/);
assert.match(surface, /messages\.map/);
assert.match(page, /getFocusHomeData/);
assert.match(page, /FocusSurface/);
assert.match(composer, /setError/);
assert.match(composer, /Could not save/);
assert.match(composer, /await createFocusReply/);
assert.match(sidebar, /href="\/focus"/);
assert.match(sidebar, /label="Focus"/);
assert.match(home, /redirect\("\/focus"\)/);
