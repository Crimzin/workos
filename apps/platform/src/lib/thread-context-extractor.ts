import { invokeClaude } from "./agents/claude";
import { parseLlmJsonObject } from "./context-router/json";
import { normalizeSearchText } from "./context-search";
import type { ReasonTraceAnswerAnchor } from "./reason-traces";
import type {
  ConvictionPosture,
  MemoryHumanSignal,
  MemoryPrimitiveExtractionMode,
  MemoryPrimitiveLifecycle,
  MemoryPrimitiveType,
  ThreadContextSheet,
  ThreadContextSheetItem,
} from "./types";
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
  workingModelClaims?: Array<{
    id: string;
    kind: MemoryPrimitiveType;
    statement: string;
    evidenceRefs: string[];
  }>;
  now?: Date;
}

export interface PostTurnMemoryExtractionPrompt {
  system: string;
  user: string;
}

export type PostTurnMemoryExtractionCaller = (
  prompt: PostTurnMemoryExtractionPrompt
) => Promise<string>;

export interface PostTurnProposedClaim {
  kind: MemoryPrimitiveType;
  statement: string;
  body: string | null;
  origin: "human" | "assistant";
  human_signal: MemoryHumanSignal;
  extraction_mode: MemoryPrimitiveExtractionMode;
  status: MemoryPrimitiveLifecycle;
  posture: ConvictionPosture;
  source_span: { start: number; end: number; text: string } | null;
}

export interface PostTurnAnalysisResult {
  sheetUpdate: ThreadContextSheetUpdate;
  answerAnchors: ReasonTraceAnswerAnchor[];
  proposedClaims: PostTurnProposedClaim[];
  associationStatus: "structured" | "invalid" | "unavailable";
  associationWarnings: string[];
}

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
      working_model_claims: (input.workingModelClaims ?? []).map((claim) => ({
        id: claim.id,
        kind: claim.kind,
        statement: claim.statement,
        evidence_refs: claim.evidenceRefs,
      })),
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
        answer_anchors: [
          {
            statement: "one concise stance or answer claim",
            belief_refs: ["ids from working_model_claims"],
            evidence_refs: ["evidence ids already attached to those claims"],
          },
        ],
        proposed_claims: [
          {
            kind: "goal | decision | idea | assumption | constraint | question | standard | signal | context_update",
            statement: "one concise claim",
            origin: "human | assistant",
            human_signal: "none | explicit_statement | explicit_approval | explicit_correction | observed_action | repeated_reference",
            source_quote: "required exact quote from latest_user_message when origin is human; otherwise null",
          },
        ],
      },
    }),
  };
}

export function parsePostTurnAnalysis(
  text: string,
  options: {
    existingSheet: ThreadContextSheet | null;
    allowedClaimIds: Set<string>;
    allowedEvidenceIds: Set<string>;
    userText: string;
    now?: Date;
  }
): PostTurnAnalysisResult {
  let data: Record<string, unknown>;
  try {
    data = parseLlmJsonObject(text);
  } catch {
    return {
      sheetUpdate: {},
      answerAnchors: [],
      proposedClaims: [],
      associationStatus: "unavailable",
      associationWarnings: ["Structured post-turn analysis was unavailable."],
    };
  }

  let invalidAssociationReferences = 0;
  const answerAnchors = Array.isArray(data.answer_anchors)
    ? data.answer_anchors.flatMap((value, index): ReasonTraceAnswerAnchor[] => {
        if (!isRecord(value)) return [];
        const statement =
          typeof value.statement === "string" ? cleanStatement(value.statement) : "";
        if (!statement) return [];
        const beliefRefs = stringArray(value.belief_refs).filter((id) => {
          const allowed = options.allowedClaimIds.has(id);
          if (!allowed) invalidAssociationReferences += 1;
          return allowed;
        });
        const evidenceRefs = stringArray(value.evidence_refs).filter((id) => {
          const allowed = options.allowedEvidenceIds.has(id);
          if (!allowed) invalidAssociationReferences += 1;
          return allowed;
        });
        return [
          {
            id: `post-turn-anchor-${index + 1}`,
            statement,
            belief_refs: beliefRefs,
            evidence_refs: evidenceRefs,
            mapping_kind: "structured_post_turn_association",
          },
        ];
      })
    : [];

  const proposedClaims = Array.isArray(data.proposed_claims)
    ? data.proposed_claims.flatMap((value): PostTurnProposedClaim[] => {
        if (!isRecord(value) || !isMemoryPrimitiveType(value.kind)) return [];
        const statement =
          typeof value.statement === "string" ? cleanStatement(value.statement) : "";
        if (!statement || value.kind === "rationale") return [];
        const requestedHumanOrigin = value.origin === "human";
        const sourceSpan = requestedHumanOrigin
          ? groundHumanSourceSpan(
              options.userText,
              value.source_quote,
              statement
            )
          : null;
        const origin = sourceSpan ? "human" : "assistant";
        const humanSignal = origin === "human"
          ? normalizeHumanSignal(value.human_signal)
          : "none";
        const hasHumanSignal = humanSignal !== "none";
        return [
          {
            kind: value.kind,
            statement,
            body:
              typeof value.body === "string" && cleanStatement(value.body)
                ? cleanStatement(value.body)
                : null,
            origin,
            human_signal: humanSignal,
            extraction_mode: origin === "human" ? "explicit" : "synthesized",
            status: hasHumanSignal ? "active" : "tentative",
            posture: hasHumanSignal ? "assert" : "ask",
            source_span: sourceSpan,
          },
        ];
      })
    : [];

  return {
    sheetUpdate: parsePostTurnMemoryExtraction(text, options),
    answerAnchors,
    proposedClaims,
    associationStatus:
      invalidAssociationReferences > 0
        ? "invalid"
        : answerAnchors.length > 0
          ? "structured"
          : "unavailable",
    associationWarnings:
      invalidAssociationReferences > 0
        ? [
            `${invalidAssociationReferences} answer association reference${
              invalidAssociationReferences === 1 ? " was" : "s were"
            } not selected for this response and were removed.`,
          ]
        : [],
  };
}

export async function extractThreadPostTurnAnalysis(
  input: PostTurnMemoryExtractionInput,
  caller: PostTurnMemoryExtractionCaller = async (prompt) =>
    invokeClaude({
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      model: POST_TURN_EXTRACTOR_MODEL,
      maxTokens: 1_300,
    })
): Promise<PostTurnAnalysisResult> {
  const prompt = buildPostTurnMemoryExtractionPrompt(input);
  const response = await caller(prompt);
  return parsePostTurnAnalysis(response, {
    existingSheet: input.existingSheet,
    allowedClaimIds: new Set(
      (input.workingModelClaims ?? []).map((claim) => claim.id)
    ),
    allowedEvidenceIds: new Set(
      (input.workingModelClaims ?? []).flatMap((claim) => claim.evidenceRefs)
    ),
    userText: input.userText,
    now: input.now,
  });
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
  return (await extractThreadPostTurnAnalysis(input, caller)).sheetUpdate;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryPrimitiveType(value: unknown): value is MemoryPrimitiveType {
  return (
    value === "goal" ||
    value === "decision" ||
    value === "idea" ||
    value === "assumption" ||
    value === "constraint" ||
    value === "question" ||
    value === "standard" ||
    value === "signal" ||
    value === "context_update" ||
    value === "rationale"
  );
}

function normalizeHumanSignal(value: unknown): MemoryHumanSignal {
  if (
    value === "explicit_statement" ||
    value === "explicit_approval" ||
    value === "explicit_correction" ||
    value === "observed_action" ||
    value === "repeated_reference"
  ) {
    return value;
  }
  return "none";
}

function groundHumanSourceSpan(
  userText: string,
  sourceQuote: unknown,
  claimStatement: string
): { start: number; end: number; text: string } | null {
  if (typeof sourceQuote !== "string") return null;
  const normalizedUserText = cleanStatement(userText);
  const quote = cleanStatement(sourceQuote);
  if (!quote) return null;
  const start = normalizedUserText.toLocaleLowerCase().indexOf(
    quote.toLocaleLowerCase()
  );
  if (start < 0) return null;
  const claimTerms = meaningfulTerms(claimStatement);
  const quoteTerms = meaningfulTerms(quote);
  const overlap = [...claimTerms].filter((term) => quoteTerms.has(term)).length;
  const minimumOverlap = Math.min(2, claimTerms.size);
  if (
    claimTerms.size === 0 ||
    overlap < minimumOverlap ||
    overlap / claimTerms.size < 0.5
  ) {
    return null;
  }
  return { start, end: start + quote.length, text: quote };
}

function meaningfulTerms(value: string): Set<string> {
  return new Set(
    cleanStatement(value)
      .toLocaleLowerCase()
      .replace(/[^a-z0-9-]+/g, " ")
      .split(/\s+/)
      .filter((term) => term.length >= 4)
  );
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
