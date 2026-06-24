import assert from "node:assert/strict";
import {
  buildNodeMentionCandidates,
  findNodeMentions,
  limitNodeMentions,
  type NodeMentionSearchRow,
} from "./node-mentions";

const body = JSON.stringify([
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Use ", styles: {} },
      {
        type: "nodeMention",
        props: { id: "card-1", title: "Pricing rewrite", type: "card" },
      },
      { type: "text", text: " and ", styles: {} },
      {
        type: "nodeMention",
        props: { id: "stack-1", title: "Launch plan", nodeType: "stack" },
      },
    ],
  },
  {
    type: "bulletListItem",
    children: [
      {
        type: "paragraph",
        content: [
          {
            type: "nodeMention",
            props: { id: "card-1", title: "Pricing rewrite", type: "card" },
          },
        ],
      },
    ],
  },
]);

assert.deepEqual(findNodeMentions(body), [
  { id: "card-1", title: "Pricing rewrite", type: "card" },
  { id: "stack-1", title: "Launch plan", type: "stack" },
]);

assert.deepEqual(findNodeMentions("not json"), []);

const limited = limitNodeMentions(
  [
    { id: "1", title: "One", type: "card" },
    { id: "2", title: "Two", type: "card" },
    { id: "3", title: "Three", type: "card" },
  ],
  2
);
assert.deepEqual(limited.included.map((item) => item.id), ["1", "2"]);
assert.equal(limited.omittedCount, 1);

const rows: NodeMentionSearchRow[] = [
  { id: "workspace", title: "WorkOS", type: "workspace", parent_id: null },
  { id: "stack", title: "BrainShare", type: "stack", parent_id: "workspace" },
  { id: "card", title: "Context routing", type: "card", parent_id: "stack" },
  { id: "other", title: "Finance", type: "stack", parent_id: "workspace" },
];

assert.deepEqual(buildNodeMentionCandidates(rows, "context", 10), [
  {
    id: "card",
    title: "Context routing",
    type: "card",
    path: "WorkOS / BrainShare / Context routing",
  },
]);

assert.deepEqual(
  buildNodeMentionCandidates(rows, "", 2).map((candidate) => candidate.id),
  ["workspace", "stack"]
);

const mentionRows: NodeMentionSearchRow[] = [
  { id: "script", title: "Campaign Reporting SQL Cleanup", type: "stack", parent_id: null },
  { id: "other-script", title: "SQL Export Draft", type: "stack", parent_id: null },
];

assert.equal(
  buildNodeMentionCandidates(mentionRows, "cleanup campaign", 5)[0].id,
  "script"
);
assert.equal(
  buildNodeMentionCandidates(mentionRows, "SQL Campaign Reporting Cleanup", 5)[0].id,
  "script"
);
