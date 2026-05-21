// Focused assertions for the platform TypeScript harness. These files are
// typechecked with `npx tsc --noEmit --project apps/platform/tsconfig.json`.
import assert from "node:assert/strict";
import {
  resolveRouteForMention,
  routeKindForCapabilities,
} from "./capabilities";

assert.equal(routeKindForCapabilities(["chat", "code"]), "coding_plan");
assert.equal(routeKindForCapabilities(["chat"]), "inline_chat");

const disabledCodexRoute = resolveRouteForMention(
  { id: "codex-actor", name: "Codex" },
  ["chat", "code", "shell", "git"],
  { enabledProviderKeys: ["inline_claude"] }
);

assert.equal(disabledCodexRoute.providerKey, "codex");
assert.deepEqual(disabledCodexRoute.capabilities, ["chat"]);
assert.equal(disabledCodexRoute.kind, "inline_chat");
