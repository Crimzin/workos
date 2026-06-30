import assert from "node:assert/strict";
import { parseLlmJsonObject } from "./json.ts";

assert.deepEqual(parseLlmJsonObject('{"ok":true}'), { ok: true });
assert.deepEqual(parseLlmJsonObject('Here:\n```json\n{"score":0.9}\n```'), {
  score: 0.9,
});
assert.throws(
  () => parseLlmJsonObject("not json"),
  /LLM response did not contain a JSON object/,
);
assert.throws(
  () => parseLlmJsonObject("[1,2,3]"),
  /LLM response JSON was not an object/,
);
