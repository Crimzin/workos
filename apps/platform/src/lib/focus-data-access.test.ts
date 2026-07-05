import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const focus = readFileSync("src/lib/focus.ts", "utf8");
const actions = readFileSync("src/lib/actions/focus.ts", "utf8");

assert.match(focus, /export async function getFocusHomeData/);
assert.match(focus, /ensureFocusSession/);
assert.match(focus, /decideFocusBriefingTurn/);
assert.match(focus, /buildFocusBriefingDraft/);
assert.match(focus, /onConflict: "instance_id,actor_id,window_key"/);
assert.doesNotMatch(focus, /unstable_cache/);
assert.match(focus, /focus_item_threads/);
assert.match(focus, /thread:nodes\(id,title,type\)/);

assert.match(actions, /export async function createFocusReply/);
assert.match(actions, /insertFocusMessage/);
assert.match(actions, /role: "user"/);
assert.match(actions, /role: "workos"/);
assert.match(actions, /revalidatePath\("\/focus"\)/);
