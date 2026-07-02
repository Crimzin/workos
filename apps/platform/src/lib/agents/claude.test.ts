import assert from "node:assert/strict";
import {
  buildClaudeMessageParams,
  DEFAULT_CLAUDE_MODEL,
  estimateClaudeUsageCostUsd,
  normalizeClaudeUsage,
} from "./claude.ts";

const params = buildClaudeMessageParams({
  systemPrompt: "system",
  userMessage: "user",
  model: "claude-haiku-4-5",
  maxTokens: 123,
});

assert.equal(params.model, "claude-haiku-4-5");
assert.equal(params.max_tokens, 123);
assert.deepEqual(params.messages, [{ role: "user", content: "user" }]);

const defaultParams = buildClaudeMessageParams({
  systemPrompt: "system",
  userMessage: "user",
});

assert.equal(defaultParams.model, DEFAULT_CLAUDE_MODEL);
assert.equal(DEFAULT_CLAUDE_MODEL, "claude-sonnet-5");
assert.equal(defaultParams.max_tokens, 4096);

assert.deepEqual(
  normalizeClaudeUsage({
    input_tokens: 1000,
    output_tokens: 200,
    cache_creation_input_tokens: 300,
    cache_read_input_tokens: 400,
  }),
  {
    input_tokens: 1000,
    output_tokens: 200,
    cache_creation_input_tokens: 300,
    cache_read_input_tokens: 400,
    total_input_tokens: 1700,
    total_tokens: 1900,
  }
);

assert.equal(
  estimateClaudeUsageCostUsd("claude-opus-4-8", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  }),
  36.75
);

assert.equal(
  estimateClaudeUsageCostUsd("claude-sonnet-5", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  }),
  14.7
);

const imageParams = buildClaudeMessageParams({
  systemPrompt: "system",
  userMessage: "Describe this",
  attachments: [
    {
      kind: "image",
      url: "https://example.com/screenshot.png",
      caption: "Dashboard error state",
      source: {
        postId: "post-1",
        section: "Active thread",
        authorName: "Will",
      },
    },
  ],
});

assert.deepEqual(imageParams.messages, [
  {
    role: "user",
    content: [
      { type: "text", text: "Describe this" },
      {
        type: "text",
        text: "Attached image 1: Active thread, Will — Dashboard error state",
      },
      {
        type: "image",
        source: {
          type: "url",
          url: "https://example.com/screenshot.png",
        },
      },
    ],
  },
]);

const privateImageParams = buildClaudeMessageParams({
  systemPrompt: "system",
  userMessage: "Describe this",
  attachments: [
    {
      kind: "image",
      url: "https://mail.google.com/mail/u/0?view=fimg&attid=0.1",
      title: "gmail-inline.png",
      source: {
        postId: "post-2",
        section: "Active thread",
        authorName: "Will",
      },
    },
  ],
});

assert.deepEqual(privateImageParams.messages, [
  {
    role: "user",
    content: [
      { type: "text", text: "Describe this" },
      {
        type: "text",
        text: "Attached image 1 omitted: Active thread, Will — gmail-inline.png. The image URL is not externally fetchable by Claude.",
      },
    ],
  },
]);
