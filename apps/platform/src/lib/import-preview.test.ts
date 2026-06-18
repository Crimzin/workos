import assert from "node:assert/strict";
import { postBodyToMarkdown } from "./blocknote-markdown";
import {
  renderStartingContextMarkdown,
  renderStartingContextPostBody,
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
        overview: [
          "BrainShare is the memory/context substrate, not a separate destination.",
          "Swarm is the orchestration layer that should appear through WorkOS workflows.",
        ],
        key_decisions: ["Hide BrainShare, Swarm, and Finiti as internal layers."],
        open_questions: ["How should import preview be tuned?"],
        assumptions_or_constraints: ["V1 accepts top-level include/exclude only."],
        detail_notes: [
          "Imported context should include enough product rationale for a human or agent to re-enter the work.",
        ],
        reflection:
          "The useful import artifact is not a transcript summary; it is a durable working brief.",
        evidence_notes: [
          "Source conversation explicitly connects WorkOS, BrainShare, and Swarm into one suite.",
        ],
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
assert.match(markdown, /## Overview/);
assert.match(markdown, /BrainShare is the memory\/context substrate/);
assert.match(markdown, /## Details/);
assert.match(markdown, /## Reflection/);
assert.match(markdown, /durable working brief/);
assert.match(markdown, /## Evidence Notes/);
assert.match(markdown, /Build the import\/cold-start boom/);
assert.doesNotMatch(markdown, /undefined/);

const postBody = renderStartingContextPostBody(preview.clusters[0].starting_context);
assert.doesNotThrow(() => JSON.parse(postBody));
const roundTrippedMarkdown = postBodyToMarkdown(postBody);
assert.match(roundTrippedMarkdown, /# Starting Context/);
assert.match(roundTrippedMarkdown, /## Overview/);
assert.match(roundTrippedMarkdown, /## Reflection/);
assert.match(roundTrippedMarkdown, /Build the import\/cold-start boom/);

const freeformMemo = [
  "# Sauce Experiments",
  "",
  "This is a cooking notebook about dialing in weeknight sauces.",
  "",
  "## Flavor Pattern",
  "- Bright acid and browned butter keep showing up.",
  "",
  "## Next Cook",
  "Try the lemon-caper version on roast cauliflower.",
].join("\n");
const freeformMarkdown = renderStartingContextMarkdown({
  summary: "A cooking notebook.",
  memo_markdown: freeformMemo,
  key_decisions: ["This should not become a visible Decisions section."],
  open_questions: [],
  assumptions_or_constraints: [],
  pick_up_here: "Cook next.",
});
assert.equal(freeformMarkdown, freeformMemo);
assert.doesNotMatch(freeformMarkdown, /Key Decisions/);
