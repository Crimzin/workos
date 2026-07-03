import assert from "node:assert/strict";
import {
  contextSourceProvenanceForNode,
  contextSourceProvenanceLabel,
} from "./provenance.ts";

assert.deepEqual(
  contextSourceProvenanceForNode({
    sourceApp: null,
    sourceKind: null,
  }),
  {
    sourceApp: "workos",
    sourceKind: "global",
    sourceOrigin: "workos",
    sourceProvenance: "WorkOS thread",
  }
);

assert.deepEqual(
  contextSourceProvenanceForNode({
    sourceApp: "claude",
    sourceKind: "imported_ai_chat",
  }),
  {
    sourceApp: "claude",
    sourceKind: "imported",
    sourceOrigin: "imported",
    sourceProvenance: "Claude import",
  }
);

assert.deepEqual(
  contextSourceProvenanceForNode({
    sourceApp: "chatgpt",
    sourceKind: "imported_ai_chat",
  }),
  {
    sourceApp: "chatgpt",
    sourceKind: "imported",
    sourceOrigin: "imported",
    sourceProvenance: "ChatGPT import",
  }
);

assert.equal(
  contextSourceProvenanceLabel({
    sourceApp: "unknown",
    sourceOrigin: "imported",
  }),
  "Imported chat"
);
