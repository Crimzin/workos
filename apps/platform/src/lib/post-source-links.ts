import type { SourceApp } from "./types";

const sourceAppLabels: Record<SourceApp, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  workos: "WorkOS",
  unknown: "Unknown",
};

const sourceAppMarks: Record<SourceApp, string> = {
  claude: "C",
  chatgpt: "G",
  workos: "W",
  unknown: "?",
};

export function messageAnchorId(postId: string): string {
  return `message-${postId}`;
}

export function sourceThreadHref(
  threadId: string,
  postId?: string | null
): string {
  const baseHref = `/n/${threadId}`;
  return postId ? `${baseHref}#${messageAnchorId(postId)}` : baseHref;
}

export function sourceAppLabel(
  sourceApp: SourceApp | null | undefined
): string {
  return sourceAppLabels[sourceApp ?? "unknown"];
}

export function sourceAppMark(
  sourceApp: SourceApp | null | undefined
): string {
  return sourceAppMarks[sourceApp ?? "unknown"];
}

export function sourceAppFromMetadata(value: unknown): SourceApp {
  if (
    value === "claude" ||
    value === "chatgpt" ||
    value === "workos" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}
