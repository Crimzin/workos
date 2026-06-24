import assert from "node:assert/strict";
import {
  buildContextSearchResults,
  normalizeSearchText,
  tokenizeSearchText,
  type ContextSearchCandidate,
} from "./context-search.ts";

const candidates: ContextSearchCandidate[] = [
  {
    id: "claude-script",
    title: "Campaign Reporting SQL Cleanup",
    path: "Imported Chats / Campaign Reporting SQL Cleanup",
    type: "stack",
    sourceApp: "claude",
    href: "/n/claude-script",
  },
  {
    id: "workos-script",
    title: "SQL Script Followup",
    path: "WorkOS / SQL Script Followup",
    type: "card",
    sourceApp: "workos",
    href: "/n/workos-script",
  },
  {
    id: "unrelated",
    title: "Personal Finance",
    path: "Imported Chats / Personal Finance",
    type: "stack",
    sourceApp: "chatgpt",
    href: "/n/unrelated",
  },
];

assert.equal(normalizeSearchText("Campaign—Reporting   SQL"), "campaign reporting sql");
assert.deepEqual(tokenizeSearchText("sql cleanup campaign"), ["sql", "cleanup", "campaign"]);

assert.deepEqual(
  buildContextSearchResults(candidates, "cleanup campaign", 5).map((item) => item.id),
  ["claude-script"]
);

assert.deepEqual(
  buildContextSearchResults(candidates, "SQL Campaign Reporting Cleanup", 5).map((item) => item.id),
  ["claude-script"]
);

assert.equal(
  buildContextSearchResults(candidates, "campaign cleanup", 1)[0].sourceApp,
  "claude"
);

assert.deepEqual(buildContextSearchResults(candidates, "missing topic", 5), []);
