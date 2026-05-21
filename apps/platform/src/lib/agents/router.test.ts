import assert from "node:assert/strict";
import {
  resolveRouteForMention,
  routeKindForCapabilities,
} from "./capabilities.ts";

assert.equal(routeKindForCapabilities(["chat", "code"]), "coding_plan");
assert.equal(routeKindForCapabilities(["chat"]), "inline_chat");

const disabledCodexRoute = resolveRouteForMention(
  { id: "codex-actor", name: "Codex" },
  ["chat", "code", "shell", "git"],
  ["inline_claude"]
);

assert.equal(disabledCodexRoute.providerKey, "codex");
assert.deepEqual(disabledCodexRoute.capabilities, ["chat"]);
assert.equal(disabledCodexRoute.kind, "inline_chat");

const enabledCodexRoute = resolveRouteForMention(
  { id: "codex-actor", name: "Codex" },
  ["chat", "code", "shell", "git"],
  ["codex"]
);

assert.equal(enabledCodexRoute.kind, "coding_plan");
