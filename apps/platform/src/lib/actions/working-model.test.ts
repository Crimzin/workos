import assert from "node:assert/strict";
import {
  buildClearWorkingModelOverrideUpdate,
  buildCorrectedThreadSheetUpdate,
  buildCorrectWorkingModelClaimRpcArgs,
  buildWorkingModelExclusionInsert,
} from "./working-model-payloads.ts";
import type { ThreadContextSheet } from "../types.ts";

assert.deepEqual(
  buildCorrectWorkingModelClaimRpcArgs({
    claimId: "claim-1",
    actorId: "actor-1",
    workspaceId: "workspace-1",
    replacementStatement: "  Ship trace inspection first.  ",
    reason: "  The earlier wording overstates the decision.  ",
  }),
  {
    p_claim_id: "claim-1",
    p_actor_id: "actor-1",
    p_workspace_id: "workspace-1",
    p_replacement_statement: "Ship trace inspection first.",
    p_replacement_body: null,
    p_replace_body: false,
    p_replacement_status: null,
    p_reason: "The earlier wording overstates the decision.",
  }
);

assert.deepEqual(
  buildCorrectWorkingModelClaimRpcArgs({
    claimId: "claim-1",
    actorId: "actor-1",
    workspaceId: "workspace-1",
    replacementStatement: "  ",
    reason: "This is no longer true.",
  }),
  {
    p_claim_id: "claim-1",
    p_actor_id: "actor-1",
    p_workspace_id: "workspace-1",
    p_replacement_statement: null,
    p_replacement_body: null,
    p_replace_body: false,
    p_replacement_status: null,
    p_reason: "This is no longer true.",
  },
  "an omitted replacement retracts the old belief instead of deleting it"
);

assert.deepEqual(
  buildCorrectWorkingModelClaimRpcArgs({
    claimId: "claim-1",
    actorId: "actor-1",
    workspaceId: "workspace-1",
    replacementStatement: "Ship trace inspection first.",
    replacementBody: "{\"type\":\"doc\",\"content\":[]}",
    reason: "The explanation changed materially.",
  }),
  {
    p_claim_id: "claim-1",
    p_actor_id: "actor-1",
    p_workspace_id: "workspace-1",
    p_replacement_statement: "Ship trace inspection first.",
    p_replacement_body: "{\"type\":\"doc\",\"content\":[]}",
    p_replace_body: true,
    p_replacement_status: null,
    p_reason: "The explanation changed materially.",
  }
);

assert.equal(
  buildCorrectWorkingModelClaimRpcArgs({
    claimId: "claim-1",
    actorId: "actor-1",
    workspaceId: "workspace-1",
    replacementStatement: "Ship trace inspection first.",
    replacementStatus: "validated",
    reason: "The user validated this belief.",
  }).p_replacement_status,
  "validated"
);

assert.throws(
  () =>
    buildCorrectWorkingModelClaimRpcArgs({
      claimId: "claim-1",
      actorId: "actor-1",
      workspaceId: "workspace-1",
      replacementStatement: null,
      reason: " ",
    }),
  /reason/i
);

assert.deepEqual(
  buildWorkingModelExclusionInsert({
    instanceId: "instance-1",
    threadId: "thread-1",
    claimId: "claim-1",
    actorId: "actor-1",
    reason: "  Not part of this product thread.  ",
  }),
  {
    instance_id: "instance-1",
    thread_id: "thread-1",
    target_type: "memory_primitive",
    target_id: "claim-1",
    directive: "exclude",
    user_reason: "Not part of this product thread.",
    created_by_actor_id: "actor-1",
  },
  "local exclusion must be scoped to one thread and must not mutate conviction"
);

assert.deepEqual(
  buildClearWorkingModelOverrideUpdate(
    "actor-1",
    "2026-08-19T15:00:00.000Z"
  ),
  {
  cleared_by_actor_id: "actor-1",
  cleared_at: "2026-08-19T15:00:00.000Z",
  }
);

const sheet: ThreadContextSheet = {
  id: "sheet-1",
  instance_id: "instance-1",
  thread_id: "thread-1",
  active_working: [],
  short_term: [],
  long_term: [
    {
      id: "decision-old",
      statement: "Ship the read-only panel first.",
      source_refs: [],
      status: "active",
    },
  ],
  markdown: "",
  metadata: {},
  created_at: "2026-08-19T10:00:00.000Z",
  updated_at: "2026-08-19T10:00:00.000Z",
};

const dossierUpdate = buildCorrectedThreadSheetUpdate({
  sheet,
  claimId: "claim-1",
  replacementClaimId: "claim-2",
  previousStatement: "Ship the read-only panel first.",
  replacementStatement: "Ship trace inspection first.",
  now: "2026-08-19T15:00:00.000Z",
});
assert.equal(dossierUpdate.longTerm?.[0]?.status, "superseded");
assert.equal(dossierUpdate.longTerm?.[1]?.statement, "Ship trace inspection first.");
assert.deepEqual(dossierUpdate.longTerm?.[1]?.source_refs, [
  { memory_primitive_id: "claim-2", relation: "corrects" },
]);
