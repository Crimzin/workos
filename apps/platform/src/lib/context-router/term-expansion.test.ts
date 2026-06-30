import assert from "node:assert/strict";
import { expandContextQueryTerms, expandedTextMatchScore } from "./term-expansion.ts";

const financeTerms = expandContextQueryTerms("Help me with finance planning.");
assert.ok(financeTerms.includes("finance"));
assert.ok(financeTerms.includes("finances"));
assert.ok(financeTerms.includes("financial"));
assert.ok(financeTerms.includes("money"));
assert.ok(financeTerms.includes("tax"));
assert.ok(financeTerms.includes("retirement"));

assert.ok(
  expandedTextMatchScore({
    query: "finance",
    text: "Personal finances, retirement contributions, taxes, and budget.",
  }).score > 0
);

assert.ok(
  expandedTextMatchScore({
    query: "script from three months ago",
    text: "Python program to clean campaign exports and rebuild a dataset.",
  }).matchedTerms.includes("program")
);

assert.ok(
  expandedTextMatchScore({
    query: "automation",
    text: "Python code that cleans campaign exports.",
  }).matchedTerms.includes("python")
);
