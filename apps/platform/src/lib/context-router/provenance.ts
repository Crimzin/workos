import type { ContextCandidateSourceKind } from "./types";
import type { SourceApp } from "../types";

export type ContextSourceOrigin = "workos" | "imported";

export interface ContextSourceProvenanceInput {
  sourceApp: unknown;
  sourceKind: unknown;
}

export interface ContextSourceProvenance {
  sourceApp: SourceApp;
  sourceKind: ContextCandidateSourceKind;
  sourceOrigin: ContextSourceOrigin;
  sourceProvenance: string;
}

export function contextSourceProvenanceForNode(
  input: ContextSourceProvenanceInput
): ContextSourceProvenance {
  const sourceOrigin: ContextSourceOrigin =
    input.sourceKind === "imported_ai_chat" ? "imported" : "workos";
  const sourceApp = normalizeNodeSourceApp(input.sourceApp, sourceOrigin);

  return {
    sourceApp,
    sourceKind: sourceOrigin === "imported" ? "imported" : "global",
    sourceOrigin,
    sourceProvenance: contextSourceProvenanceLabel({
      sourceApp,
      sourceOrigin,
    }),
  };
}

export function contextSourceProvenanceLabel(input: {
  sourceApp: SourceApp;
  sourceOrigin: ContextSourceOrigin;
}): string {
  if (input.sourceOrigin === "workos") return "WorkOS thread";

  switch (input.sourceApp) {
    case "claude":
      return "Claude import";
    case "chatgpt":
      return "ChatGPT import";
    case "workos":
      return "WorkOS thread";
    case "unknown":
      return "Imported chat";
  }
}

function normalizeNodeSourceApp(
  value: unknown,
  sourceOrigin: ContextSourceOrigin
): SourceApp {
  if (
    value === "workos" ||
    value === "claude" ||
    value === "chatgpt" ||
    value === "unknown"
  ) {
    return value;
  }
  return sourceOrigin === "workos" ? "workos" : "unknown";
}
