// Server-only Anthropic SDK wrapper. Single entrypoint for inline AI replies
// in WorkOS post threads. Uses prompt caching on the system block so repeated
// invocations on the same node skip re-processing the context.
//
// v1 minimum: non-streaming, single text response. Streaming is a v2 follow-up.

import Anthropic from "@anthropic-ai/sdk";
import {
  renderAttachmentSource,
  type AgentAttachment,
} from "./attachments.ts";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5";
const MAX_TOKENS_DEFAULT = 4096;

export interface ClaudeUsageInput {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface NormalizedClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_input_tokens: number;
  total_tokens: number;
}

interface ClaudeModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheCreationPerMTok: number;
  cacheReadPerMTok: number;
}

const CLAUDE_PRICING_BY_MODEL: Record<string, ClaudeModelPricing> = {
  "claude-opus-4-8": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheCreationPerMTok: 6.25,
    cacheReadPerMTok: 0.5,
  },
  "claude-opus-4-1": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheCreationPerMTok: 18.75,
    cacheReadPerMTok: 1.5,
  },
  "claude-sonnet-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheCreationPerMTok: 2.5,
    cacheReadPerMTok: 0.2,
  },
  "claude-sonnet-4-5": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheCreationPerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  "claude-haiku-4-5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheCreationPerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },
};

export function normalizeClaudeUsage(
  usage: ClaudeUsageInput | null | undefined
): NormalizedClaudeUsage {
  const inputTokens = usageNumber(usage?.input_tokens);
  const outputTokens = usageNumber(usage?.output_tokens);
  const cacheCreationTokens = usageNumber(usage?.cache_creation_input_tokens);
  const cacheReadTokens = usageNumber(usage?.cache_read_input_tokens);

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreationTokens,
    cache_read_input_tokens: cacheReadTokens,
    total_input_tokens: inputTokens + cacheCreationTokens + cacheReadTokens,
    total_tokens:
      inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens,
  };
}

export function estimateClaudeUsageCostUsd(
  model: string,
  usage: ClaudeUsageInput | null | undefined
): number | null {
  const pricing = pricingForClaudeModel(model);
  if (!pricing) return null;

  const normalized = normalizeClaudeUsage(usage);
  const cost =
    (normalized.input_tokens / 1_000_000) * pricing.inputPerMTok +
    (normalized.output_tokens / 1_000_000) * pricing.outputPerMTok +
    (normalized.cache_creation_input_tokens / 1_000_000) *
      pricing.cacheCreationPerMTok +
    (normalized.cache_read_input_tokens / 1_000_000) *
      pricing.cacheReadPerMTok;

  return Number(cost.toFixed(6));
}

function usageNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function pricingForClaudeModel(model: string): ClaudeModelPricing | null {
  return (
    CLAUDE_PRICING_BY_MODEL[model] ??
    (model.startsWith("claude-opus-4-8")
      ? CLAUDE_PRICING_BY_MODEL["claude-opus-4-8"]
      : model.startsWith("claude-sonnet-5")
        ? CLAUDE_PRICING_BY_MODEL["claude-sonnet-5"]
        : model.startsWith("claude-haiku-4-5")
          ? CLAUDE_PRICING_BY_MODEL["claude-haiku-4-5"]
          : null)
  );
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to apps/platform/.env.local."
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface ClaudeInvocation {
  systemPrompt: string;
  userMessage: string;
  attachments?: AgentAttachment[];
  model?: string;
  maxTokens?: number;
}

export function buildClaudeMessageParams(opts: ClaudeInvocation) {
  const userContent = buildClaudeUserContent(
    opts.userMessage,
    opts.attachments ?? []
  );

  return {
    model: opts.model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? MAX_TOKENS_DEFAULT,
    system: [
      {
        type: "text" as const,
        text: opts.systemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user" as const,
        content: userContent,
      },
    ],
  };
}

function buildClaudeUserContent(
  userMessage: string,
  attachments: AgentAttachment[]
) {
  const images = attachments.filter((attachment) => attachment.kind === "image");
  if (images.length === 0) return userMessage;

  return [
    { type: "text" as const, text: userMessage },
    ...images.flatMap((image, index) => {
      const label = image.caption ?? image.title;
      const source = renderAttachmentSource(image);
      if (!isExternallyFetchableImageUrl(image.url)) {
        return [
          {
            type: "text" as const,
            text: `Attached image ${index + 1} omitted: ${source}${
              label ? ` — ${label}` : ""
            }. The image URL is not externally fetchable by Claude.`,
          },
        ];
      }

      return [
        {
          type: "text" as const,
          text: `Attached image ${index + 1}: ${source}${
            image.caption ? ` — ${image.caption}` : ""
          }`,
        },
        {
          type: "image" as const,
          source: {
            type: "url" as const,
            url: image.url,
          },
        },
      ];
    }),
  ];
}

function isExternallyFetchableImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return false;
  }

  if (hostname === "mail.google.com" || hostname === "gmail.com") {
    return false;
  }

  return true;
}

/** Hard ceiling for a non-streaming Anthropic call. Beyond this we abort and
 *  surface an error rather than letting the after() callback hang forever.
 *  Bumped to 3 minutes so larger family-context payloads (~20–30K input
 *  tokens after the Bug 2 fix expanded scope to parent + siblings) have
 *  headroom — a 91K-char user message took ~60s of model time in observed
 *  traffic. Streaming calls (`streamClaude`) use a separate, looser ceiling
 *  because chunk arrival itself is the progress signal. */
const CLAUDE_CALL_TIMEOUT_MS = 180_000;

/** Total-duration safety net for streaming calls. If the stream is still
 *  open after this long we abort. Long but not infinite. */
const CLAUDE_STREAM_TIMEOUT_MS = 5 * 60_000;

export async function invokeClaude(opts: ClaudeInvocation): Promise<string> {
  const t0 = Date.now();
  const model = opts.model ?? DEFAULT_CLAUDE_MODEL;
  console.log(
    `[claude.ts] invokeClaude start (system=${opts.systemPrompt.length}c, user=${opts.userMessage.length}c, model=${model})`
  );

  const c = client();
  console.log(`[claude.ts] client ready (${Date.now() - t0}ms)`);

  // Race the SDK call against a wall-clock timeout so a hung connection
  // surfaces as an obvious error in the server log instead of a silent stall.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(
      `[claude.ts] ABORT — Anthropic call exceeded ${CLAUDE_CALL_TIMEOUT_MS}ms`
    );
    controller.abort();
  }, CLAUDE_CALL_TIMEOUT_MS);

  let response: Anthropic.Message;
  try {
    console.log(`[claude.ts] calling messages.create… (${Date.now() - t0}ms)`);
    response = await c.messages.create(
      buildClaudeMessageParams(opts),
      { signal: controller.signal }
    );
    console.log(
      `[claude.ts] messages.create returned (${Date.now() - t0}ms, stop_reason=${response.stop_reason})`
    );
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(
      `[claude.ts] messages.create THREW after ${Date.now() - t0}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err
    );
    throw err;
  }
  clearTimeout(timeoutId);

  // Concatenate any text-typed content blocks from the assistant turn.
  const text = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  console.log(
    `[claude.ts] invokeClaude done (replyChars=${text.length}, ${Date.now() - t0}ms)`
  );
  return text || "(Claude returned an empty response.)";
}

// ---------------------------------------------------------------------------
// Streaming variant
// ---------------------------------------------------------------------------

export interface ClaudeUsageReport {
  model: string;
  usage: NormalizedClaudeUsage;
  estimated_cost_usd: number | null;
  request_id: string | null | undefined;
}

export type ClaudeStreamEvent =
  /** `"delta"` events arrive for each incremental text chunk. A trailing
   *  `"complete"` event is yielded once with the canonical full text after
   *  the stream finishes. */
  | { type: "delta"; text: string }
  | { type: "complete"; text: string; usage: ClaudeUsageReport | null };

/**
 * Stream a Claude response token-by-token. The caller drives it with
 * `for await ... of` and reacts to each `delta` as it arrives — typical use
 * is to update a partially-rendered post body incrementally so the user
 * sees text appear in real time instead of waiting for the full response.
 */
export async function* streamClaude(
  opts: ClaudeInvocation
): AsyncGenerator<ClaudeStreamEvent> {
  const t0 = Date.now();
  const model = opts.model ?? DEFAULT_CLAUDE_MODEL;
  console.log(
    `[claude.ts] streamClaude start (system=${opts.systemPrompt.length}c, user=${opts.userMessage.length}c, model=${model})`
  );

  const c = client();
  const controller = new AbortController();
  const safety = setTimeout(() => {
    console.error(
      `[claude.ts] STREAM ABORT — exceeded ${CLAUDE_STREAM_TIMEOUT_MS}ms total`
    );
    controller.abort();
  }, CLAUDE_STREAM_TIMEOUT_MS);

  let fullText = "";
  let chunkCount = 0;
  let firstChunkAt: number | null = null;

  try {
    const stream = c.messages.stream(
      buildClaudeMessageParams(opts),
      { signal: controller.signal }
    );

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        const chunk = event.delta.text;
        if (chunk.length === 0) continue;
        if (firstChunkAt === null) {
          firstChunkAt = Date.now();
          console.log(
            `[claude.ts] first chunk received (${firstChunkAt - t0}ms)`
          );
        }
        fullText += chunk;
        chunkCount++;
        yield { type: "delta", text: chunk };
      }
    }

    const finalMessage = await stream.finalMessage().catch((err: unknown) => {
      console.warn(
        "[claude.ts] failed to read final stream usage:",
        err instanceof Error ? err.message : err
      );
      return null;
    });
    const usage = finalMessage
      ? {
          model,
          usage: normalizeClaudeUsage(finalMessage.usage),
          estimated_cost_usd: estimateClaudeUsageCostUsd(
            model,
            finalMessage.usage
          ),
          request_id: stream.request_id,
        }
      : null;

    console.log(
      `[claude.ts] streamClaude complete (chunks=${chunkCount}, replyChars=${fullText.length}, total ${Date.now() - t0}ms${
        usage
          ? `, tokens=${usage.usage.total_tokens}, estimatedCost=$${usage.estimated_cost_usd ?? "unknown"}`
          : ""
      })`
    );
    yield {
      type: "complete",
      text: fullText || "(Claude returned an empty response.)",
      usage,
    };
  } catch (err) {
    clearTimeout(safety);
    console.error(
      `[claude.ts] streamClaude error after ${Date.now() - t0}ms (chunks=${chunkCount}, accumulated=${fullText.length}c):`,
      err instanceof Error ? `${err.name}: ${err.message}` : err
    );
    throw err;
  }
  clearTimeout(safety);
}
