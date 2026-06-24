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

assert.equal(
  stableConversationHash(claude!),
  stableConversationHash({
    ...claude!,
    title: "Renamed campaign script",
    createdAt: "2026-06-22T10:00:00Z",
    updatedAt: "2026-06-22T10:20:00Z",
  })
);

const invalidResult = normalizeImportFiles([
  { fileName: "not-json.json", text: "this is not json" },
  { fileName: "numbers.json", text: JSON.stringify([1]) },
  { fileName: "conversations.json", text: JSON.stringify([{}]) },
]);
assert.equal(invalidResult.conversations.length, 0);
assert.deepEqual(invalidResult.inventory, [
  {
    fileName: "not-json.json",
    sourceApp: "unknown",
    conversationCount: 0,
    error: "File was not recognized as a Claude or ChatGPT conversation export.",
  },
  {
    fileName: "numbers.json",
    sourceApp: "unknown",
    conversationCount: 0,
    error: "File was not recognized as a Claude or ChatGPT conversation export.",
  },
  {
    fileName: "conversations.json",
    sourceApp: "unknown",
    conversationCount: 0,
    error: "File was not recognized as a Claude or ChatGPT conversation export.",
  },
]);

const mixedResult = normalizeImportFiles([
  { fileName: "bad.json", text: JSON.stringify([1]) },
  claudeFile,
]);
assert.equal(mixedResult.conversations.length, 1);
assert.equal(mixedResult.inventory[0].sourceApp, "unknown");
assert.equal(mixedResult.inventory[0].conversationCount, 0);
assert.equal(mixedResult.inventory[1].sourceApp, "claude");
assert.equal(mixedResult.inventory[1].conversationCount, 1);

const chatgptBranchFile: RawImportFile = {
  fileName: "conversations.json",
  text: JSON.stringify([
    {
      id: "chatgpt-branch",
      title: "Regenerated answer",
      current_node: "tool-result",
      mapping: {
        root: { id: "root", parent: null, children: ["prompt"] },
        prompt: {
          id: "prompt",
          parent: "root",
          children: ["old-answer", "new-answer"],
          message: {
            id: "prompt",
            author: { role: "user", name: "Will" },
            create_time: 1782021600,
            content: { content_type: "text", parts: ["Draft a plan."] },
          },
        },
        "old-answer": {
          id: "old-answer",
          parent: "prompt",
          children: [],
          message: {
            id: "old-answer",
            author: { role: "assistant", name: "ChatGPT" },
            create_time: 1782021660,
            content: { content_type: "text", parts: ["Use the old plan."] },
          },
        },
        "new-answer": {
          id: "new-answer",
          parent: "prompt",
          children: ["tool-result"],
          message: {
            id: "new-answer",
            author: { role: "assistant", name: "ChatGPT" },
            create_time: null,
            content: { content_type: "text", parts: ["Use the new plan."] },
          },
        },
        "tool-result": {
          id: "tool-result",
          parent: "new-answer",
          children: [],
          message: {
            id: "tool-result",
            author: { role: "tool", name: "browser" },
            create_time: 1782021720,
            content: { content_type: "text", parts: ["Reference found."] },
          },
        },
      },
    },
  ]),
};

const branchResult = normalizeImportFiles([chatgptBranchFile]);
assert.equal(branchResult.conversations.length, 1);
assert.deepEqual(
  branchResult.conversations[0].messages.map((message) => message.text),
  ["Draft a plan.", "Use the new plan.", "Reference found."]
);
assert.deepEqual(
  branchResult.conversations[0].messages.map((message) => message.role),
  ["human", "assistant", "tool"]
);
assert.deepEqual(
  branchResult.conversations[0].messages.map((message) => message.sourceIndex),
  [0, 1, 2]
);

const chatgptFirstChildFile: RawImportFile = {
  fileName: "conversations.json",
  text: JSON.stringify([
    {
      id: "chatgpt-first-child",
      title: "Fallback path",
      mapping: {
        root: { id: "root", parent: null, children: ["prompt"] },
        prompt: {
          id: "prompt",
          parent: "root",
          children: ["first-answer", "second-answer"],
          message: {
            id: "prompt",
            author: { role: "user", name: "Will" },
            create_time: 1782021600,
            content: { content_type: "text", parts: ["Pick a branch."] },
          },
        },
        "first-answer": {
          id: "first-answer",
          parent: "prompt",
          children: [],
          message: {
            id: "first-answer",
            author: { role: "assistant", name: "ChatGPT" },
            create_time: 1782021660,
            content: { content_type: "text", parts: ["First branch."] },
          },
        },
        "second-answer": {
          id: "second-answer",
          parent: "prompt",
          children: [],
          message: {
            id: "second-answer",
            author: { role: "assistant", name: "ChatGPT" },
            create_time: 1782021720,
            content: { content_type: "text", parts: ["Second branch."] },
          },
        },
      },
    },
  ]),
};

const firstChildResult = normalizeImportFiles([chatgptFirstChildFile]);
assert.deepEqual(
  firstChildResult.conversations[0].messages.map((message) => message.text),
  ["Pick a branch.", "First branch."]
);

const invalidTimestampFile: RawImportFile = {
  fileName: "conversations.json",
  text: JSON.stringify([
    {
      id: "chatgpt-bad-time",
      title: "Bad timestamp",
      create_time: Number.MAX_VALUE,
      update_time: "not a unix timestamp",
      current_node: "prompt",
      mapping: {
        root: { id: "root", parent: null, children: ["prompt"] },
        prompt: {
          id: "prompt",
          parent: "root",
          children: [],
          message: {
            id: "prompt",
            author: { role: "user", name: "Will" },
            create_time: Number.MAX_VALUE,
            content: { content_type: "text", parts: ["Handle impossible dates."] },
          },
        },
      },
    },
  ]),
};

const invalidTimestampResult = normalizeImportFiles([invalidTimestampFile]);
assert.equal(invalidTimestampResult.conversations[0].createdAt, null);
assert.equal(invalidTimestampResult.conversations[0].updatedAt, null);
assert.equal(invalidTimestampResult.conversations[0].messages[0].createdAt, null);
