import assert from "node:assert/strict";
import { isAgentRunConfirmation } from "./confirmation.ts";

for (const text of [
  "go",
  "GO",
  "go.",
  "go!",
  " yes ",
  "Yep!",
  "do it",
  "Proceed.",
  "start!",
]) {
  assert.equal(isAgentRunConfirmation(text), true, text);
}

for (const text of [
  "",
  "go?",
  "yes please",
  "go look at settings later",
  "do it tomorrow",
  "start when ready",
  "proceed with caution",
  "yep yep",
]) {
  assert.equal(isAgentRunConfirmation(text), false, text);
}
