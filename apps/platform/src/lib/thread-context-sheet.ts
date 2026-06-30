import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import type { ThreadContextSheet, ThreadContextSheetItem } from "./types";

export interface ThreadContextSheetUpdate {
  activeWorking?: ThreadContextSheetItem[];
  shortTerm?: ThreadContextSheetItem[];
  longTerm?: ThreadContextSheetItem[];
  metadata?: Record<string, unknown>;
}

export function selectThreadSheetForPrompt(
  sheet: ThreadContextSheet | null
): ThreadContextSheetItem[] {
  if (!sheet) return [];
  return [...sheet.active_working, ...sheet.short_term, ...sheet.long_term].filter(
    (item) => item.status !== "superseded" && item.status !== "retracted"
  );
}

export function mergeThreadContextSheetUpdate(
  sheet: ThreadContextSheet,
  update: ThreadContextSheetUpdate
): ThreadContextSheet {
  const next: ThreadContextSheet = {
    ...sheet,
    active_working: update.activeWorking ?? sheet.active_working,
    short_term: dedupeItems(update.shortTerm ?? sheet.short_term),
    long_term: dedupeItems(update.longTerm ?? sheet.long_term),
    metadata: { ...sheet.metadata, ...(update.metadata ?? {}) },
  };
  return { ...next, markdown: buildThreadContextSheetMarkdown(next) };
}

export function buildThreadContextSheetMarkdown(
  sheet: Pick<
    ThreadContextSheet,
    "active_working" | "short_term" | "long_term"
  >
): string {
  const lines = ["# Thread Context Sheet", ""];
  appendSection(lines, "Active Working Memory", sheet.active_working);
  appendSection(lines, "Short-Term Memory", sheet.short_term);
  appendSection(lines, "Thread Long-Term Memory", sheet.long_term);
  return lines.join("\n").trimEnd();
}

export async function getThreadContextSheet(
  threadId: string
): Promise<ThreadContextSheet | null> {
  return unstable_cache(
    async () => {
      const { supabase } = await import("./supabase");
      const { data, error } = await supabase
        .from("thread_context_sheets")
        .select("*")
        .eq("thread_id", threadId)
        .maybeSingle();
      if (error) throw error;
      return data as ThreadContextSheet | null;
    },
    ["thread-context-sheet", threadId],
    { tags: [cacheTags.threadContextSheet(threadId)] }
  )();
}

function appendSection(
  lines: string[],
  heading: string,
  items: ThreadContextSheetItem[]
) {
  if (items.length === 0) return;
  lines.push(`## ${heading}`);
  for (const item of items) lines.push(`- ${item.statement}`);
  lines.push("");
}

function dedupeItems(
  items: ThreadContextSheetItem[]
): ThreadContextSheetItem[] {
  const seen = new Set<string>();
  const out: ThreadContextSheetItem[] = [];
  for (const item of items) {
    const key = item.id || item.statement.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
