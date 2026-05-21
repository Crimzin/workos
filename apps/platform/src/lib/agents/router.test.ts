import assert from "node:assert/strict";
import { routeKindForCapabilities } from "./capabilities";

assert.equal(routeKindForCapabilities(["chat", "code"]), "coding_plan");
assert.equal(routeKindForCapabilities(["chat"]), "inline_chat");
