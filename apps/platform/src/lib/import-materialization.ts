import {
  renderStartingContextMarkdown,
  type ImportPreview,
  type ImportPreviewCluster,
} from "./import-preview";
import type { MemoryPrimitiveType } from "./types";

export interface ImportMemoryPrimitivePlan {
  type: MemoryPrimitiveType;
  statement: string;
  body: string | null;
  conviction: number;
  metadata: Record<string, unknown>;
  externalEpisodeId: string | null;
}

export interface ImportThreadPlan {
  clusterId: string;
  title: string;
  description: string | null;
  startingContextMarkdown: string;
  sourceRefs: ImportPreviewCluster["source_refs"];
  memoryPrimitives: ImportMemoryPrimitivePlan[];
}

export interface AcceptedImportPlan {
  importJobId: string;
  threads: ImportThreadPlan[];
  excludedClusterIds: string[];
}

function toMemoryType(value: unknown): MemoryPrimitiveType | null {
  if (value === "decision" || value === "assumption") return value;
  if (value === "rationale") return "rationale";
  return null;
}

export function buildAcceptedImportPlan(
  preview: ImportPreview
): AcceptedImportPlan {
  return {
    importJobId: preview.import_job_id,
    excludedClusterIds: preview.excluded_cluster_ids,
    threads: preview.clusters
      .filter((cluster) => cluster.include)
      .map((cluster) => ({
        clusterId: cluster.id,
        title: cluster.proposed_thread.title || cluster.title,
        description: cluster.proposed_thread.description,
        startingContextMarkdown: renderStartingContextMarkdown(
          cluster.starting_context
        ),
        sourceRefs: cluster.source_refs,
        memoryPrimitives: cluster.candidate_primitives.flatMap((primitive) => {
          const type = toMemoryType(primitive.type);
          const statement =
            typeof primitive.statement === "string"
              ? primitive.statement.trim()
              : "";
          if (!type || !statement) return [];

          const sourceEpisodeIds = cluster.source_refs.flatMap(
            (source) => source.source_episode_ids
          );
          return [
            {
              type,
              statement,
              body: typeof primitive.body === "string" ? primitive.body : null,
              conviction:
                typeof primitive.conviction === "number"
                  ? primitive.conviction
                  : 0.5,
              metadata: {
                source: "workos_import",
                primitive,
                source_refs: cluster.source_refs,
              },
              externalEpisodeId: sourceEpisodeIds[0] ?? null,
            },
          ];
        }),
      })),
  };
}
