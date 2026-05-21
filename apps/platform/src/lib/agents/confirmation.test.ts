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
  "great. go!",
  "great, go",
  "@Codex go!",
  "@Claude Code proceed",
  "@Codex great. go!",
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
  "@Codex ^",
  "@Codex can you make this change?",
  "go look at settings later",
]) {
  assert.equal(isAgentRunConfirmation(text), false, text);
}
