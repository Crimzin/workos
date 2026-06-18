import assert from "node:assert/strict";
import {
  renderStartingContextMarkdown,
  validateImportPreview,
} from "./import-preview";

const preview = {
  success: true,
  import_job_id: "import_123",
  clusters: [
    {
      id: "cluster_1",
      title: "WorkOS unified direction",
      summary: "WorkOS is now one user-facing product.",
      include: true,
      proposed_thread: {
        title: "WorkOS unified direction",
        description: "WorkOS is now one user-facing product.",
        parent_cluster_id: null,
      },
      starting_context: {
        summary: "WorkOS is now one user-facing product.",
        key_decisions: ["Hide BrainShare, Swarm, and Finiti as internal layers."],
        open_questions: ["How should import preview be tuned?"],
        assumptions_or_constraints: ["V1 accepts top-level include/exclude only."],
        pick_up_here: "Build the import/cold-start boom.",
      },
      candidate_primitives: [],
      source_refs: [
        {
          conversation_id: "claude:boom-test",
          source_episode_ids: ["ep_1"],
          source_provenance: { source_tool: "claude" },
        },
      ],
    },
  ],
  excluded_cluster_ids: [],
  metadata: { preview_version: "workos_import_preview_v0" },
};

assert.equal(validateImportPreview(preview).clusters.length, 1);

const markdown = renderStartingContextMarkdown(preview.clusters[0].starting_context);
assert.match(markdown, /Starting Context/);
assert.match(markdown, /WorkOS is now one user-facing product/);
assert.match(markdown, /Build the import\/cold-start boom/);
assert.doesNotMatch(markdown, /undefined/);
