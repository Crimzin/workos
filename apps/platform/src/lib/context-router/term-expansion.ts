import { normalizeSearchText, tokenizeSearchText } from "../context-search";

const THEMATIC_TERMS: Record<string, string[]> = {
  finance: [
    "finance",
    "finances",
    "financial",
    "money",
    "budget",
    "cash",
    "tax",
    "taxes",
    "retirement",
    "asset",
    "assets",
    "runway",
  ],
  finances: [
    "finance",
    "finances",
    "financial",
    "money",
    "budget",
    "cash",
    "tax",
    "taxes",
    "retirement",
    "asset",
    "assets",
    "runway",
  ],
  financial: [
    "finance",
    "finances",
    "financial",
    "money",
    "budget",
    "cash",
    "tax",
    "taxes",
    "retirement",
    "asset",
    "assets",
    "runway",
  ],
  program: [
    "script",
    "program",
    "code",
    "automation",
    "python",
    "notebook",
    "analysis",
    "pipeline",
  ],
  script: [
    "script",
    "program",
    "code",
    "automation",
    "python",
    "notebook",
    "analysis",
    "pipeline",
  ],
  code: [
    "script",
    "program",
    "code",
    "automation",
    "python",
    "notebook",
    "analysis",
    "pipeline",
  ],
  python: [
    "script",
    "program",
    "code",
    "automation",
    "python",
    "notebook",
    "analysis",
    "pipeline",
  ],
  automation: [
    "script",
    "program",
    "code",
    "automation",
    "python",
    "notebook",
    "analysis",
    "pipeline",
  ],
};

export interface ExpandedTextMatchScoreInput {
  query: string;
  text: string;
}

export interface ExpandedTextMatchScore {
  score: number;
  matchedTerms: string[];
}

export function expandContextQueryTerms(query: string): string[] {
  const terms: string[] = [];

  for (const token of tokenizeSearchText(query)) {
    if (token.length < 3) continue;
    addUnique(terms, token);

    for (const variant of tokenVariants(token)) {
      addUnique(terms, variant);
    }

    for (const thematicTerm of THEMATIC_TERMS[token] ?? []) {
      addUnique(terms, thematicTerm);
    }
  }

  return terms;
}

export function expandedTextMatchScore(
  input: ExpandedTextMatchScoreInput
): ExpandedTextMatchScore {
  const textTokens = tokenizeSearchText(input.text);
  const matchedTerms = expandContextQueryTerms(input.query).filter(
    (term) => termMatchesText(term, textTokens)
  );

  return {
    score: matchedTerms.length,
    matchedTerms,
  };
}

function termMatchesText(term: string, textTokens: string[]): boolean {
  const termTokens = tokenizeSearchText(term);
  if (termTokens.length === 0) return false;
  if (termTokens.length === 1) return textTokens.includes(termTokens[0]);

  return textTokens.some((_, index) =>
    termTokens.every((termToken, offset) => textTokens[index + offset] === termToken)
  );
}

function tokenVariants(token: string): string[] {
  const variants = new Set<string>();

  if (token.endsWith("ies") && token.length > 3) {
    variants.add(`${token.slice(0, -3)}y`);
  } else if (token.endsWith("y") && token.length > 1) {
    variants.add(`${token.slice(0, -1)}ies`);
  }

  if (token.endsWith("s") && token.length > 3) {
    variants.add(token.slice(0, -1));
  } else {
    variants.add(`${token}s`);
  }

  if (token.endsWith("ing") && token.length > 5) {
    variants.add(token.slice(0, -3));
  } else {
    variants.add(`${token}ing`);
  }

  if (token.endsWith("ed") && token.length > 4) {
    variants.add(token.slice(0, -2));
  } else {
    variants.add(`${token}ed`);
  }

  return [...variants].map((variant) => normalizeSearchText(variant));
}

function addUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value);
}
