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

export async function invokeClaude(opts: ClaudeInvocation): Promise<string> {
  const c = client();
  const response = await c.messages.create({
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
  });

  // Concatenate any text-typed content blocks from the assistant turn.
  const text = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  return text || "(Claude returned an empty response.)";
}
