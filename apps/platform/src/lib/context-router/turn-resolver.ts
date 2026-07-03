import { invokeClaude } from "../agents/claude";
import type { ContextTurnResolution } from "./types";
import { parseLlmJsonObject } from "./json";

const TURN_RESOLVER_MODEL = "claude-haiku-4-5";

export interface TurnResolverInput {
  currentText: string;
  previousUserTexts: string[];
  recentThreadTexts?: string[];
  activeThreadTitle: string;
}

export interface TurnResolverPrompt {
  system: string;
  user: string;
}

export type TurnResolverCaller = (
  prompt: TurnResolverPrompt,
) => Promise<string>;
const ACKNOWLEDGEMENT_PATTERN =
  /^(thanks|thank you|thx|ok|okay|cool|great|nice|got it|sounds good|👍)$/i;

export function buildTurnResolverPrompt(
  input: TurnResolverInput,
): TurnResolverPrompt {
  return {
    system:
      "Resolve the user's current turn for context retrieval inside WorkOS. If the current turn is vague, infer the real retrieval query from the active thread, recent user turns, and recent thread transcript. Pay special attention to short follow-ups like 'try again', 'keep going', or references to a prior assistant answer such as 'the third bullet'. Return strict JSON only.",
    user: JSON.stringify({
      active_thread_title: input.activeThreadTitle,
      current_text: input.currentText,
      previous_user_texts: input.previousUserTexts,
      recent_thread_texts: input.recentThreadTexts ?? [],
      required_json_shape: {
        resolved_query: "string",
        should_retrieve: "boolean",
        confidence: "number 0..1",
        reason: "short string",
      },
    }),
  };
}

export function parseTurnResolution(
  text: string,
  originalText: string,
): ContextTurnResolution {
  let data: Record<string, unknown>;
  try {
    data = parseLlmJsonObject(text);
  } catch {
    return {
      originalText,
      resolvedQuery: originalText.trim(),
      shouldRetrieve: true,
      confidence: 0.25,
      reason: "Could not parse turn resolution.",
    };
  }

  const resolvedQuery =
    typeof data.resolved_query === "string" && data.resolved_query.trim()
      ? data.resolved_query.trim()
      : originalText.trim();

  return {
    originalText,
    resolvedQuery,
    shouldRetrieve: data.should_retrieve !== false,
    confidence:
      typeof data.confidence === "number" && Number.isFinite(data.confidence)
        ? Math.max(0, Math.min(1, data.confidence))
        : 0.5,
    reason:
      typeof data.reason === "string" && data.reason.trim()
        ? data.reason.trim()
        : "Resolved by Context Router.",
  };
}

export async function resolveContextTurn(
  input: TurnResolverInput,
  caller: TurnResolverCaller = async (prompt) =>
    invokeClaude({
      systemPrompt: prompt.system,
      userMessage: prompt.user,
      model: TURN_RESOLVER_MODEL,
      maxTokens: 600,
    }),
): Promise<ContextTurnResolution> {
  const prompt = buildTurnResolverPrompt(input);
  const text = await caller(prompt);
  return parseTurnResolution(text, input.currentText);
}

export async function resolveContextTurnWithFallback(
  input: TurnResolverInput,
  caller?: TurnResolverCaller,
): Promise<ContextTurnResolution> {
  try {
    return await resolveContextTurn(input, caller);
  } catch (error) {
    console.warn(
      "[context-router] model turn resolution failed; using local fallback:",
      error instanceof Error ? error.message : error,
    );
    return resolveContextTurnLocally(input, {
      reason: "Resolved locally after model turn resolution failed.",
    });
  }
}

export function resolveContextTurnLocally(
  input: TurnResolverInput,
  options: { reason?: string } = {},
): ContextTurnResolution {
  const currentText = input.currentText.trim();
  if (ACKNOWLEDGEMENT_PATTERN.test(currentText)) {
    return {
      originalText: input.currentText,
      resolvedQuery: currentText,
      shouldRetrieve: false,
      confidence: 0.8,
      reason: "Local resolver treated this as an acknowledgement.",
    };
  }

  return {
    originalText: input.currentText,
    resolvedQuery: buildLocalResolvedQuery(input),
    shouldRetrieve: currentText.length > 0,
    confidence: 0.68,
    reason: options.reason ?? "Resolved locally from the current turn.",
  };
}

function buildLocalResolvedQuery(input: TurnResolverInput): string {
  return [
    input.currentText,
    ...input.previousUserTexts.slice(-2),
    input.activeThreadTitle,
  ]
    .map((text) => text.trim())
    .filter(Boolean)
    .join(" ");
}
