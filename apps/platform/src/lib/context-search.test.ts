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
assert.equal(normalizeSearchText("Alice’s “SQL-cleanup” plan?!"), "alice s sql cleanup plan");
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

assert.deepEqual(
  buildContextSearchResults(
    [
      {
        id: "workos",
        title: "WorkOS",
        path: "WorkOS",
        type: "workspace",
        href: "/n/workos",
      },
    ],
    "os",
    5
  ).map((item) => item.id),
  ["workos"]
);

const rankedCandidates: ContextSearchCandidate[] = [
  {
    id: "path-match",
    title: "Planning",
    path: "WorkOS / Campaign",
    type: "card",
    href: "/n/path-match",
  },
  {
    id: "title-substring",
    title: "Campaign Reporting Cleanup",
    path: "WorkOS / Campaign Reporting Cleanup",
    type: "card",
    href: "/n/title-substring",
  },
  {
    id: "all-title-tokens",
    title: "Reporting Campaign",
    path: "WorkOS / Reporting Campaign",
    type: "card",
    href: "/n/all-title-tokens",
  },
  {
    id: "preview-match",
    title: "Reference Notes",
    path: "WorkOS / Reference Notes",
    type: "card",
    href: "/n/preview-match",
    bodyPreview: "Campaign",
  },
  {
    id: "exact-title",
    title: "Campaign",
    path: "WorkOS / Campaign",
    type: "card",
    href: "/n/exact-title",
  },
];

assert.deepEqual(
  buildContextSearchResults(rankedCandidates, "campaign", 5).map((item) => item.id),
  ["exact-title", "all-title-tokens", "title-substring", "path-match", "preview-match"]
);
