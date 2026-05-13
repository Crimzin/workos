// Server-only Anthropic SDK wrapper. Single entrypoint for inline AI replies
// in WorkOS post threads. Uses prompt caching on the system block so repeated
// invocations on the same node skip re-processing the context.
//
// v1 minimum: non-streaming, single text response. Streaming is a v2 follow-up.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS_DEFAULT = 4096;

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
  maxTokens?: number;
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
  console.log(
    `[claude.ts] invokeClaude start (system=${opts.systemPrompt.length}c, user=${opts.userMessage.length}c, model=${MODEL})`
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
      {
        model: MODEL,
        max_tokens: opts.maxTokens ?? MAX_TOKENS_DEFAULT,
        system: [
          {
            type: "text",
            text: opts.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: opts.userMessage,
          },
        ],
      },
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

export interface ClaudeStreamEvent {
  /** `"delta"` events arrive for each incremental text chunk. A trailing
   *  `"complete"` event is yielded once with the canonical full text after
   *  the stream finishes. */
  type: "delta" | "complete";
  text: string;
}

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
  console.log(
    `[claude.ts] streamClaude start (system=${opts.systemPrompt.length}c, user=${opts.userMessage.length}c, model=${MODEL})`
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
      {
        model: MODEL,
        max_tokens: opts.maxTokens ?? MAX_TOKENS_DEFAULT,
        system: [
          {
            type: "text",
            text: opts.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: opts.userMessage,
          },
        ],
      },
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
  } catch (err) {
    clearTimeout(safety);
    console.error(
      `[claude.ts] streamClaude error after ${Date.now() - t0}ms (chunks=${chunkCount}, accumulated=${fullText.length}c):`,
      err instanceof Error ? `${err.name}: ${err.message}` : err
    );
    throw err;
  }
  clearTimeout(safety);

  console.log(
    `[claude.ts] streamClaude complete (chunks=${chunkCount}, replyChars=${fullText.length}, total ${Date.now() - t0}ms)`
  );
  yield {
    type: "complete",
    text: fullText || "(Claude returned an empty response.)",
  };
}
