import assert from "node:assert/strict";
import {
  buildFieldValueChangeMetadata,
  buildWorkOSEventInsert,
} from "./events.ts";

const event = buildWorkOSEventInsert({
  instanceId: "instance-1",
  workspaceId: "workspace-1",
  nodeId: "node-1",
  actorId: "actor-1",
  eventType: "field.value_changed",
  subjectType: "field",
  subjectId: "field-1",
  summary: "Will changed Status from Backlog to In Progress.",
  metadata: { field_name: "Status" },
  occurredAt: "2026-06-22T16:43:00.000Z",
});

assert.deepEqual(event, {
  instance_id: "instance-1",
  workspace_id: "workspace-1",
  node_id: "node-1",
  actor_id: "actor-1",
  event_type: "field.value_changed",
  subject_type: "field",
  subject_id: "field-1",
  summary: "Will changed Status from Backlog to In Progress.",
  metadata: { field_name: "Status" },
  occurred_at: "2026-06-22T16:43:00.000Z",
});

const minimalEvent = buildWorkOSEventInsert({
  instanceId: "instance-1",
  eventType: "node.created",
  subjectType: "node",
});

assert.deepEqual(minimalEvent, {
  instance_id: "instance-1",
  workspace_id: null,
  node_id: null,
  actor_id: null,
  event_type: "node.created",
  subject_type: "node",
  subject_id: null,
  summary: null,
  metadata: {},
});
assert.equal("occurred_at" in minimalEvent, false);

assert.deepEqual(
  buildFieldValueChangeMetadata({
    fieldId: "field-1",
    fieldName: "Status",
    previousValues: ["Backlog"],
    nextValues: ["In Progress"],
  }),
  {
    field_id: "field-1",
    field_name: "Status",
    previous_values: ["Backlog"],
    next_values: ["In Progress"],
  }
);

assert.deepEqual(
  buildFieldValueChangeMetadata({
    fieldId: "field-2",
    previousValues: [],
    nextValues: [],
  }),
  {
    field_id: "field-2",
    previous_values: [],
    next_values: [],
  }
);
