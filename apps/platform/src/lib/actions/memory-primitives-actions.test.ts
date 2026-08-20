import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./memory-primitives.ts", import.meta.url),
  "utf8"
);

assert.match(source, /conviction_posture:\s*tentative \? "ask" : "assert"/);
assert.match(source, /human_signal:\s*"explicit_statement"/);
assert.match(
  source,
  /updateMemoryPrimitive[\s\S]+correctWorkingModelClaim\([\s\S]+Updated from the legacy Memory editor\./,
  "material legacy edits must use supersession instead of overwriting statements"
);

const deleteAction = source.slice(source.indexOf("export async function deleteMemoryPrimitive"));
assert.match(deleteAction, /correctWorkingModelClaim\(/);
assert.doesNotMatch(
  deleteAction,
  /from\("memory_primitives"\)[\s\S]{0,120}\.delete\(/,
  "legacy deletion must retract instead of destructively deleting the claim"
);
