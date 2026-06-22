# BrainShare Import Genesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current import review from chat clustering into a provisional BrainShare import genesis flow: Episodes, topic chunks, facet candidates, source links, and MECE scope nodes that can later materialize into WorkOS threads.

**Architecture:** Keep the existing Claude export parser and import review UI as the outer shell, but insert a BrainShare-shaped provisional model between parsing and review. The parser will retain signal-bearing turns from all speakers, the genesis layer will build Episodes/Chunks/Facets/Scopes with source provenance, and the UI will present scope review while preserving current coverage, toggles, composer, and source side panel behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing Node assert tests through `npx tsx`, optional Anthropic SDK only behind explicit later integration points.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/platform/src/lib/brainshare-import-genesis.ts` | Pure TypeScript provisional BrainShare model, validation, and conversion helpers. No React. No browser APIs. |
| `apps/platform/src/lib/brainshare-import-genesis.test.ts` | Unit tests for Episodes, Topic Chunks, Facets, Scope Nodes, source links, validation, and no hard-coded prophecy guardrails. |
| `apps/platform/src/lib/claude-export-parser.ts` | Preserve all speaker turns and select candidate signal turns from AI and human messages, with human validation markers. |
| `apps/platform/src/lib/claude-export-parser.test.ts` | Add regression tests proving AI-generated turns can be retained when the human validates or corrects them. |
| `apps/platform/src/lib/import-cluster-review.ts` | Keep backwards-compatible review state, but add optional genesis state and generate review clusters from Scope Nodes instead of flat chat buckets. |
| `apps/platform/src/lib/import-cluster-review.test.ts` | Update tests around scope-derived review state, multi-scope source links, coverage, and fixture-agnostic behavior. |
| `apps/platform/src/components/import/cluster-review-surface.tsx` | Reframe copy and interactions from clusters to proposed BrainShare scopes/threads. |
| `apps/platform/src/components/import/conversation-chip.tsx` | Rename user-facing source evidence language while preserving drag/click behavior. |
| `apps/platform/src/components/import/conversation-detail-panel.tsx` | Show Episode, Topic Chunks, Facet Candidates, and Source Links when available. |
| `apps/platform/src/components/import/cluster-review-question.tsx` | Reword suggested decisions as scope-map questions. |
| `docs/superpowers/specs/2026-06-22-claude-export-import-pipeline-design.md` | Already updated; keep in sync if implementation reveals a spec mismatch. |

## Task 1: Provisional BrainShare Model

**Files:**
- Create: `apps/platform/src/lib/brainshare-import-genesis.test.ts`
- Create: `apps/platform/src/lib/brainshare-import-genesis.ts`

- [ ] **Step 1: Write failing model tests**

Create `apps/platform/src/lib/brainshare-import-genesis.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildImportGenesis,
  validateImportGenesis,
  type GenesisEpisodeInput,
} from "./brainshare-import-genesis";

const episodes: GenesisEpisodeInput[] = [
  {
    id: "episode-alpha",
    sourceTool: "claude",
    sourceTitle: "Mixed product and music chat",
    displayTitle: "Mixed product and music chat",
    createdAt: "2026-04-01T10:00:00Z",
    updatedAt: "2026-04-01T11:00:00Z",
    readable: true,
    turns: [
      {
        id: "turn-1",
        speaker: "human",
        text: "First, help me think through Project Aurora onboarding.",
      },
      {
        id: "turn-2",
        speaker: "assistant",
        text: "The onboarding work seems to split into activation, trust, and first useful output.",
      },
      {
        id: "turn-3",
        speaker: "human",
        text: "That makes a ton of sense. Later, let's switch to the Blue Lantern song mix.",
      },
      {
        id: "turn-4",
        speaker: "assistant",
        text: "For Blue Lantern, the core music work is arrangement, lyrics, and release positioning.",
      },
      {
        id: "turn-5",
        speaker: "human",
        text: "Yes, that sounds right.",
      },
    ],
    candidateSignalTurns: [
      {
        id: "turn-2",
        speaker: "assistant",
        text: "The onboarding work seems to split into activation, trust, and first useful output.",
        reason: "accepted_by_human",
        conviction: "assert",
      },
      {
        id: "turn-4",
        speaker: "assistant",
        text: "For Blue Lantern, the core music work is arrangement, lyrics, and release positioning.",
        reason: "accepted_by_human",
        conviction: "assert",
      },
    ],
  },
  {
    id: "episode-empty",
    sourceTool: "claude",
    sourceTitle: null,
    displayTitle: "Unreadable conversation",
    createdAt: null,
    updatedAt: null,
    readable: false,
    turns: [],
    candidateSignalTurns: [],
  },
];

const genesis = buildImportGenesis({
  importJobId: "import-test",
  sourceFingerprint: "fingerprint-test",
  sourceLabel: "synthetic export",
  episodes,
});

assert.equal(genesis.episodes.length, 2);
assert.equal(genesis.topicChunks.length >= 2, true);
assert.equal(genesis.facets.length >= 2, true);
assert.equal(genesis.scopeNodes.length >= 2, true);

const auroraScope = genesis.scopeNodes.find((scope) =>
  scope.title.includes("Project Aurora")
);
assert.ok(auroraScope);
assert.equal(auroraScope.attentionTier, "full");
assert.equal(
  genesis.sourceLinks.some(
    (link) =>
      link.targetType === "scope" &&
      link.targetId === auroraScope.id &&
      link.episodeId === "episode-alpha"
  ),
  true
);

const musicScope = genesis.scopeNodes.find((scope) =>
  scope.title.includes("Blue Lantern")
);
assert.ok(musicScope);
assert.notEqual(auroraScope.id, musicScope.id);

const validation = validateImportGenesis(genesis);
assert.deepEqual(validation.issues, []);
assert.equal(validation.ok, true);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: FAIL with module-not-found for `./brainshare-import-genesis`.

- [ ] **Step 3: Implement the provisional model**

Create `apps/platform/src/lib/brainshare-import-genesis.ts`:

```ts
export type GenesisSourceTool = "claude" | "chatgpt" | "codex" | "sample";
export type GenesisSpeaker = "human" | "assistant" | "agent" | "system" | "unknown";
export type GenesisConviction = "assert" | "flag" | "ask";
export type GenesisAttentionTier = "full" | "lightweight" | "ignore";
export type GenesisFacetType =
  | "project"
  | "goal"
  | "subgoal"
  | "decision"
  | "assumption"
  | "action"
  | "open_question"
  | "context_update"
  | "person"
  | "artifact"
  | "signal_pattern"
  | "relationship";

export interface GenesisTurn {
  id: string;
  speaker: GenesisSpeaker;
  text: string;
}

export interface GenesisSignalTurn extends GenesisTurn {
  reason:
    | "human_stated"
    | "accepted_by_human"
    | "corrected_by_human"
    | "decision_marker"
    | "question_marker"
    | "entity_dense";
  conviction: GenesisConviction;
}

export interface GenesisEpisodeInput {
  id: string;
  sourceTool: GenesisSourceTool;
  sourceTitle: string | null;
  displayTitle: string;
  createdAt: string | null;
  updatedAt: string | null;
  readable: boolean;
  turns: GenesisTurn[];
  candidateSignalTurns: GenesisSignalTurn[];
}

export interface GenesisEpisode extends GenesisEpisodeInput {
  kind: "episode";
}

export interface GenesisTopicChunk {
  id: string;
  episodeId: string;
  title: string;
  summary: string;
  turnIds: string[];
  primaryTerms: string[];
}

export interface GenesisFacetCandidate {
  id: string;
  type: GenesisFacetType;
  statement: string;
  primaryEpisodeId: string;
  primaryChunkId: string;
  scopeId: string;
  conviction: GenesisConviction;
  humanSignal: string | null;
}

export interface GenesisScopeNode {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  parentId: string | null;
  attentionTier: GenesisAttentionTier;
  confidence: "high" | "medium" | "low";
  facetIds: string[];
}

export interface GenesisSourceLink {
  id: string;
  targetType: "scope" | "facet";
  targetId: string;
  episodeId: string;
  chunkId: string | null;
  turnIds: string[];
  rationale: string;
}

export interface BrainshareImportGenesis {
  importJobId: string;
  sourceFingerprint: string;
  sourceLabel: string;
  episodes: GenesisEpisode[];
  topicChunks: GenesisTopicChunk[];
  facets: GenesisFacetCandidate[];
  scopeNodes: GenesisScopeNode[];
  sourceLinks: GenesisSourceLink[];
}

export interface BuildImportGenesisInput {
  importJobId: string;
  sourceFingerprint: string;
  sourceLabel: string;
  episodes: GenesisEpisodeInput[];
}

export interface GenesisValidationIssue {
  code:
    | "unknown_episode_reference"
    | "unknown_chunk_reference"
    | "unknown_scope_reference"
    | "unknown_facet_reference"
    | "facet_without_scope"
    | "source_link_without_target";
  message: string;
  id?: string;
}

export interface GenesisValidationResult {
  ok: boolean;
  issues: GenesisValidationIssue[];
}

export function buildImportGenesis(
  input: BuildImportGenesisInput
): BrainshareImportGenesis {
  const episodes = input.episodes.map((episode) => ({
    ...episode,
    kind: "episode" as const,
  }));
  const readableEpisodes = episodes.filter((episode) => episode.readable);
  const topicChunks = readableEpisodes.flatMap(buildTopicChunksForEpisode);
  const scopeSeedMap = new Map<string, GenesisScopeNode>();
  const facets: GenesisFacetCandidate[] = [];
  const sourceLinks: GenesisSourceLink[] = [];

  for (const chunk of topicChunks) {
    const seedTitle = chooseScopeSeed(chunk);
    const scopeId = `scope-${slugify(seedTitle)}`;
    if (!scopeSeedMap.has(scopeId)) {
      scopeSeedMap.set(scopeId, {
        id: scopeId,
        title: seedTitle,
        summary: `Working scope inferred from ${seedTitle} source evidence.`,
        rationale:
          "Created from repeated or high-signal source terms, not from fixture-specific rules.",
        parentId: null,
        attentionTier: "full",
        confidence: "medium",
        facetIds: [],
      });
    }

    const facet: GenesisFacetCandidate = {
      id: `facet-${chunk.id}`,
      type: "project",
      statement: seedTitle,
      primaryEpisodeId: chunk.episodeId,
      primaryChunkId: chunk.id,
      scopeId,
      conviction: "flag",
      humanSignal: findHumanSignalForChunk(episodes, chunk),
    };
    facets.push(facet);
    scopeSeedMap.get(scopeId)?.facetIds.push(facet.id);

    sourceLinks.push({
      id: `source-${scopeId}-${chunk.id}`,
      targetType: "scope",
      targetId: scopeId,
      episodeId: chunk.episodeId,
      chunkId: chunk.id,
      turnIds: chunk.turnIds,
      rationale: "Scope is supported by this topic chunk.",
    });
    sourceLinks.push({
      id: `source-${facet.id}`,
      targetType: "facet",
      targetId: facet.id,
      episodeId: chunk.episodeId,
      chunkId: chunk.id,
      turnIds: chunk.turnIds,
      rationale: "Facet is supported by this topic chunk.",
    });
  }

  return {
    importJobId: input.importJobId,
    sourceFingerprint: input.sourceFingerprint,
    sourceLabel: input.sourceLabel,
    episodes,
    topicChunks,
    facets,
    scopeNodes: Array.from(scopeSeedMap.values()),
    sourceLinks,
  };
}

export function validateImportGenesis(
  genesis: BrainshareImportGenesis
): GenesisValidationResult {
  const episodeIds = new Set(genesis.episodes.map((episode) => episode.id));
  const chunkIds = new Set(genesis.topicChunks.map((chunk) => chunk.id));
  const scopeIds = new Set(genesis.scopeNodes.map((scope) => scope.id));
  const facetIds = new Set(genesis.facets.map((facet) => facet.id));
  const issues: GenesisValidationIssue[] = [];

  for (const chunk of genesis.topicChunks) {
    if (!episodeIds.has(chunk.episodeId)) {
      issues.push({
        code: "unknown_episode_reference",
        message: `Topic chunk ${chunk.id} references unknown episode ${chunk.episodeId}.`,
        id: chunk.id,
      });
    }
  }

  for (const facet of genesis.facets) {
    if (!episodeIds.has(facet.primaryEpisodeId)) {
      issues.push({
        code: "unknown_episode_reference",
        message: `Facet ${facet.id} references unknown episode ${facet.primaryEpisodeId}.`,
        id: facet.id,
      });
    }
    if (!chunkIds.has(facet.primaryChunkId)) {
      issues.push({
        code: "unknown_chunk_reference",
        message: `Facet ${facet.id} references unknown chunk ${facet.primaryChunkId}.`,
        id: facet.id,
      });
    }
    if (!scopeIds.has(facet.scopeId)) {
      issues.push({
        code: "facet_without_scope",
        message: `Facet ${facet.id} references unknown scope ${facet.scopeId}.`,
        id: facet.id,
      });
    }
  }

  for (const link of genesis.sourceLinks) {
    if (!episodeIds.has(link.episodeId)) {
      issues.push({
        code: "unknown_episode_reference",
        message: `Source link ${link.id} references unknown episode ${link.episodeId}.`,
        id: link.id,
      });
    }
    if (link.chunkId !== null && !chunkIds.has(link.chunkId)) {
      issues.push({
        code: "unknown_chunk_reference",
        message: `Source link ${link.id} references unknown chunk ${link.chunkId}.`,
        id: link.id,
      });
    }
    if (link.targetType === "scope" && !scopeIds.has(link.targetId)) {
      issues.push({
        code: "unknown_scope_reference",
        message: `Source link ${link.id} references unknown scope ${link.targetId}.`,
        id: link.id,
      });
    }
    if (link.targetType === "facet" && !facetIds.has(link.targetId)) {
      issues.push({
        code: "unknown_facet_reference",
        message: `Source link ${link.id} references unknown facet ${link.targetId}.`,
        id: link.id,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

function buildTopicChunksForEpisode(
  episode: GenesisEpisode
): GenesisTopicChunk[] {
  const signalTurns =
    episode.candidateSignalTurns.length > 0
      ? episode.candidateSignalTurns
      : episode.turns.filter((turn) => turn.text.trim().length > 0).slice(0, 1);

  return signalTurns.map((turn, index) => {
    const title = chooseTitleFromText(turn.text, episode.displayTitle);
    return {
      id: `chunk-${episode.id}-${index + 1}`,
      episodeId: episode.id,
      title,
      summary: turn.text.slice(0, 240),
      turnIds: [turn.id],
      primaryTerms: extractCapitalizedPhrases(turn.text),
    };
  });
}

function chooseScopeSeed(chunk: GenesisTopicChunk): string {
  return chunk.primaryTerms[0] ?? chunk.title;
}

function findHumanSignalForChunk(
  episodes: GenesisEpisode[],
  chunk: GenesisTopicChunk
): string | null {
  const episode = episodes.find((item) => item.id === chunk.episodeId);
  if (!episode) return null;
  const chunkTurnIndex = episode.turns.findIndex((turn) =>
    chunk.turnIds.includes(turn.id)
  );
  const nearby = episode.turns.slice(chunkTurnIndex + 1, chunkTurnIndex + 3);
  const validation = nearby.find(
    (turn) =>
      turn.speaker === "human" &&
      /\b(yes|agree|right|makes sense|sounds right|exactly|great)\b/i.test(
        turn.text
      )
  );
  return validation?.text ?? null;
}

function chooseTitleFromText(text: string, fallback: string): string {
  return extractCapitalizedPhrases(text)[0] ?? fallback;
}

function extractCapitalizedPhrases(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3}\b/g);
  return Array.from(new Set(matches ?? [])).filter(
    (match) => !["The", "For", "First", "Later"].includes(match)
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
```

- [ ] **Step 4: Run the model test and verify it passes**

Run:

```bash
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: PASS with no output.

## Task 2: Signal Turns From Any Speaker

**Files:**
- Modify: `apps/platform/src/lib/claude-export-parser.ts`
- Modify: `apps/platform/src/lib/claude-export-parser.test.ts`

- [ ] **Step 1: Add failing parser test for AI turns accepted by humans**

Append this test to `apps/platform/src/lib/claude-export-parser.test.ts`:

```ts
const acceptedAiContext: ClaudeExportConversation = {
  uuid: "accepted-ai-1",
  name: "AI generated useful context",
  summary: "",
  created_at: "2026-04-05T10:00:00Z",
  updated_at: "2026-04-05T10:20:00Z",
  account: { uuid: "acct" },
  chat_messages: [
    {
      uuid: "ai-human-1",
      sender: "human",
      text: "Help me understand the onboarding shape.",
      content: [{ type: "text", text: "Help me understand the onboarding shape." }],
      created_at: "2026-04-05T10:00:01Z",
      updated_at: "2026-04-05T10:00:01Z",
      attachments: [],
      files: [],
    },
    {
      uuid: "ai-assistant-1",
      sender: "assistant",
      text: "The key distinction is activation versus trust: activation gets the user to value, trust makes the user comfortable giving the system more context.",
      content: [
        {
          type: "text",
          text: "The key distinction is activation versus trust: activation gets the user to value, trust makes the user comfortable giving the system more context.",
        },
      ],
      created_at: "2026-04-05T10:00:02Z",
      updated_at: "2026-04-05T10:00:02Z",
      attachments: [],
      files: [],
    },
    {
      uuid: "ai-human-2",
      sender: "human",
      text: "That makes a ton of sense. Let's use that.",
      content: [
        {
          type: "text",
          text: "That makes a ton of sense. Let's use that.",
        },
      ],
      created_at: "2026-04-05T10:00:03Z",
      updated_at: "2026-04-05T10:00:03Z",
      attachments: [],
      files: [],
    },
  ],
};

const acceptedAiParsed = buildClaudeExportReviewInput({
  conversations: [acceptedAiContext],
  projects: [],
  sourceLabel: "accepted ai synthetic export",
});

const acceptedAiConversation = acceptedAiParsed.conversations[0];
assert.match(
  acceptedAiConversation.highSignalTurns.join("\n"),
  /activation versus trust/
);
assert.equal(
  acceptedAiConversation.candidateSignalTurns?.some(
    (turn) =>
      turn.speaker === "assistant" &&
      turn.reason === "accepted_by_human" &&
      /activation versus trust/.test(turn.text)
  ),
  true
);
```

- [ ] **Step 2: Run the parser test and verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/claude-export-parser.test.ts
```

Expected: FAIL because `candidateSignalTurns` does not exist or accepted AI text is not selected.

- [ ] **Step 3: Extend parser turn types**

In `apps/platform/src/lib/claude-export-parser.ts`, import the Genesis signal types and extend `ClaudeReviewConversation`:

```ts
import type {
  GenesisSignalTurn,
  GenesisSpeaker,
  GenesisTurn,
} from "./brainshare-import-genesis";

export interface ClaudeReviewConversation extends ReviewConversation {
  sourceKind: "claude";
  sourceId: string;
  sourceTitle: string | null;
  titleKind: ClaudeReviewTitleKind;
  createdAt: string | null;
  updatedAtIso: string | null;
  humanMessageCount: number;
  approxContentLength: number;
  readable: boolean;
  excludeReason: ClaudeReviewExcludeReason | null;
  preliminarySignalScore: number;
  sourceTurns: GenesisTurn[];
  candidateSignalTurns: GenesisSignalTurn[];
}
```

- [ ] **Step 4: Build source turns and candidate signal turns from all speakers**

Inside `buildClaudeExportReviewInput`, after `readableMessages`, add:

```ts
const sourceTurns: GenesisTurn[] = readableMessages.map(({ message, text }, turnIndex) => ({
  id: normalizeWhitespace(typeof message.uuid === "string" ? message.uuid : "") ||
    `${sourceId}-turn-${turnIndex + 1}`,
  speaker: normalizeSpeaker(message.sender),
  text,
}));
const candidateSignalTurns = selectCandidateSignalTurnsFromTurns(sourceTurns);
```

Then set these on the returned conversation and keep the legacy string field:

```ts
highSignalTurns: candidateSignalTurns.map((turn) => turn.text).slice(0, 3),
sourceTurns,
candidateSignalTurns,
```

Add these exported helpers below `selectCandidateSignalTurns`:

```ts
export function selectCandidateSignalTurnsFromTurns(
  turns: GenesisTurn[]
): GenesisSignalTurn[] {
  const selected: GenesisSignalTurn[] = [];

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const nextHuman = turns
      .slice(index + 1, index + 3)
      .find((candidate) => candidate.speaker === "human");

    if (turn.speaker === "assistant" && nextHuman && isHumanValidation(nextHuman.text)) {
      selected.push({
        ...turn,
        reason: isHumanCorrection(nextHuman.text)
          ? "corrected_by_human"
          : "accepted_by_human",
        conviction: isHumanCorrection(nextHuman.text) ? "flag" : "assert",
      });
      continue;
    }

    if (turn.speaker === "human" && hasDecisionMarker(turn.text)) {
      selected.push({
        ...turn,
        reason: "decision_marker",
        conviction: "assert",
      });
      continue;
    }

    if (turn.speaker === "human" && turn.text.length > 80) {
      selected.push({
        ...turn,
        reason: "human_stated",
        conviction: "flag",
      });
    }
  }

  return dedupeSignalTurns(selected).slice(0, 5);
}

export function normalizeSpeaker(sender: unknown): GenesisSpeaker {
  if (sender === "human") return "human";
  if (sender === "assistant") return "assistant";
  if (sender === "system") return "system";
  if (sender === "agent") return "agent";
  return "unknown";
}

function isHumanValidation(text: string): boolean {
  return /\b(that makes (a ton of )?sense|sounds right|yes|agree|exactly|perfect|great|let'?s use that|looks good)\b/i.test(
    text
  );
}

function isHumanCorrection(text: string): boolean {
  return /\b(but|except|not quite|wrong|instead|correction|actually)\b/i.test(text);
}

function hasDecisionMarker(text: string): boolean {
  return /\b(decision|decided|let'?s|we should|we need|must|do not|don't|approve|approved)\b/i.test(
    text
  );
}

function dedupeSignalTurns(turns: GenesisSignalTurn[]): GenesisSignalTurn[] {
  const seen = new Set<string>();
  return turns.filter((turn) => {
    const key = `${turn.id}:${turn.text.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/claude-export-parser.test.ts
```

Expected: PASS with no output.

## Task 3: Generate Genesis From Claude Parse Output

**Files:**
- Modify: `apps/platform/src/lib/brainshare-import-genesis.ts`
- Modify: `apps/platform/src/lib/brainshare-import-genesis.test.ts`
- Modify: `apps/platform/src/lib/import-cluster-review.ts`

- [ ] **Step 1: Add failing adapter test**

Append to `apps/platform/src/lib/brainshare-import-genesis.test.ts`:

```ts
import { buildClaudeExportReviewInput } from "./claude-export-parser";

const claudeParsed = buildClaudeExportReviewInput({
  sourceLabel: "adapter synthetic export",
  projects: [],
  conversations: [
    {
      uuid: "adapter-1",
      name: "Project Maple and legal planning",
      summary: "",
      created_at: "2026-05-01T10:00:00Z",
      updated_at: "2026-05-01T11:00:00Z",
      chat_messages: [
        {
          uuid: "adapter-human-1",
          sender: "human",
          text: "Help me think about Project Maple launch.",
          content: [{ type: "text", text: "Help me think about Project Maple launch." }],
        },
        {
          uuid: "adapter-assistant-1",
          sender: "assistant",
          text: "Project Maple has product launch, positioning, and onboarding threads.",
          content: [
            {
              type: "text",
              text: "Project Maple has product launch, positioning, and onboarding threads.",
            },
          ],
        },
        {
          uuid: "adapter-human-2",
          sender: "human",
          text: "Yes, that sounds right. Separately, I need to understand visa paperwork.",
          content: [
            {
              type: "text",
              text: "Yes, that sounds right. Separately, I need to understand visa paperwork.",
            },
          ],
        },
      ],
    },
  ],
});

const adaptedGenesis = buildImportGenesisFromClaudeReviewInput(claudeParsed);
assert.equal(adaptedGenesis.episodes.length, 1);
assert.equal(adaptedGenesis.episodes[0].sourceTool, "claude");
assert.equal(adaptedGenesis.episodes[0].candidateSignalTurns.length > 0, true);
assert.equal(validateImportGenesis(adaptedGenesis).ok, true);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: FAIL because `buildImportGenesisFromClaudeReviewInput` is not defined.

- [ ] **Step 3: Implement adapter**

Add to `apps/platform/src/lib/brainshare-import-genesis.ts`:

```ts
import type { ClaudeExportReviewInput } from "./claude-export-parser";

export function buildImportGenesisFromClaudeReviewInput(
  input: ClaudeExportReviewInput
): BrainshareImportGenesis {
  return buildImportGenesis({
    importJobId: input.importJobId,
    sourceFingerprint: input.sourceFingerprint,
    sourceLabel: input.sourceLabel,
    episodes: input.conversations.map((conversation) => ({
      id: conversation.id,
      sourceTool: "claude",
      sourceTitle: conversation.sourceTitle,
      displayTitle: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAtIso,
      readable: conversation.readable ?? true,
      turns: conversation.sourceTurns ?? [],
      candidateSignalTurns: conversation.candidateSignalTurns ?? [],
    })),
  });
}
```

If TypeScript complains about mixed import position, move the import to the top of the file.

- [ ] **Step 4: Run genesis tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: PASS with no output.

## Task 4: Review State Carries Genesis State

**Files:**
- Modify: `apps/platform/src/lib/import-cluster-review.ts`
- Modify: `apps/platform/src/lib/import-cluster-review.test.ts`
- Modify: `apps/platform/src/lib/server/claude-export-loader.ts`

- [ ] **Step 1: Add failing review-state test**

Append to `apps/platform/src/lib/import-cluster-review.test.ts`:

```ts
import { buildImportGenesis } from "./brainshare-import-genesis";

const genesisForReview = buildImportGenesis({
  importJobId: "review-genesis",
  sourceFingerprint: "review-fingerprint",
  sourceLabel: "review synthetic",
  episodes: [
    {
      id: "episode-review-1",
      sourceTool: "claude",
      sourceTitle: "Project Cedar",
      displayTitle: "Project Cedar",
      createdAt: null,
      updatedAt: null,
      readable: true,
      turns: [
        {
          id: "turn-review-1",
          speaker: "human",
          text: "Project Cedar needs a launch thread.",
        },
      ],
      candidateSignalTurns: [
        {
          id: "turn-review-1",
          speaker: "human",
          text: "Project Cedar needs a launch thread.",
          reason: "human_stated",
          conviction: "flag",
        },
      ],
    },
  ],
});

const reviewFromGenesis = buildClusterReviewProposal([], {
  importJobId: "review-genesis",
  coverage: DEFAULT_IMPORT_COVERAGE,
  genesis: genesisForReview,
});

assert.ok(reviewFromGenesis.genesis);
assert.equal(reviewFromGenesis.clusters.length, genesisForReview.scopeNodes.length);
assert.equal(reviewFromGenesis.clusters[0].title, genesisForReview.scopeNodes[0].title);
assert.deepEqual(reviewFromGenesis.clusters[0].conversationIds, ["episode-review-1"]);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/import-cluster-review.test.ts
```

Expected: FAIL because `genesis` is not accepted or not present on state.

- [ ] **Step 3: Add genesis state to review types**

In `apps/platform/src/lib/import-cluster-review.ts`, import the type and extend options/state:

```ts
import type { BrainshareImportGenesis } from "./brainshare-import-genesis";

export interface ImportClusterReviewState {
  importJobId: string;
  coverage: ImportCoverageMetadata;
  clusters: ReviewCluster[];
  conversations: ReviewConversation[];
  questions: ReviewQuestion[];
  holdingAreas: Record<HoldingAreaId, string[]>;
  history: string[];
  lastInstructionResult: ReviewInstructionResult | null;
  genesis?: BrainshareImportGenesis;
}

export interface BuildClusterReviewProposalOptions {
  importJobId?: string;
  coverage?: ImportCoverageMetadata;
  genesis?: BrainshareImportGenesis;
}
```

If an options interface already exists, add only `genesis?: BrainshareImportGenesis`.

- [ ] **Step 4: Generate review clusters from scope nodes when genesis exists**

In `buildClusterReviewProposal`, before the existing domain clustering path, add:

```ts
if (options?.genesis) {
  return buildReviewProposalFromGenesis(options.genesis, {
    importJobId,
    coverage,
  });
}
```

Add helper:

```ts
function buildReviewProposalFromGenesis(
  genesis: BrainshareImportGenesis,
  input: { importJobId: string; coverage: ImportCoverageMetadata }
): ImportClusterReviewState {
  const episodeById = new Map(genesis.episodes.map((episode) => [episode.id, episode]));
  const conversations: ReviewConversation[] = genesis.episodes.map((episode) => ({
    id: episode.id,
    title: episode.displayTitle,
    messageCount: episode.turns.length,
    confidence: episode.readable ? "medium" : "low",
    updatedLabel: formatUpdatedLabel(episode.updatedAt),
    summary: episode.candidateSignalTurns[0]?.text ?? "Source episode from import.",
    firstHuman: episode.turns.find((turn) => turn.speaker === "human")?.text ?? "",
    lastHuman: [...episode.turns].reverse().find((turn) => turn.speaker === "human")?.text ?? "",
    highSignalTurns: episode.candidateSignalTurns.map((turn) => turn.text).slice(0, 3),
    rareTerms: [],
    rationale: "Source evidence for the provisional BrainShare scope map.",
    sourceKind: episode.sourceTool === "claude" ? "claude" : "sample",
    sourceId: episode.id,
    sourceTitle: episode.sourceTitle,
    readable: episode.readable,
    excludeReason: episode.readable ? null : "no_useful_text",
  }));

  const clusters: ReviewCluster[] = genesis.scopeNodes
    .map((scope) => {
      const episodeIds = Array.from(
        new Set(
          genesis.sourceLinks
            .filter((link) => link.targetType === "scope" && link.targetId === scope.id)
            .map((link) => link.episodeId)
            .filter((episodeId) => episodeById.has(episodeId))
        )
      );
      return {
        id: scope.id,
        title: scope.title,
        confidence: scope.confidence,
        rationale: scope.rationale,
        conversationIds: episodeIds,
      };
    })
    .filter((cluster) => cluster.conversationIds.length > 0);

  const clusteredIds = new Set(clusters.flatMap((cluster) => cluster.conversationIds));
  const excluded = conversations
    .filter((conversation) => conversation.readable === false)
    .map((conversation) => conversation.id);
  const oneOffs = conversations
    .filter(
      (conversation) =>
        !clusteredIds.has(conversation.id) && conversation.readable !== false
    )
    .map((conversation) => conversation.id);

  return withSyncedPlacementCoverage({
    importJobId: input.importJobId,
    coverage: input.coverage,
    clusters,
    conversations,
    questions: [],
    holdingAreas: {
      ambiguous: [],
      oneOffs,
      excluded,
    },
    history: [],
    lastInstructionResult: null,
    genesis,
  });
}
```

If `formatUpdatedLabel` or `withSyncedPlacementCoverage` are not in scope, move the helper below those functions or export/reuse the existing local helper names.

- [ ] **Step 5: Wire loader to pass genesis**

In `apps/platform/src/lib/server/claude-export-loader.ts`, after parsing:

```ts
const genesis = buildImportGenesisFromClaudeReviewInput(parsed);
return buildClusterReviewProposal(parsed.conversations, {
  importJobId: parsed.importJobId,
  coverage: parsed.coverage,
  genesis,
});
```

Add import:

```ts
import { buildImportGenesisFromClaudeReviewInput } from "@/lib/brainshare-import-genesis";
```

- [ ] **Step 6: Run review tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/import-cluster-review.test.ts
```

Expected: PASS with no output.

## Task 5: Fixture-Agnostic Guardrail

**Files:**
- Modify: `apps/platform/src/lib/brainshare-import-genesis.test.ts`

- [ ] **Step 1: Add test scanning production import logic for local prophecies**

Append to `apps/platform/src/lib/brainshare-import-genesis.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const productionImportFiles = [
  "apps/platform/src/lib/brainshare-import-genesis.ts",
  "apps/platform/src/lib/claude-export-parser.ts",
  "apps/platform/src/lib/server/claude-export-loader.ts",
];

const forbiddenFixtureProphecies = [
  "Burn",
  "Factor",
  "TribeWild",
  "Anthropic",
  "WorkOS / BrainShare / Swarm",
];

for (const relativePath of productionImportFiles) {
  const source = readFileSync(join(repoRoot, relativePath), "utf8");
  for (const prophecy of forbiddenFixtureProphecies) {
    assert.equal(
      source.includes(prophecy),
      false,
      `${relativePath} must not hard-code fixture-specific scope "${prophecy}"`
    );
  }
}
```

- [ ] **Step 2: Run test and verify current failures are legitimate**

Run:

```bash
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: PASS. The guardrail intentionally scans the new parser/genesis/loader path, not the legacy sample fixture embedded in `import-cluster-review.ts`.

- [ ] **Step 3: Run guardrail test after any synthesis changes**

Run:

```bash
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: PASS with no output.

## Task 6: Scope Review UI Copy And Detail Panel

**Files:**
- Modify: `apps/platform/src/components/import/cluster-review-surface.tsx`
- Modify: `apps/platform/src/components/import/conversation-chip.tsx`
- Modify: `apps/platform/src/components/import/conversation-detail-panel.tsx`
- Modify: `apps/platform/src/components/import/cluster-review-question.tsx`

- [ ] **Step 1: Update main copy from clusters to scope map**

In `cluster-review-surface.tsx`, replace user-facing strings:

```ts
const reviewTitle = "BrainShare import genesis";
const reviewSubtitle =
  "Review the first map of what WorkOS thinks matters in this source history.";
const approveLabel = "Approve Map & Continue";
const composerPlaceholder = "Tell WorkOS how to adjust the scope map...";
```

Use these constants wherever the page currently says cluster map, clusters, or generate starter context.

- [ ] **Step 2: Update source chip language**

In `conversation-chip.tsx`, keep the component name for now but change accessible labels/tooltips to describe source evidence:

```ts
const detailLabel = `Inspect source evidence: ${conversation.title}`;
```

Ensure the button/chip still renders only the source title by default.

- [ ] **Step 3: Show genesis details in side panel when available**

In `conversation-detail-panel.tsx`, add optional props:

```ts
import type { BrainshareImportGenesis } from "@/lib/brainshare-import-genesis";

export interface ConversationDetailPanelProps {
  conversation: ReviewConversation | null;
  onClose: () => void;
  genesis?: BrainshareImportGenesis;
}
```

Inside the component:

```ts
const episode = props.genesis?.episodes.find(
  (item) => item.id === conversation?.id
);
const chunks = props.genesis?.topicChunks.filter(
  (chunk) => chunk.episodeId === episode?.id
) ?? [];
const facets = props.genesis?.facets.filter((facet) =>
  chunks.some((chunk) => chunk.id === facet.primaryChunkId)
) ?? [];
```

Render sections titled `Episode`, `Topic Chunks`, and `Facet Candidates` when `episode` exists. Keep the existing fallback detail display when genesis is absent.

- [ ] **Step 4: Pass genesis from surface to side panel**

In `cluster-review-surface.tsx`, where `ConversationDetailPanel` is rendered, pass:

```tsx
genesis={state.genesis}
```

- [ ] **Step 5: Run TypeScript**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

## Task 7: Natural-Language Scope Commands

**Files:**
- Modify: `apps/platform/src/lib/import-cluster-review.ts`
- Modify: `apps/platform/src/lib/import-cluster-review.test.ts`

- [ ] **Step 1: Add tests for rename and delete scope commands**

Append to `apps/platform/src/lib/import-cluster-review.test.ts`:

```ts
const renamedScopeState = applyReviewInstruction(reviewFromGenesis, {
  text: "rename Project Cedar to Cedar Launch",
});
assert.equal(renamedScopeState.lastInstructionResult?.status, "applied");
assert.equal(renamedScopeState.clusters[0].title, "Cedar Launch");
assert.equal(renamedScopeState.genesis?.scopeNodes[0].title, "Cedar Launch");

const deletedScopeState = applyReviewInstruction(renamedScopeState, {
  text: "delete Cedar Launch",
});
assert.equal(deletedScopeState.lastInstructionResult?.status, "applied");
assert.equal(deletedScopeState.clusters.length, 0);
assert.equal(deletedScopeState.genesis?.scopeNodes.length, 0);
assert.deepEqual(deletedScopeState.holdingAreas.oneOffs, ["episode-review-1"]);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx --yes tsx apps/platform/src/lib/import-cluster-review.test.ts
```

Expected: FAIL because rename/delete scope commands are not implemented.

- [ ] **Step 3: Implement command parsing**

In `applyReviewInstruction`, before the generic fallback, add:

```ts
const renameMatch = normalized.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
if (renameMatch) {
  return renameReviewScope(state, renameMatch[1].trim(), renameMatch[2].trim());
}

const deleteMatch = normalized.match(/^(delete|remove)\s+(.+)$/i);
if (deleteMatch) {
  return deleteReviewScope(state, deleteMatch[2].trim());
}
```

Add helpers:

```ts
function renameReviewScope(
  state: ImportClusterReviewState,
  currentTitle: string,
  nextTitle: string
): ImportClusterReviewState {
  const cluster = state.clusters.find((item) =>
    titlesMatch(item.title, currentTitle)
  );
  if (!cluster) {
    return {
      ...state,
      lastInstructionResult: {
        status: "not_understood",
        message: `I could not find a scope named "${currentTitle}".`,
      },
    };
  }

  return {
    ...state,
    clusters: state.clusters.map((item) =>
      item.id === cluster.id ? { ...item, title: nextTitle } : item
    ),
    genesis: state.genesis
      ? {
          ...state.genesis,
          scopeNodes: state.genesis.scopeNodes.map((scope) =>
            scope.id === cluster.id ? { ...scope, title: nextTitle } : scope
          ),
        }
      : state.genesis,
    history: [...state.history, `Renamed ${cluster.title} to ${nextTitle}.`],
    lastInstructionResult: {
      status: "applied",
      message: `Renamed ${cluster.title} to ${nextTitle}.`,
    },
  };
}

function deleteReviewScope(
  state: ImportClusterReviewState,
  title: string
): ImportClusterReviewState {
  const cluster = state.clusters.find((item) => titlesMatch(item.title, title));
  if (!cluster) {
    return {
      ...state,
      lastInstructionResult: {
        status: "not_understood",
        message: `I could not find a scope named "${title}".`,
      },
    };
  }

  const nextState: ImportClusterReviewState = {
    ...state,
    clusters: state.clusters.filter((item) => item.id !== cluster.id),
    genesis: state.genesis
      ? {
          ...state.genesis,
          scopeNodes: state.genesis.scopeNodes.filter(
            (scope) => scope.id !== cluster.id
          ),
          facets: state.genesis.facets.filter(
            (facet) => facet.scopeId !== cluster.id
          ),
          sourceLinks: state.genesis.sourceLinks.filter(
            (link) => link.targetId !== cluster.id
          ),
        }
      : state.genesis,
    holdingAreas: {
      ...state.holdingAreas,
      oneOffs: Array.from(
        new Set([...state.holdingAreas.oneOffs, ...cluster.conversationIds])
      ),
    },
    history: [...state.history, `Deleted ${cluster.title}.`],
    lastInstructionResult: {
      status: "applied",
      message: `Deleted ${cluster.title}.`,
    },
  };

  return withSyncedPlacementCoverage(nextState);
}

function titlesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
```

- [ ] **Step 4: Run review tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/import-cluster-review.test.ts
```

Expected: PASS with no output.

## Task 8: Local Export Acceptance Smoke

**Files:**
- Modify: `apps/platform/src/lib/brainshare-import-genesis.test.ts`

- [ ] **Step 1: Add env-gated local acceptance checks without hard-coded production logic**

Append:

```ts
const localExportPath = process.env.WORKOS_TEST_CLAUDE_EXPORT_PATH;
if (localExportPath) {
  const localRaw = JSON.parse(readFileSync(localExportPath, "utf8")) as unknown;
  const localParsed = buildClaudeExportReviewInput({
    conversations: localRaw,
    projects: [],
    sourceLabel: "local claude export",
  });
  const localGenesis = buildImportGenesisFromClaudeReviewInput(localParsed);
  const localValidation = validateImportGenesis(localGenesis);

  assert.equal(localValidation.ok, true);
  assert.equal(localGenesis.episodes.length, localParsed.coverage.totalConversations);
  assert.equal(
    localGenesis.scopeNodes.length > 0,
    true,
    "local export should produce at least one proposed scope"
  );
  assert.equal(
    localGenesis.sourceLinks.every((link) =>
      localGenesis.episodes.some((episode) => episode.id === link.episodeId)
    ),
    true
  );

  const expectedScopeHints = (process.env.WORKOS_TEST_EXPECTED_SCOPE_HINTS ?? "")
    .split(",")
    .map((hint) => hint.trim())
    .filter(Boolean);

  for (const hint of expectedScopeHints) {
    const found = localGenesis.scopeNodes.some((scope) =>
      scope.title.toLowerCase().includes(hint.toLowerCase())
    );
    assert.equal(found, true, `Expected local scope hint "${hint}" to emerge`);
  }
}
```

- [ ] **Step 2: Run without env**

Run:

```bash
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: PASS with no output.

- [ ] **Step 3: Run with local export env**

Run:

```bash
WORKOS_TEST_CLAUDE_EXPORT_PATH=/Users/williamcorbett/Desktop/data-bc0453c6-4cc0-48a1-82dd-e1aec00a7707-1781745018-c2af8457-batch-0000/conversations.json \
WORKOS_TEST_EXPECTED_SCOPE_HINTS="Burn,Factor,TribeWild" \
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
```

Expected: PASS only if those hints emerge from source evidence. If it fails, improve generic extraction/synthesis logic; do not add those strings to production code.

## Task 9: Full Verification

**Files:**
- No new files unless verification reveals a bug.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/claude-export-parser.test.ts
npx --yes tsx apps/platform/src/lib/brainshare-import-genesis.test.ts
npx --yes tsx apps/platform/src/lib/import-cluster-review.test.ts
npx --yes tsx apps/platform/src/lib/import-review-persistence.test.ts
```

Expected: all pass with no output.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint --workspace @workos/platform
```

Expected: PASS.

- [ ] **Step 4: Browser smoke on local export**

Start or reuse the dev server:

```bash
WORKOS_IMPORT_SAMPLE_PATH=/Users/williamcorbett/Desktop/data-bc0453c6-4cc0-48a1-82dd-e1aec00a7707-1781745018-c2af8457-batch-0000/conversations.json npm run dev --workspace @workos/platform
```

Open `http://localhost:3000/import` and verify:

- total source count renders
- page copy refers to BrainShare import/map/scopes, not chat clusters
- source evidence chips open a side panel
- side panel shows Episode/Topic Chunk/Facet detail when genesis exists
- toggles and natural-language commands do not blank the page
- `rename <scope> to <new name>` works
- `delete <scope>` works and moves its evidence to one-offs

## Self-Review Notes

- Spec coverage: Episodes, Topic Chunks, Facet Candidates, Scope Nodes, Source Links, no hard-coded prophecies, AI-generated signal with human validation, scope review UI, and local acceptance are all mapped to tasks.
- Intentional deferral: this plan does not call Anthropic or stand up Graphiti. It creates the provisional model and keeps LLM synthesis as a later interchangeable module.
- Risk: deterministic scope synthesis may still be weaker than the desired wow moment. The local acceptance step should guide generic improvements, not fixture-specific rules.
