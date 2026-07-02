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
        candidate.priorWeight ??
        priorForSourceKind(candidate.sourceKind) + sourceSizePrior(candidate),
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

function sourceSizePrior(candidate: ContextRouterCandidate): number {
  const bodyChars = candidate.sourceBodyChars ?? 0;
  const postCount = candidate.sourcePostCount ?? 0;

  if (bodyChars >= 150_000 || postCount >= 100) return 2;
  if (bodyChars >= 60_000 || postCount >= 40) return 1.25;
  if (bodyChars >= 20_000 || postCount >= 15) return 0.6;
  return 0;
}
