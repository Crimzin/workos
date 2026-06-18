import assert from "node:assert/strict";
import { postBodyToMarkdown } from "./blocknote-markdown";
import { buildAcceptedImportPlan } from "./import-materialization";
import type { ImportPreview } from "./import-preview";

const preview: ImportPreview = {
  success: true,
  import_job_id: "import_123",
  clusters: [
    {
      id: "cluster_1",
      title: "WorkOS",
      summary: "Included",
      include: true,
      proposed_thread: {
        title: "WorkOS",
        description: "Included",
        parent_cluster_id: null,
      },
      starting_context: {
        summary: "Included",
        overview: ["One suite with BrainShare as the hidden context layer."],
        key_decisions: ["One product."],
        open_questions: ["What import review controls are needed before writeback?"],
        assumptions_or_constraints: [
          "Imported context must be editable because synthesis will be imperfect.",
        ],
        detail_notes: ["The first materialized thread should be useful without opening the transcript."],
        reflection:
          "The import is a handoff document, not just a record of what was said.",
        evidence_notes: ["The source conversation repeatedly frames WorkOS as the user-facing layer."],
        pick_up_here: "Review the imported brief, correct any synthesis errors, then choose the first writeback workflow.",
      },
      candidate_primitives: [
        {
          type: "decision",
          statement: "One product.",
          body: "Hide internal layer names.",
          conviction: 0.9,
        },
        {
          type: "question",
          statement: "Unsupported primitive should stay metadata-only.",
        },
      ],
      source_refs: [
        {
          conversation_id: "claude:1",
          source_episode_ids: ["ep_1"],
          source_provenance: {},
        },
      ],
    },
    {
      id: "cluster_2",
      title: "Personal",
      summary: "Excluded",
      include: false,
      proposed_thread: {
        title: "Personal",
        description: "Excluded",
        parent_cluster_id: null,
      },
      starting_context: {
        summary: "Excluded",
        key_decisions: [],
        open_questions: [],
        assumptions_or_constraints: [],
        pick_up_here: "Do nothing.",
      },
      candidate_primitives: [],
      source_refs: [
        {
          conversation_id: "claude:2",
          source_episode_ids: ["ep_2"],
          source_provenance: {},
        },
      ],
    },
  ],
  excluded_cluster_ids: ["cluster_2"],
  metadata: {},
};

const plan = buildAcceptedImportPlan(preview);
assert.equal(plan.threads.length, 1);
assert.equal(plan.threads[0].title, "WorkOS");
assert.equal(plan.threads[0].memoryPrimitives.length, 1);
assert.equal(plan.threads[0].memoryPrimitives[0].type, "decision");
assert.doesNotThrow(() => JSON.parse(plan.threads[0].startingContextPostBody));
const startingContextMarkdown = postBodyToMarkdown(
  plan.threads[0].startingContextPostBody
);
assert.match(startingContextMarkdown, /Starting Context/);
assert.match(startingContextMarkdown, /One suite with BrainShare/);
assert.match(startingContextMarkdown, /handoff document/);
assert.equal(plan.threads[0].sourceRefs[0].conversation_id, "claude:1");
assert.equal(plan.threads[0].memoryPrimitives[0].externalEpisodeId, "ep_1");
assert.equal(plan.excludedClusterIds[0], "cluster_2");
