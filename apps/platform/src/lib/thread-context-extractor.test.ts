import assert from "node:assert/strict";
import {
  buildPostTurnMemoryExtractionPrompt,
  extractThreadContextSheetPostTurnUpdate,
  parsePostTurnAnalysis,
  parsePostTurnMemoryExtraction,
} from "./thread-context-extractor.ts";
import type { ThreadContextSheet } from "./types.ts";

const existingSheet: ThreadContextSheet = {
  id: "sheet-1",
  instance_id: "instance-1",
  thread_id: "thread-1",
  active_working: [
    {
      id: "active-old",
      statement: "Current focus: financial planning.",
      source_refs: [],
      status: "active",
    },
  ],
  short_term: [],
  long_term: [
    {
      id: "old-runway",
      statement: "From \"Career and Finance Strategy\": Runway was 6-8 weeks.",
      source_refs: [{ source_node_id: "career-finance" }],
      status: "active",
    },
  ],
  markdown: "",
  metadata: {},
  created_at: "2026-07-02T12:00:00.000Z",
  updated_at: "2026-07-02T12:00:00.000Z",
};

const prompt = buildPostTurnMemoryExtractionPrompt({
  threadTitle: "Finances",
  userText:
    "Actually my cash is now $42k and burn is closer to $7k/month. I want to plan runway first.",
  assistantText:
    "That updates the runway picture: about six months of cash before touching investments. The next focus is runway planning.",
  existingSheet,
  attachedContextFacts: [
    {
      sourceTitle: "Career and Finance Strategy",
      sourceRole: "core",
      facts: [
        "Apple stock transfer should not be treated as available until it lands.",
      ],
    },
  ],
});

assert.match(prompt.system, /Return strict JSON only/);
assert.match(prompt.user, /old-runway/);
assert.match(prompt.user, /Apple stock transfer/);
assert.ok(prompt.user.length < 8000);

const parsed = parsePostTurnMemoryExtraction(
  JSON.stringify({
    active_working: [
      "Current focus: runway planning with updated cash and burn.",
    ],
    short_term: [
      "The next useful step is to update cash, income, and burn assumptions before modeling housing or investments.",
    ],
    long_term: [
      "Current cash is now $42k and monthly burn is closer to $7k.",
      "Apple stock transfer should not be treated as available until it lands.",
    ],
    superseded_long_term_ids: ["old-runway"],
  }),
  {
    existingSheet,
    now: new Date("2026-07-02T12:30:00.000Z"),
  }
);

assert.equal(parsed.activeWorking?.length, 1);
assert.equal(parsed.shortTerm?.length, 1);
assert.equal(parsed.longTerm?.length, 3);
assert.equal(
  parsed.longTerm?.find((item) => item.id === "old-runway")?.status,
  "superseded"
);
assert.deepEqual(
  parsed.longTerm
    ?.filter((item) => item.status !== "superseded")
    .map((item) => item.statement),
  [
    "Current cash is now $42k and monthly burn is closer to $7k.",
    "Apple stock transfer should not be treated as available until it lands.",
  ]
);

const invalid = parsePostTurnMemoryExtraction("not json", {
  existingSheet,
  now: new Date("2026-07-02T12:40:00.000Z"),
});
assert.deepEqual(invalid, {});

const analysis = parsePostTurnAnalysis(
  JSON.stringify({
    active_working: ["Current focus: ship the read-only trace panel."],
    short_term: [],
    long_term: [],
    superseded_long_term_ids: [],
    answer_anchors: [
      {
        statement: "Ship read-only inspection first.",
        belief_refs: ["claim-1"],
        evidence_refs: ["evidence-1"],
      },
    ],
    proposed_claims: [
      {
        kind: "decision",
        statement: "Ship read-only inspection first.",
        origin: "human",
        human_signal: "explicit_approval",
        source_quote: "I approve shipping read-only inspection first.",
      },
      {
        kind: "decision",
        statement: "The assistant invented this decision.",
        origin: "human",
        human_signal: "explicit_approval",
        source_quote: "This sentence is not in the user message.",
      },
    ],
  }),
  {
    existingSheet,
    allowedClaimIds: new Set(["claim-1"]),
    allowedEvidenceIds: new Set(["evidence-1"]),
    userText: "I approve shipping read-only inspection first.",
    now: new Date("2026-07-02T12:40:00.000Z"),
  }
);

assert.deepEqual(analysis.answerAnchors, [
  {
    id: "post-turn-anchor-1",
    statement: "Ship read-only inspection first.",
    belief_refs: ["claim-1"],
    evidence_refs: ["evidence-1"],
    mapping_kind: "structured_post_turn_association",
  },
]);
assert.equal(analysis.proposedClaims[0].status, "active");
assert.equal(analysis.proposedClaims[0].posture, "assert");
assert.deepEqual(analysis.proposedClaims[0].source_span, {
  start: 0,
  end: 46,
  text: "I approve shipping read-only inspection first.",
});
assert.equal(analysis.proposedClaims[1].status, "tentative");
assert.equal(analysis.proposedClaims[1].posture, "ask");
assert.equal(analysis.proposedClaims[1].human_signal, "none");
assert.equal(analysis.proposedClaims[1].origin, "assistant");
assert.equal(analysis.associationStatus, "structured");
assert.deepEqual(analysis.associationWarnings, []);

const invalidAssociations = parsePostTurnAnalysis(
  JSON.stringify({
    answer_anchors: [
      {
        statement: "Invented references must be rejected.",
        belief_refs: ["not-selected"],
        evidence_refs: ["not-selected-evidence"],
      },
    ],
  }),
  {
    existingSheet,
    allowedClaimIds: new Set(["claim-1"]),
    allowedEvidenceIds: new Set(["evidence-1"]),
    userText: "No new durable fact here.",
  }
);
assert.equal(invalidAssociations.associationStatus, "invalid");
assert.match(invalidAssociations.associationWarnings.join(" "), /not selected/i);

const ungroundedAuthority = parsePostTurnAnalysis(
  JSON.stringify({
    answer_anchors: [{ statement: "No durable claim was used." }],
    proposed_claims: [
      {
        kind: "decision",
        statement: "Launch directly to production.",
        origin: "human",
        human_signal: "explicit_approval",
        source_quote: "I can review the draft tomorrow.",
      },
    ],
  }),
  {
    existingSheet,
    allowedClaimIds: new Set(),
    allowedEvidenceIds: new Set(),
    userText: "I can review the draft tomorrow.",
  }
);
assert.equal(ungroundedAuthority.proposedClaims[0]?.origin, "assistant");
assert.equal(ungroundedAuthority.proposedClaims[0]?.human_signal, "none");
assert.equal(ungroundedAuthority.proposedClaims[0]?.posture, "ask");

const negatedApproval = parsePostTurnAnalysis(
  JSON.stringify({
    answer_anchors: [{ statement: "Approval remains unresolved." }],
    proposed_claims: [
      {
        kind: "decision",
        statement: "Launch Friday.",
        origin: "human",
        human_signal: "explicit_approval",
        source_quote: "I have not approved launching Friday.",
      },
    ],
  }),
  {
    existingSheet,
    allowedClaimIds: new Set(),
    allowedEvidenceIds: new Set(),
    userText: "I have not approved launching Friday.",
  }
);
assert.equal(negatedApproval.proposedClaims[0]?.origin, "assistant");
assert.equal(negatedApproval.proposedClaims[0]?.human_signal, "none");
assert.equal(negatedApproval.proposedClaims[0]?.status, "tentative");

for (const ambiguousText of [
  "We could launch Friday.",
  "We may launch Friday.",
  "I doubt we launch Friday.",
  "I haven't approved launching Friday.",
]) {
  const ambiguousAuthority = parsePostTurnAnalysis(
    JSON.stringify({
      answer_anchors: [{ statement: "The launch remains tentative." }],
      proposed_claims: [
        {
          kind: "decision",
          statement: ambiguousText.includes("approved")
            ? "I approved launching Friday."
            : "We launch Friday.",
          origin: "human",
          human_signal: "explicit_statement",
          source_quote: ambiguousText,
        },
      ],
    }),
    {
      existingSheet,
      allowedClaimIds: new Set(),
      allowedEvidenceIds: new Set(),
      userText: ambiguousText,
    }
  );
  assert.equal(
    ambiguousAuthority.proposedClaims[0]?.status,
    "tentative",
    `ambiguous human text must not become authoritative: ${ambiguousText}`
  );
  assert.equal(ambiguousAuthority.proposedClaims[0]?.human_signal, "none");
}

async function main() {
  const extracted = await extractThreadContextSheetPostTurnUpdate(
    {
      threadTitle: "Finances",
      userText: "My current cash is now $42k.",
      assistantText: "Use $42k as the current cash baseline.",
      existingSheet,
      attachedContextFacts: [],
      now: new Date("2026-07-02T12:35:00.000Z"),
    },
    async () =>
      JSON.stringify({
        active_working: ["Current focus: runway planning."],
        short_term: [],
        long_term: ["Current cash is now $42k."],
        superseded_long_term_ids: [],
      })
  );

  assert.deepEqual(
    extracted.longTerm
      ?.filter((item) => item.status !== "superseded")
      .map((item) => item.statement),
    ["Current cash is now $42k."]
  );
}

main().catch((err: unknown) => {
  throw err;
});
