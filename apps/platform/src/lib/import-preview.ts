export interface StartingContext {
  summary: string;
  key_decisions: string[];
  open_questions: string[];
  assumptions_or_constraints: string[];
  pick_up_here: string;
}

export interface ImportPreviewCluster {
  id: string;
  title: string;
  summary: string;
  include: boolean;
  proposed_thread: {
    title: string;
    description: string | null;
    parent_cluster_id: string | null;
  };
  starting_context: StartingContext;
  candidate_primitives: Array<Record<string, unknown>>;
  source_refs: Array<{
    conversation_id: string;
    synthesis_id?: string | null;
    source_episode_ids: string[];
    source_provenance: Record<string, unknown>;
  }>;
}

export interface ImportPreview {
  success: true;
  import_job_id: string;
  clusters: ImportPreviewCluster[];
  excluded_cluster_ids: string[];
  metadata: Record<string, unknown>;
}

function assertObject(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

export function validateImportPreview(value: unknown): ImportPreview {
  assertObject(value, "Import preview");
  if (value.success !== true) {
    throw new Error("Import preview must be successful");
  }
  if (typeof value.import_job_id !== "string") {
    throw new Error("import_job_id is required");
  }
  if (!Array.isArray(value.clusters)) {
    throw new Error("clusters must be an array");
  }
  return value as unknown as ImportPreview;
}

function renderList(items: string[], emptyText: string): string {
  if (items.length === 0) return `- ${emptyText}`;
  return items.map((item) => `- ${item}`).join("\n");
}

export function renderStartingContextMarkdown(context: StartingContext): string {
  return [
    "# Starting Context",
    "",
    context.summary,
    "",
    "## Key Decisions",
    renderList(context.key_decisions, "No durable decisions detected yet."),
    "",
    "## Open Questions",
    renderList(context.open_questions, "No open questions detected yet."),
    "",
    "## Assumptions And Constraints",
    renderList(
      context.assumptions_or_constraints,
      "No explicit assumptions or constraints detected yet."
    ),
    "",
    "## Pick Up Here",
    context.pick_up_here,
  ].join("\n");
}
