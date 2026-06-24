import assert from "node:assert/strict";
import {
  normalizeImportFiles,
  stableConversationHash,
  type RawImportFile,
} from "./import-sources.ts";

const claudeFile: RawImportFile = {
  fileName: "claude-conversations.json",
  text: JSON.stringify([
    {
      uuid: "claude-1",
      name: "Campaign reporting script",
      created_at: "2026-06-21T10:00:00Z",
      updated_at: "2026-06-21T10:20:00Z",
      chat_messages: [
        {
          uuid: "m1",
          sender: "human",
          text: "Let's clean up the SQL parsing issue.",
          created_at: "2026-06-21T10:00:00Z",
        },
        {
          uuid: "m2",
          sender: "assistant",
          text: "The parser is splitting campaign names too early.",
          created_at: "2026-06-21T10:01:00Z",
        },
      ],
    },
  ]),
};

const chatgptFile: RawImportFile = {
  fileName: "conversations.json",
  text: JSON.stringify([
    {
      id: "chatgpt-1",
      title: "Python export script",
      create_time: 1782021600,
      update_time: 1782025200,
      mapping: {
        root: { id: "root", parent: null, children: ["a"] },
        a: {
          id: "a",
          parent: "root",
          children: ["b"],
          message: {
            id: "a",
            author: { role: "user", name: "Will" },
            create_time: 1782021600,
            content: { content_type: "text", parts: ["Help me process exports."] },
          },
        },
        b: {
          id: "b",
          parent: "a",
          children: [],
          message: {
            id: "b",
            author: { role: "assistant", name: "ChatGPT" },
            create_time: 1782021660,
            content: { content_type: "text", parts: ["Use pandas with explicit date parsing."] },
          },
        },
      },
    },
  ]),
};

const result = normalizeImportFiles([claudeFile, chatgptFile]);
assert.equal(result.conversations.length, 2);
assert.deepEqual(result.inventory, [
  { fileName: "claude-conversations.json", sourceApp: "claude", conversationCount: 1, error: null },
  { fileName: "conversations.json", sourceApp: "chatgpt", conversationCount: 1, error: null },
]);

const claude = result.conversations.find((item) => item.sourceApp === "claude");
assert.equal(claude?.title, "Campaign reporting script");
assert.equal(claude?.messages[0].role, "human");
assert.equal(claude?.messages[1].role, "assistant");

const chatgpt = result.conversations.find((item) => item.sourceApp === "chatgpt");
assert.equal(chatgpt?.title, "Python export script");
assert.deepEqual(chatgpt?.messages.map((message) => message.role), ["human", "assistant"]);

assert.equal(stableConversationHash(claude!), stableConversationHash({ ...claude!, title: "Campaign reporting script" }));
