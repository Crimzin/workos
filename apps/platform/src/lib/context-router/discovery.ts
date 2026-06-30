import type { ContextRouterCandidate } from "./types";

export function prioritizeCheapCandidates(
  candidates: ContextRouterCandidate[]
): ContextRouterCandidate[] {
  const timestamp = (value: string | null) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return candidates
    .map((candidate) => ({
      ...candidate,
      priorWeight:
        candidate.priorWeight ?? priorForSourceKind(candidate.sourceKind),
    }))
    .sort(
      (a, b) =>
        (b.priorWeight ?? 0) - (a.priorWeight ?? 0) ||
        b.lexicalScore - a.lexicalScore ||
        timestamp(b.updatedAt) - timestamp(a.updatedAt)
    );
}

export function priorForSourceKind(
  kind: ContextRouterCandidate["sourceKind"]
): number {
  switch (kind) {
    case "mention":
      return 8;
    case "account-memory":
      return 7;
    case "attached":
    case "linked":
      return 6;
    case "family":
      return 5;
    case "thread-sheet":
      return 4;
    case "imported":
    case "chunk":
      return 3;
    case "global":
      return 1;
    default:
      return 0;
  }
}
