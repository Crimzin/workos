import { markdownToBlockNote } from "./agents/markdown-to-blocknote";

export interface StartingContext {
  summary: string;
  overview?: string[];
  key_decisions: string[];
  open_questions: string[];
  assumptions_or_constraints: string[];
  detail_notes?: string[];
  reflection?: string;
  evidence_notes?: string[];
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

function cleanList(items: string[] | undefined): string[] {
  return (items ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function renderStartingContextMarkdown(context: StartingContext): string {
  const sections = [
    "# Starting Context",
    "",
    context.summary,
  ];

  const overview = cleanList(context.overview);
  if (overview.length > 0) {
    sections.push("", "## Overview", renderList(overview, ""));
  }

  sections.push(
    "",
    "## Key Decisions",
    renderList(cleanList(context.key_decisions), "No durable decisions detected yet."),
    "",
    "## Open Questions",
    renderList(cleanList(context.open_questions), "No open questions detected yet."),
    "",
    "## Assumptions And Constraints",
    renderList(
      cleanList(context.assumptions_or_constraints),
      "No explicit assumptions or constraints detected yet."
    )
  );

  const detailNotes = cleanList(context.detail_notes);
  if (detailNotes.length > 0) {
    sections.push("", "## Details", renderList(detailNotes, ""));
  }

  const reflection = context.reflection?.trim();
  if (reflection) {
    sections.push("", "## Reflection", reflection);
  }

  const evidenceNotes = cleanList(context.evidence_notes);
  if (evidenceNotes.length > 0) {
    sections.push("", "## Evidence Notes", renderList(evidenceNotes, ""));
  }

  sections.push(
    "",
    "## Pick Up Here",
    context.pick_up_here.trim()
  );

  return sections.join("\n");
}

export function renderStartingContextPostBody(context: StartingContext): string {
  return JSON.stringify(markdownToBlockNote(renderStartingContextMarkdown(context)));
}
