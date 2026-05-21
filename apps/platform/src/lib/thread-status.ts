import type { ThreadResolutionStatus } from "./types";

export function getThreadStatusLabel(status: ThreadResolutionStatus): string {
  switch (status) {
    case "active":
      return "Unresolved";
    case "resolved":
      return "Resolved";
    case "reopened":
      return "Reopened";
    case "superseded":
      return "Superseded";
  }
}

export function normalizeResolutionSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) throw new Error("Resolution summary is required");
  return trimmed;
}

export function buildSubThreadResolvedMetadata({
  subThreadId,
  subThreadTitle,
  summary,
}: {
  subThreadId: string;
  subThreadTitle: string;
  summary: string;
}) {
  return {
    sub_thread_id: subThreadId,
    sub_thread_title: subThreadTitle,
    summary: normalizeResolutionSummary(summary),
  };
}
