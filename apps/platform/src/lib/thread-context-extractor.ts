import { invokeClaude } from "./agents/claude";
import { parseLlmJsonObject } from "./context-router/json";
import { normalizeSearchText } from "./context-search";
import type { ThreadContextSheet, ThreadContextSheetItem } from "./types";
import type { ThreadContextSheetUpdate } from "./thread-context-sheet";

const POST_TURN_EXTRACTOR_MODEL = "claude-haiku-4-5";
const MAX_ASSISTANT_TEXT_CHARS = 4_000;
const MAX_USER_TEXT_CHARS = 1_500;
const MAX_EXISTING_ITEMS = 24;
const MAX_SOURCE_FACTS = 30;
const MAX_ACTIVE_ITEMS = 4;
const MAX_SHORT_TERM_ITEMS = 8;
const MAX_LONG_TERM_ITEMS = 10;

export interface ThreadContextPostTurnSourceFact {
  sourceTitle: string;
  sourceRole: "core" | "supporting" | "watchlist";
  facts: string[];
}

export interface PostTurnMemoryExtractionInput {
  threadTitle: string;
  userText: string;
  assistantText: string;
  existingSheet: ThreadContextSheet | null;
  attachedContextFacts: ThreadContextPostTurnSourceFact[];
  now?: Date;
}

export interface PostTurnMemoryExtractionPrompt {
  system: string;
  user: string;
}

export type PostTurnMemoryExtractionCaller = (
  prompt: PostTurnMemoryExtractionPrompt
) => Promise<string>;

export function buildPostTurnMemoryExtractionPrompt(
  input: PostTurnMemoryExtractionInput
): PostTurnMemoryExtractionPrompt {
  return {
    system:
      "Update a WorkOS thread context sheet after one assistant turn. Return strict JSON only. Extract only information that will help future turns in this same thread. Long-term memory may be seeded from attached context facts or established in the current thread, but do not store generic advice, assistant speculation, or unanswered questions as durable facts. User corrections and explicit current facts override stale imported context.",
    user: JSON.stringify({
      thread_title: input.threadTitle,
      current_time: (input.now ?? new Date()).toISOString(),
      latest_user_message: truncate(input.userText, MAX_USER_TEXT_CHARS),
      assistant_reply: truncate(input.assistantText, MAX_ASSISTANT_TEXT_CHARS),
      existing_thread_sheet: renderExistingSheet(input.existingSheet),
      attached_context_facts: input.attachedContextFacts
        .flatMap((source) =>
          source.facts.map((fact) => ({
            source_title: source.sourceTitle,
            source_role: source.sourceRole,
            fact,
          }))
        )
        .slice(0, MAX_SOURCE_FACTS),
      required_json_shape: {
        active_working: [
          "1-4 concise statements about current focus, open questions, and next step",
        ],
        short_term: [
          "0-8 temporary but useful statements for the next few turns",
        ],
        long_term: [
          "0-10 durable facts, decisions, constraints, or corrected facts for this thread",
        ],
        superseded_long_term_ids: [
          "ids from existing_thread_sheet.long_term that are now stale or contradicted",
        ],
      },
    }),
  };
}

export function parsePostTurnMemoryExtraction(
  text: string,
  options: {
    existingSheet: ThreadContextSheet | null;
    now?: Date;
  }
): ThreadContextSheetUpdate {
  let data: Record<string, unknown>;
  try {
    data = parseLlmJsonObject(text);
  } catch {
    return {};
  }

  const now = (options.now ?? new Date()).toISOString();
  const supersededIds = new Set(stringArray(data.superseded_long_term_ids));
  const activeWorking = memoryItemsFromStatements({
    prefix: "post-turn-active",
    statements: stringArray(data.active_working).slice(0, MAX_ACTIVE_ITEMS),
    now,
    sourceRefs: [{ kind: "post_turn_extraction" }],
  });
  const shortTerm = memoryItemsFromStatements({
    prefix: "post-turn-short",
    statements: stringArray(data.short_term).slice(0, MAX_SHORT_TERM_ITEMS),
    now,
    sourceRefs: [{ kind: "post_turn_extraction" }],
  });
  const longTerm = [
    ...supersededExistingItems(options.existingSheet, supersededIds, now),
    ...memoryItemsFromStatements({
      prefix: "post-turn-long",
      statements: stringArray(data.long_term).slice(0, MAX_LONG_TERM_ITEMS),
      now,
      sourceRefs: [{ kind: "post_turn_extraction" }],
    }),
  ];

  return {
    ...(activeWorking.length > 0 ? { activeWorking } : {}),
    ...(shortTerm.length > 0 ? { shortTerm } : {}),
    ...(longTerm.length > 0 ? { longTerm } : {}),
    metadata: {
      last_post_turn_extracted_at: now,
    },
  };
}

export async function extractThreadContextSheetPostTurnUpdate(
  input: PostTurnMemoryExtractionInput,
  caller: PostTurnMemoryExtractionCaller = async (prompt) =>
    invokeClaude({
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      model: POST_TURN_EXTRACTOR_MODEL,
      maxTokens: 900,
    })
): Promise<ThreadContextSheetUpdate> {
  const prompt = buildPostTurnMemoryExtractionPrompt(input);
  const response = await caller(prompt);
  return parsePostTurnMemoryExtraction(response, {
    existingSheet: input.existingSheet,
    now: input.now,
  });
}

function renderExistingSheet(
  sheet: ThreadContextSheet | null
): Record<string, unknown> {
  if (!sheet) return { active_working: [], short_term: [], long_term: [] };
  return {
    active_working: renderExistingItems(sheet.active_working),
    short_term: renderExistingItems(sheet.short_term),
    long_term: renderExistingItems(sheet.long_term),
  };
}

function renderExistingItems(items: ThreadContextSheetItem[]) {
  return items
    .filter((item) => item.status !== "superseded" && item.status !== "retracted")
    .slice(0, MAX_EXISTING_ITEMS)
    .map((item) => ({
      id: item.id,
      statement: item.statement,
      status: item.status ?? "active",
    }));
}

function supersededExistingItems(
  sheet: ThreadContextSheet | null,
  supersededIds: Set<string>,
  now: string
): ThreadContextSheetItem[] {
  if (!sheet || supersededIds.size === 0) return [];
  return sheet.long_term
    .filter((item) => supersededIds.has(item.id))
    .map((item) => ({
      ...item,
      status: "superseded",
      updated_at: now,
    }));
}

function memoryItemsFromStatements(input: {
  prefix: string;
  statements: string[];
  now: string;
  sourceRefs: Array<Record<string, unknown>>;
}): ThreadContextSheetItem[] {
  return input.statements.flatMap((statement) => {
    const cleaned = cleanStatement(statement);
    if (!cleaned) return [];
    return [
      {
        id: stableMemoryItemId(input.prefix, cleaned),
        statement: cleaned,
        source_refs: input.sourceRefs,
        status: "active",
        updated_at: input.now,
      },
    ];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function cleanStatement(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  const cleaned = cleanStatement(value);
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 3)}...`;
}

function stableMemoryItemId(prefix: string, statement: string): string {
  return `${prefix}:${stableHash(normalizeSearchText(statement))}`;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
