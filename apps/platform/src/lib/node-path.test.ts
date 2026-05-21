import assert from "node:assert/strict";
import {
  buildNodePathFromRows,
  type NodePathRow,
} from "./node-path";

const rows: NodePathRow[] = [
  { id: "pricing", title: "Pricing", type: "card", parent_id: "scope" },
  { id: "general", title: "General", type: "workspace", parent_id: null },
  { id: "scope", title: "Scope Design", type: "card", parent_id: "bugs" },
  { id: "bugs", title: "Bugs & Feature Requests", type: "stack", parent_id: "general" },
];

assert.deepEqual(
  buildNodePathFromRows("pricing", rows).map((row) => row.title),
  ["General", "Bugs & Feature Requests", "Scope Design", "Pricing"]
);

assert.deepEqual(buildNodePathFromRows("missing", rows), []);

const cyclicRows: NodePathRow[] = [
  { id: "a", title: "A", type: "card", parent_id: "b" },
  { id: "b", title: "B", type: "card", parent_id: "a" },
];

assert.throws(
  () => buildNodePathFromRows("a", cyclicRows),
  /Cycle detected while building node path/
);
