import assert from "node:assert/strict";
import { buildClaudeMessageParams, DEFAULT_CLAUDE_MODEL } from "./claude.ts";

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
assert.equal(defaultParams.max_tokens, 4096);

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
