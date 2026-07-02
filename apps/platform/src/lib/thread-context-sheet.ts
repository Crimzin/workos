import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { normalizeSearchText, tokenizeSearchText } from "./context-search";
import type { ThreadContextSheet, ThreadContextSheetItem } from "./types";

export interface ThreadContextSheetUpdate {
  activeWorking?: ThreadContextSheetItem[];
  shortTerm?: ThreadContextSheetItem[];
  longTerm?: ThreadContextSheetItem[];
  metadata?: Record<string, unknown>;
}

export type ThreadContextSheetSeedSourceRole =
  | "core"
  | "supporting"
  | "watchlist";

export interface ThreadContextSheetSeedDecision {
  sourceNodeId: string;
  sourceTitle: string;
  sourceRole: ThreadContextSheetSeedSourceRole;
  confidence: number;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  usefulFacts: string[];
}

export interface BuildThreadContextSheetSeedUpdateInput {
  currentText: string;
  resolvedQuery: string;
  decisions: ThreadContextSheetSeedDecision[];
  now?: Date;
}

export interface ShouldUseThreadContextSheetForTurnInput {
  resolvedQuery: string;
  sheet: ThreadContextSheet | null;
  activeAttachmentCount: number;
}

export interface ThreadContextSheetUpsertPayload {
  instance_id: string;
  thread_id: string;
  active_working: ThreadContextSheetItem[];
  short_term: ThreadContextSheetItem[];
  long_term: ThreadContextSheetItem[];
  markdown: string;
  metadata: Record<string, unknown>;
}

export interface UpsertThreadContextSheetRecordInput {
  instanceId: string;
  threadId: string;
  update: ThreadContextSheetUpdate;
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
    short_term: update.shortTerm
      ? mergeItemsById(sheet.short_term, update.shortTerm)
      : dedupeItems(sheet.short_term),
    long_term: update.longTerm
      ? mergeItemsById(sheet.long_term, update.longTerm)
      : dedupeItems(sheet.long_term),
    metadata: { ...sheet.metadata, ...(update.metadata ?? {}) },
  };
  return { ...next, markdown: buildThreadContextSheetMarkdown(next) };
}

export function buildThreadContextSheetSeedUpdate(
  input: BuildThreadContextSheetSeedUpdateInput
): ThreadContextSheetUpdate {
  const now = (input.now ?? new Date()).toISOString();
  const currentText = cleanSheetText(input.currentText);
  const resolvedQuery = cleanSheetText(input.resolvedQuery);
  const sourceRefs = input.decisions.map((decision) =>
    sourceRefForDecision(decision)
  );

  return {
    activeWorking: [
      {
        id: stableSheetItemId("active", resolvedQuery || currentText),
        statement: [
          resolvedQuery ? `Current focus: ${resolvedQuery}.` : null,
          currentText ? `Latest user request: ${currentText}.` : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" "),
        source_refs: [{ kind: "current_user_request" }],
        status: "active",
        updated_at: now,
      },
    ],
    shortTerm:
      input.decisions.length > 0
        ? [
            {
              id: stableSheetItemId(
                "sources",
                input.decisions
                  .map((decision) => decision.sourceNodeId)
                  .join("|")
              ),
              statement: `Context sources available for this thread: ${input.decisions
                .map(
                  (decision) =>
                    `${decision.sourceTitle} (${decision.sourceRole})`
                )
                .join(", ")}.`,
              source_refs: sourceRefs,
              status: "active",
              updated_at: now,
            },
          ]
        : undefined,
    longTerm: buildContextSeedLongTermItems(input.decisions, now),
    metadata: {
      last_seeded_from_context_at: now,
      context_seed_source_count: input.decisions.length,
    },
  };
}

export function shouldUseThreadContextSheetForTurn(
  input: ShouldUseThreadContextSheetForTurnInput
): boolean {
  if (input.activeAttachmentCount <= 0 || !input.sheet) return false;
  const sheetItems = selectThreadSheetForPrompt(input.sheet);
  if (sheetItems.length === 0) return false;

  const queryTokens = meaningfulSheetTokens(input.resolvedQuery);
  if (queryTokens.length < 3) return false;

  const sheetTokens = new Set(
    meaningfulSheetTokens(
      sheetItems.map((item) => item.statement).join("\n")
    )
  );
  if (sheetTokens.size === 0) return false;

  const matched = queryTokens.filter((token) => sheetTokens.has(token));
  return matched.length >= 2 && matched.length / queryTokens.length >= 0.55;
}

export function buildThreadContextSheetUpsertPayload(input: {
  instanceId: string;
  threadId: string;
  existingSheet: ThreadContextSheet | null;
  update: ThreadContextSheetUpdate;
}): ThreadContextSheetUpsertPayload {
  const baseSheet =
    input.existingSheet ??
    ({
      id: "",
      instance_id: input.instanceId,
      thread_id: input.threadId,
      active_working: [],
      short_term: [],
      long_term: [],
      markdown: "",
      metadata: {},
      created_at: "",
      updated_at: "",
    } satisfies ThreadContextSheet);
  const merged = mergeThreadContextSheetUpdate(baseSheet, input.update);

  return {
    instance_id: input.instanceId,
    thread_id: input.threadId,
    active_working: merged.active_working,
    short_term: merged.short_term,
    long_term: merged.long_term,
    markdown: merged.markdown,
    metadata: merged.metadata,
  };
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
      if (error) {
        if (isMissingThreadContextSheetTableError(error)) {
          console.warn(
            "[thread-context-sheet] table missing; continuing without thread sheet context"
          );
          return null;
        }
        throw error;
      }
      return data as ThreadContextSheet | null;
    },
    ["thread-context-sheet", threadId],
    { tags: [cacheTags.threadContextSheet(threadId)] }
  )();
}

export async function upsertThreadContextSheetRecord(
  input: UpsertThreadContextSheetRecordInput
): Promise<boolean> {
  const { supabase } = await import("./supabase");
  const { data: existingSheet, error: existingError } = await supabase
    .from("thread_context_sheets")
    .select("*")
    .eq("thread_id", input.threadId)
    .eq("instance_id", input.instanceId)
    .maybeSingle();
  if (existingError) {
    if (isMissingThreadContextSheetTableError(existingError)) return false;
    throw existingError;
  }

  const payload = buildThreadContextSheetUpsertPayload({
    instanceId: input.instanceId,
    threadId: input.threadId,
    existingSheet: existingSheet as ThreadContextSheet | null,
    update: input.update,
  });

  const { error } = await supabase.from("thread_context_sheets").upsert(
    payload,
    { onConflict: "thread_id" }
  );
  if (error) {
    if (isMissingThreadContextSheetTableError(error)) return false;
    throw error;
  }

  return true;
}

export function isMissingThreadContextSheetTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as Record<string, unknown>;
  const code = typeof row.code === "string" ? row.code : "";
  const message = typeof row.message === "string" ? row.message : "";

  return (
    (code === "PGRST205" || code === "42P01") &&
    message.includes("thread_context_sheets")
  );
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

function mergeItemsById(
  existing: ThreadContextSheetItem[],
  updates: ThreadContextSheetItem[]
): ThreadContextSheetItem[] {
  const updateByKey = new Map(
    updates.map((item) => [item.id || item.statement.toLowerCase(), item])
  );
  const merged = existing.map((item) => {
    const key = item.id || item.statement.toLowerCase();
    return updateByKey.get(key) ?? item;
  });
  const existingKeys = new Set(
    existing.map((item) => item.id || item.statement.toLowerCase())
  );
  for (const item of updates) {
    const key = item.id || item.statement.toLowerCase();
    if (!existingKeys.has(key)) merged.push(item);
  }
  return dedupeItems(merged);
}

const THREAD_CONTEXT_SHEET_LONG_TERM_FACT_LIMIT = 24;
const THREAD_CONTEXT_SHEET_FACTS_PER_SOURCE_LIMIT = 2;

const THREAD_CONTEXT_SHEET_STOP_WORDS = new Set([
  "a",
  "about",
  "across",
  "again",
  "all",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "can",
  "do",
  "does",
  "for",
  "from",
  "given",
  "help",
  "i",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "over",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

function buildContextSeedLongTermItems(
  decisions: ThreadContextSheetSeedDecision[],
  now: string
): ThreadContextSheetItem[] {
  const items: ThreadContextSheetItem[] = [];
  const factCountBySourceId = new Map<string, number>();

  for (const decision of decisions) {
    if (decision.sourceRole === "watchlist") continue;

    for (const fact of decision.usefulFacts) {
      const sourceFactCount = factCountBySourceId.get(decision.sourceNodeId) ?? 0;
      if (sourceFactCount >= THREAD_CONTEXT_SHEET_FACTS_PER_SOURCE_LIMIT) {
        break;
      }

      const cleanedFact = cleanFactText(fact, decision.sourceTitle);
      if (!cleanedFact) continue;

      items.push({
        id: stableSheetItemId(
          "context-fact",
          `${decision.sourceNodeId}:${cleanedFact}`
        ),
        statement: `From "${decision.sourceTitle}": ${cleanedFact}`,
        source_refs: [sourceRefForDecision(decision)],
        status: "active",
        updated_at: now,
      });
      factCountBySourceId.set(decision.sourceNodeId, sourceFactCount + 1);
      if (items.length >= THREAD_CONTEXT_SHEET_LONG_TERM_FACT_LIMIT) {
        return items;
      }
    }
  }

  return items;
}

function sourceRefForDecision(
  decision: ThreadContextSheetSeedDecision
): Record<string, unknown> {
  return {
    source_node_id: decision.sourceNodeId,
    source_title: decision.sourceTitle,
    source_role: decision.sourceRole,
    confidence: decision.confidence,
    ...(decision.sourcePostId ? { source_post_id: decision.sourcePostId } : {}),
    ...(decision.sourceMessageId
      ? { source_message_id: decision.sourceMessageId }
      : {}),
  };
}

function cleanSheetText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanFactText(fact: string, sourceTitle: string): string {
  const cleaned = cleanSheetText(fact);
  if (!cleaned) return "";

  const normalizedTitle = normalizeSearchText(sourceTitle);
  const normalizedFactStart = normalizeSearchText(
    cleaned.slice(0, sourceTitle.length + 8)
  );
  if (normalizedTitle && normalizedFactStart.startsWith(normalizedTitle)) {
    return cleanSheetText(cleaned.slice(sourceTitle.length).replace(/^[:.\-\s]+/, ""));
  }

  return cleaned;
}

function meaningfulSheetTokens(value: string): string[] {
  const tokens = tokenizeSearchText(value).flatMap(expandSheetToken);
  return [...new Set(tokens)].filter(
    (token) =>
      token.length >= 3 && !THREAD_CONTEXT_SHEET_STOP_WORDS.has(token)
  );
}

function expandSheetToken(token: string): string[] {
  const out = [token];
  if (token.endsWith("s") && token.length > 4) out.push(token.slice(0, -1));
  if (token.endsWith("al") && token.length > 5) out.push(token.slice(0, -2));
  if (token.endsWith("ing") && token.length > 6) out.push(token.slice(0, -3));
  return out;
}

function stableSheetItemId(prefix: string, value: string): string {
  return `${prefix}:${stableHash(normalizeSearchText(value))}`;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
