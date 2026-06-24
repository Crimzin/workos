import assert from "node:assert/strict";
import {
  buildBoardDetailTrail,
  buildThreadIdentityTrail,
  getHeaderBadges,
} from "./detail-header";

const boardTrail = buildBoardDetailTrail({
  ancestors: [
    { id: "workspace-1", title: "AI coaching business", type: "workspace" },
    { id: "stack-1", title: "Discovery stack", type: "stack" },
  ],
  current: { id: "card-1", title: "Discovery with Giselle", type: "card" },
  workspaceId: "workspace-1",
});

assert.deepEqual(
  boardTrail.map((item) => item.title),
  ["AI coaching business", "Discovery stack", "Discovery with Giselle"]
);
assert.equal(boardTrail.at(-1)?.isCurrent, true);
assert.equal(boardTrail.at(-1)?.href, null);
assert.equal(boardTrail[0]?.href, "/board");
assert.equal(boardTrail[1]?.href, "/board?d=stack-1");

const threadTrail = buildThreadIdentityTrail({
  path: [
    { id: "workspace-1", title: "AI coaching business", type: "workspace" },
    { id: "card-1", title: "Discovery with Giselle", type: "card" },
  ],
  current: { id: "card-1", title: "Discovery with Giselle", type: "card" },
});

assert.equal(threadTrail[0]?.href, "/n/workspace-1");
assert.equal(threadTrail[1]?.href, null);
assert.equal(threadTrail[1]?.isCurrent, true);

assert.deepEqual(
  getHeaderBadges(
    [
      {
        id: "status",
        color: "badge-4",
        name: "Status",
        field_type: "single_select",
        options: [{ id: "active", name: "In Progress" }],
      },
    ],
    [{ field_id: "status", option_id: "active" }]
  ),
  [
    {
      id: "status:active",
      fieldId: "status",
      fieldName: "Status",
      fieldType: "single_select",
      optionId: "active",
      name: "In Progress",
      color: "badge-4",
      selectedOptionIds: ["active"],
      options: [{ id: "active", name: "In Progress" }],
    },
  ]
);
