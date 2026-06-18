export type ReviewConfidence = "high" | "medium" | "low";
export type HoldingAreaId = "ambiguous" | "oneOffs" | "excluded";

export interface ReviewConversation {
  id: string;
  title: string;
  messageCount: number;
  confidence: ReviewConfidence;
  updatedLabel: string;
  summary: string;
  firstHuman: string;
  lastHuman: string;
  highSignalTurns: string[];
  rareTerms: string[];
  rationale: string;
}

export interface ReviewCluster {
  id: string;
  title: string;
  confidence: ReviewConfidence;
  rationale: string;
  conversationIds: string[];
}

export interface ReviewQuestion {
  id: string;
  label: string;
  enabled: boolean;
  affectedConversationIds: string[];
  preview: string;
  onOperations: ReviewOperation[];
  offOperations: ReviewOperation[];
}

export interface ReviewOperation {
  type: "move_conversation" | "create_cluster";
  conversationId?: string;
  cluster?: ReviewCluster;
  target?: ReviewLocation;
}

export type ReviewLocation =
  | { type: "cluster"; id: string }
  | { type: "holding"; id: HoldingAreaId };

export interface ReviewInstructionResult {
  status: "applied" | "needs_confirmation" | "not_understood";
  message: string;
}

export interface ImportClusterReviewState {
  importJobId: string;
  clusters: ReviewCluster[];
  conversations: ReviewConversation[];
  questions: ReviewQuestion[];
  holdingAreas: Record<HoldingAreaId, string[]>;
  history: string[];
  lastInstructionResult: ReviewInstructionResult | null;
}

const WORKOS_IDS = [
  "conv-workos-investigation",
  "conv-swarm-brainshare",
  "conv-workos-competitive",
  "conv-brainshare-ingestion",
  "conv-brainshare-gig",
  "conv-factor-brainshare",
  "conv-prompt-engineering",
  "conv-vibe-coding",
  "conv-openclaw",
  "conv-cross-chat-context",
];

const ANTHROPIC_IDS = [
  "conv-danny-anthropic",
  "conv-anthropic-jds",
  "conv-anthropic-talent",
];

const IMMIGRATION_IDS = ["conv-immigration-stem-opt", "conv-uscis-policy"];

const VEGAS_IDS = [
  "conv-vegas-itinerary",
  "conv-bachelor-game",
  "conv-craps-rules",
];

const CONVERSATIONS: ReviewConversation[] = [
  {
    id: "conv-workos-investigation",
    title: "Work OS - investigation",
    messageCount: 378,
    confidence: "high",
    updatedLabel: "Jun 18",
    summary:
      "Long-running product investigation around WorkOS, BrainShare, Swarm, Finiti, testing, target users, and ecosystem shape.",
    firstHuman: "Explore WorkOS as a product and ecosystem.",
    lastHuman: "Refine the WorkOS / BrainShare / Swarm direction.",
    highSignalTurns: [
      "WorkOS should become the surface where human collaboration, agent work, project state, and memory come together.",
      "The product should support people and agents in one shared operating flow.",
    ],
    rareTerms: ["WorkOS", "BrainShare", "Swarm", "Finiti", "recursive", "import"],
    rationale:
      "Highest-signal conversation for the product ecosystem and import/starter-context work.",
  },
  {
    id: "conv-swarm-brainshare",
    title: "Swarm, Brainshare",
    messageCount: 50,
    confidence: "high",
    updatedLabel: "Jun 17",
    summary:
      "Origin thread covering Burn, Swarm, BrainShare, agentic workflows, and the explanatory-context thesis.",
    firstHuman:
      "I am working on a development project with friends called Burn using Claude Code.",
    lastHuman:
      "Competitive landscape review for BrainShare and adjacent memory/context products.",
    highSignalTurns: [
      "I want to manage agents as closely to people as possible.",
      "My hypothesis is that there is a stable meta-structure to context at the level of explanations.",
    ],
    rareTerms: ["Burn", "Swarm", "BrainShare", "Factor.AI", "Deutsch"],
    rationale:
      "Explains the early product thesis and why unified human/agent flow matters.",
  },
  {
    id: "conv-workos-competitive",
    title: "Competitive analysis of WorkOS using Gartner framework",
    messageCount: 22,
    confidence: "high",
    updatedLabel: "Apr 28",
    summary:
      "Competitive and category analysis for WorkOS, BrainShare, Swarm, and Finiti.",
    firstHuman: "Analyze the competitive landscape for WorkOS.",
    lastHuman: "Use Gartner-style framing to sharpen the market position.",
    highSignalTurns: [
      "WorkOS encompasses BrainShare, Swarm, and Finiti.",
      "Clarify the market category and wedge.",
    ],
    rareTerms: ["Gartner", "WorkOS", "Swarm", "Finiti", "market"],
    rationale:
      "Adds positioning and competitive structure to the product cluster.",
  },
  {
    id: "conv-brainshare-ingestion",
    title: "Brainshare ingestion test results",
    messageCount: 2,
    confidence: "high",
    updatedLabel: "May 5",
    summary:
      "Evaluation of the first BrainShare ingestion test and structured JSON output.",
    firstHuman: "Review the first BrainShare ingestion test results.",
    lastHuman: "Assess what the extraction got right and wrong.",
    highSignalTurns: [
      "This is output from the first BrainShare ingestion test.",
    ],
    rareTerms: ["ingestion", "JSON", "BrainShare", "primitive"],
    rationale:
      "Shows actual testing evidence for the BrainShare extraction pipeline.",
  },
  {
    id: "conv-brainshare-gig",
    title: "Evaluating Brainshare gig applications",
    messageCount: 39,
    confidence: "high",
    updatedLabel: "May 18",
    summary:
      "Hiring/applicant review for building BrainShare and describing the broader ecosystem.",
    firstHuman: "Evaluate applications for a BrainShare build gig.",
    lastHuman: "Compare candidates and next steps.",
    highSignalTurns: [
      "BrainShare is a shared causal memory and context layer for work.",
    ],
    rareTerms: ["Contra", "BrainShare", "gig", "candidate"],
    rationale:
      "Captures how the product was described to potential builders.",
  },
  {
    id: "conv-factor-brainshare",
    title: "Factor vs Brainshare differentiation",
    messageCount: 2,
    confidence: "medium",
    updatedLabel: "May 4",
    summary:
      "Differentiation between Factor/Vega history and the BrainShare direction.",
    firstHuman: "Find the relevant reflection call and compare Factor to BrainShare.",
    lastHuman: "Use this as context for differentiation.",
    highSignalTurns: [
      "How is BrainShare meaningfully different from Factor?",
    ],
    rareTerms: ["Factor", "BrainShare", "differentiation", "Neel"],
    rationale:
      "Useful origin/background context, but may be less central than product design chats.",
  },
  {
    id: "conv-prompt-engineering",
    title: "Prompt engineering insights",
    messageCount: 2,
    confidence: "medium",
    updatedLabel: "May 4",
    summary:
      "Analysis of prompt engineering workflows through the lens of WorkOS and Swarm.",
    firstHuman: "Analyze a conversation about prompt engineering techniques.",
    lastHuman: "Connect prompt workflows to career and product work.",
    highSignalTurns: [
      "Analyze this through the lens of WorkOS and Anthropic.",
    ],
    rareTerms: ["prompt", "Neel", "WorkOS", "Swarm"],
    rationale:
      "Adjacent context about workflows that may inform product architecture.",
  },
  {
    id: "conv-vibe-coding",
    title: "Vibe coding and agents",
    messageCount: 6,
    confidence: "medium",
    updatedLabel: "Mar 5",
    summary:
      "Learning and strategy around vibe coding, Claude Code, Burn, and multi-agent orchestration.",
    firstHuman: "Translate and explain a technical article about vibe coding.",
    lastHuman: "Relate agent orchestration techniques to Burn and Swarm.",
    highSignalTurns: [
      "I am building Burn and Swarm using Claude Code.",
    ],
    rareTerms: ["Claude Code", "Burn", "Swarm", "agents"],
    rationale:
      "May belong in WorkOS as agent-tooling context or in a separate dev-technique cluster.",
  },
  {
    id: "conv-openclaw",
    title: "Choosing an OpenClaw messaging channel",
    messageCount: 34,
    confidence: "medium",
    updatedLabel: "Apr 4",
    summary:
      "Setup decisions for an AI agent/bot platform while actively building Swarm.",
    firstHuman: "Choose a messaging channel for OpenClaw.",
    lastHuman: "Configure agent platform options with collaborators.",
    highSignalTurns: [
      "Swarm is an agentic orchestration layer.",
    ],
    rareTerms: ["OpenClaw", "Swarm", "Discord", "agent"],
    rationale:
      "Agent-tooling adjacent to Swarm; may be core or support context.",
  },
  {
    id: "conv-cross-chat-context",
    title: "Cross-chat context and model switching",
    messageCount: 2,
    confidence: "medium",
    updatedLabel: "Apr 10",
    summary:
      "Short continuity/meta conversation about preserving context across Claude chats.",
    firstHuman: "Can this model see the context from the prior project chat?",
    lastHuman: "Clarify cross-chat continuity.",
    highSignalTurns: [
      "I am switching models while maintaining project context.",
    ],
    rareTerms: ["cross-chat", "context", "model"],
    rationale:
      "Small but relevant to the import/cold-start problem.",
  },
  {
    id: "conv-burn",
    title: "Burn",
    messageCount: 18,
    confidence: "medium",
    updatedLabel: "Apr 20",
    summary:
      "LinkedIn and positioning work for Burn, a gamified social fitness app built with co-founders.",
    firstHuman: "Write a LinkedIn business page description for Burn.",
    lastHuman: "Tighten Burn positioning.",
    highSignalTurns: [
      "Burn is Strava meets Mario Kart.",
    ],
    rareTerms: ["Burn", "fitness", "Chris", "Marek"],
    rationale:
      "May be independent positioning or dogfood context for agentic WorkOS workflows.",
  },
  {
    id: "conv-ai-coaching",
    title: "AI coaching business",
    messageCount: 132,
    confidence: "medium",
    updatedLabel: "May 20",
    summary:
      "Independent consulting/coaching business and AI Fluency Program strategy.",
    firstHuman: "Develop an AI coaching business offer.",
    lastHuman: "Refine consulting positioning.",
    highSignalTurns: [
      "Build AI fluency and coaching offers from my Factor experience.",
    ],
    rareTerms: ["AFP", "Saglo", "coaching", "consulting"],
    rationale:
      "Core independent business context, distinct from product-building.",
  },
  {
    id: "conv-personal-website",
    title: "Building a personal website",
    messageCount: 2,
    confidence: "medium",
    updatedLabel: "Apr 24",
    summary:
      "Personal website project connecting career arc, active projects, and worldview.",
    firstHuman: "Start building a personal website.",
    lastHuman: "Frame identity and project context.",
    highSignalTurns: [
      "Use the substantial context about my career arc and active projects.",
    ],
    rareTerms: ["website", "portfolio", "career"],
    rationale:
      "Professional identity context adjacent to business and career clusters.",
  },
  {
    id: "conv-speaking-research",
    title: "Career path: speaking talent vs. research passion",
    messageCount: 42,
    confidence: "medium",
    updatedLabel: "Jun 10",
    summary:
      "Reflective career coaching around speaking talent, research interest, and identity.",
    firstHuman: "I gave a strong wedding speech and want to explore what that means.",
    lastHuman: "Synthesize career implications.",
    highSignalTurns: [
      "Maybe public speaking is a real capability I should take seriously.",
    ],
    rareTerms: ["speaking", "research", "career", "wedding"],
    rationale:
      "Adjacent to independent positioning and career strategy.",
  },
  {
    id: "conv-economic-positioning",
    title: "Positioning yourself economically",
    messageCount: 6,
    confidence: "medium",
    updatedLabel: "Jun 16",
    summary:
      "Economic positioning strategy in the context of AI-driven labor market changes.",
    firstHuman: "Synthesize AI economic frameworks into personal positioning.",
    lastHuman: "Translate macro views into strategy.",
    highSignalTurns: [
      "How should I position myself economically as AI changes work?",
    ],
    rareTerms: ["Shapiro", "Noah Smith", "economics", "AI"],
    rationale:
      "Broad positioning context adjacent to independent business and career.",
  },
  {
    id: "conv-career-finance",
    title: "Career and Finance Strategy",
    messageCount: 234,
    confidence: "high",
    updatedLabel: "May 28",
    summary:
      "Main post-Vega career and financial strategy thread, including Anthropic and runway.",
    firstHuman: "Plan career and finance strategy after leaving Factor.",
    lastHuman: "Balance Anthropic, runway, and product-building.",
    highSignalTurns: [
      "Anthropic is the primary high-fit path.",
      "I need financial runway while building.",
    ],
    rareTerms: ["Anthropic", "runway", "Factor", "career"],
    rationale:
      "Center of gravity for career/job-search cluster.",
  },
  {
    id: "conv-danny-anthropic",
    title: "Danny @ Anthropic",
    messageCount: 8,
    confidence: "high",
    updatedLabel: "May 1",
    summary:
      "Preparation around an Anthropic contact and application path.",
    firstHuman: "Prepare for Danny at Anthropic.",
    lastHuman: "Draft and refine Anthropic outreach.",
    highSignalTurns: ["Anthropic is a target company."],
    rareTerms: ["Danny", "Anthropic", "outreach"],
    rationale:
      "Anthropic-specific job-search conversation.",
  },
  {
    id: "conv-anthropic-jds",
    title: "Anthropic JDs",
    messageCount: 10,
    confidence: "high",
    updatedLabel: "May 1",
    summary:
      "Analysis of Anthropic job descriptions and role fit.",
    firstHuman: "Retrieve and analyze Anthropic job descriptions.",
    lastHuman: "Compare Education Labs and Solutions Architect paths.",
    highSignalTurns: ["Track the Anthropic roles."],
    rareTerms: ["Anthropic", "Education Labs", "Solutions Architect"],
    rationale:
      "Anthropic-specific job-search conversation.",
  },
  {
    id: "conv-anthropic-talent",
    title: "Anthropic Talent Lead opportunity",
    messageCount: 100,
    confidence: "high",
    updatedLabel: "May 13",
    summary:
      "Evaluation of Anthropic Talent Lead opportunity and fit.",
    firstHuman: "Evaluate Anthropic Talent Lead opportunity.",
    lastHuman: "Assess fit and next steps.",
    highSignalTurns: ["Compare this role with my background."],
    rareTerms: ["Anthropic", "Talent Lead", "role"],
    rationale:
      "Anthropic-specific job-search conversation.",
  },
  {
    id: "conv-immigration-stem-opt",
    title: "Immigration options for girlfriend on STEM OPT",
    messageCount: 10,
    confidence: "high",
    updatedLabel: "May 28",
    summary:
      "Immigration options and planning around partner's STEM OPT status.",
    firstHuman: "Evaluate immigration options for Lulu on STEM OPT.",
    lastHuman: "Clarify visa paths and timing.",
    highSignalTurns: ["Lulu's STEM OPT timing affects life planning."],
    rareTerms: ["STEM OPT", "visa", "Lulu"],
    rationale:
      "Legal/life planning, separable from finance if desired.",
  },
  {
    id: "conv-uscis-policy",
    title: "USCIS policy memo consequences",
    messageCount: 4,
    confidence: "high",
    updatedLabel: "May 28",
    summary:
      "USCIS policy memo implications for immigration planning.",
    firstHuman: "What are the consequences of this USCIS memo?",
    lastHuman: "Translate policy into practical implications.",
    highSignalTurns: ["How does this affect Lulu's options?"],
    rareTerms: ["USCIS", "policy", "immigration"],
    rationale:
      "Pairs naturally with STEM OPT immigration planning.",
  },
  {
    id: "conv-vegas-itinerary",
    title: "Vegas bachelor party itinerary planning",
    messageCount: 12,
    confidence: "low",
    updatedLabel: "Apr 13",
    summary:
      "Event planning for a Vegas bachelor party itinerary.",
    firstHuman: "Plan the bachelor party itinerary.",
    lastHuman: "Refine the Vegas plan.",
    highSignalTurns: ["Plan a good bachelor party weekend."],
    rareTerms: ["Vegas", "bachelor", "itinerary"],
    rationale:
      "One-off event planning that may become a small cluster.",
  },
  {
    id: "conv-bachelor-game",
    title: "Bachelor party strong or soft game ideas",
    messageCount: 8,
    confidence: "low",
    updatedLabel: "May 18",
    summary: "Game ideas for the bachelor party.",
    firstHuman: "Generate strong or soft game ideas.",
    lastHuman: "Choose game format.",
    highSignalTurns: ["Make the game funny but not too much."],
    rareTerms: ["bachelor", "game", "strong", "soft"],
    rationale:
      "Likely belongs with Vegas bachelor party planning if grouped.",
  },
  {
    id: "conv-craps-rules",
    title: "Casino craps rules explained",
    messageCount: 2,
    confidence: "low",
    updatedLabel: "May 18",
    summary: "Explanation of craps rules for casino context.",
    firstHuman: "Explain craps rules.",
    lastHuman: "Clarify betting basics.",
    highSignalTurns: ["Explain the rules simply."],
    rareTerms: ["craps", "casino", "dice"],
    rationale:
      "One-off, but possibly part of Vegas bachelor party planning.",
  },
  {
    id: "conv-empty-batch",
    title: "22 empty or unreadable conversations",
    messageCount: 0,
    confidence: "low",
    updatedLabel: "mixed",
    summary:
      "Grouped placeholder for conversations with no recoverable title or content signal in the fast scan.",
    firstHuman: "",
    lastHuman: "",
    highSignalTurns: [],
    rareTerms: ["empty", "untitled"],
    rationale:
      "Should be excluded from starter-context generation unless manually reviewed.",
  },
];

const INITIAL_CLUSTERS: ReviewCluster[] = [
  {
    id: "cluster-workos",
    title: "WorkOS / BrainShare / Swarm Product Development",
    confidence: "high",
    rationale:
      "Product-building conversations around WorkOS, BrainShare, Swarm, context, memory, and agent workflows.",
    conversationIds: WORKOS_IDS,
  },
  {
    id: "cluster-independent",
    title: "AI Coaching / Independent Positioning",
    confidence: "medium",
    rationale:
      "Independent business, personal positioning, Burn, website, and economic positioning conversations.",
    conversationIds: [
      "conv-burn",
      "conv-ai-coaching",
      "conv-personal-website",
      "conv-speaking-research",
      "conv-economic-positioning",
    ],
  },
  {
    id: "cluster-career",
    title: "Career & Job Search",
    confidence: "high",
    rationale:
      "Career strategy, Anthropic pursuit, role evaluation, and resume/interview work.",
    conversationIds: [
      "conv-career-finance",
      "conv-danny-anthropic",
      "conv-anthropic-jds",
      "conv-anthropic-talent",
    ],
  },
  {
    id: "cluster-finance-legal",
    title: "Personal Finance, Investments & Legal",
    confidence: "high",
    rationale:
      "Financial planning, housing, legal, credit, and immigration conversations.",
    conversationIds: ["conv-immigration-stem-opt", "conv-uscis-policy"],
  },
];

const INITIAL_HOLDING_AREAS: Record<HoldingAreaId, string[]> = {
  ambiguous: [],
  oneOffs: VEGAS_IDS,
  excluded: ["conv-empty-batch"],
};

const INITIAL_QUESTIONS: ReviewQuestion[] = [
  {
    id: "q-burn-workos",
    label: "Move Burn into WorkOS as dogfood context?",
    enabled: false,
    affectedConversationIds: ["conv-burn"],
    preview: "Moves Burn from independent positioning into the product cluster.",
    onOperations: [
      {
        type: "move_conversation",
        conversationId: "conv-burn",
        target: { type: "cluster", id: "cluster-workos" },
      },
    ],
    offOperations: [
      {
        type: "move_conversation",
        conversationId: "conv-burn",
        target: { type: "cluster", id: "cluster-independent" },
      },
    ],
  },
  {
    id: "q-agent-tooling-split",
    label: "Split agent/tooling chats out of WorkOS?",
    enabled: false,
    affectedConversationIds: ["conv-vibe-coding", "conv-openclaw"],
    preview: "Creates Dev Tooling & Technique and moves two agent-tooling chats.",
    onOperations: [
      {
        type: "create_cluster",
        cluster: {
          id: "cluster-dev-tooling",
          title: "Dev Tooling & Technique",
          confidence: "medium",
          rationale:
            "Agent-building technique and platform setup conversations.",
          conversationIds: [],
        },
      },
      {
        type: "move_conversation",
        conversationId: "conv-vibe-coding",
        target: { type: "cluster", id: "cluster-dev-tooling" },
      },
      {
        type: "move_conversation",
        conversationId: "conv-openclaw",
        target: { type: "cluster", id: "cluster-dev-tooling" },
      },
    ],
    offOperations: [
      {
        type: "move_conversation",
        conversationId: "conv-vibe-coding",
        target: { type: "cluster", id: "cluster-workos" },
      },
      {
        type: "move_conversation",
        conversationId: "conv-openclaw",
        target: { type: "cluster", id: "cluster-workos" },
      },
    ],
  },
  {
    id: "q-anthropic-split",
    label: "Split Anthropic-specific job search?",
    enabled: false,
    affectedConversationIds: ANTHROPIC_IDS,
    preview: "Creates an Anthropic job-search cluster from the career group.",
    onOperations: [
      {
        type: "create_cluster",
        cluster: {
          id: "cluster-anthropic",
          title: "Anthropic Job Search",
          confidence: "high",
          rationale:
            "Anthropic-specific outreach, job descriptions, and role-fit conversations.",
          conversationIds: [],
        },
      },
      ...ANTHROPIC_IDS.map(
        (conversationId): ReviewOperation => ({
          type: "move_conversation",
          conversationId,
          target: { type: "cluster", id: "cluster-anthropic" },
        })
      ),
    ],
    offOperations: ANTHROPIC_IDS.map((conversationId) => ({
      type: "move_conversation",
      conversationId,
      target: { type: "cluster", id: "cluster-career" },
    })),
  },
  {
    id: "q-immigration-split",
    label: "Separate immigration from finance/legal?",
    enabled: false,
    affectedConversationIds: IMMIGRATION_IDS,
    preview: "Creates an Immigration / Visa Planning cluster.",
    onOperations: [
      {
        type: "create_cluster",
        cluster: {
          id: "cluster-immigration",
          title: "Immigration / Visa Planning",
          confidence: "high",
          rationale:
            "STEM OPT, USCIS, and visa planning conversations.",
          conversationIds: [],
        },
      },
      ...IMMIGRATION_IDS.map(
        (conversationId): ReviewOperation => ({
          type: "move_conversation",
          conversationId,
          target: { type: "cluster", id: "cluster-immigration" },
        })
      ),
    ],
    offOperations: IMMIGRATION_IDS.map((conversationId) => ({
      type: "move_conversation",
      conversationId,
      target: { type: "cluster", id: "cluster-finance-legal" },
    })),
  },
];

export function createInitialClusterReviewState(): ImportClusterReviewState {
  return cloneState({
    importJobId: "sample-clean-cluster-scan",
    clusters: INITIAL_CLUSTERS,
    conversations: CONVERSATIONS,
    questions: INITIAL_QUESTIONS,
    holdingAreas: INITIAL_HOLDING_AREAS,
    history: [],
    lastInstructionResult: null,
  });
}

export function conversationChipLabel(
  conversation: ReviewConversation
): string {
  return conversation.title;
}

export function findConversationLocation(
  state: ImportClusterReviewState,
  conversationId: string
): ReviewLocation | null {
  for (const cluster of state.clusters) {
    if (cluster.conversationIds.includes(conversationId)) {
      return { type: "cluster", id: cluster.id };
    }
  }

  for (const [id, conversationIds] of Object.entries(state.holdingAreas)) {
    if (conversationIds.includes(conversationId)) {
      return { type: "holding", id: id as HoldingAreaId };
    }
  }

  return null;
}

export function moveConversation(
  state: ImportClusterReviewState,
  conversationId: string,
  target: ReviewLocation
): ImportClusterReviewState {
  const next = cloneState(state);
  next.clusters = next.clusters.map((cluster) => ({
    ...cluster,
    conversationIds: cluster.conversationIds.filter((id) => id !== conversationId),
  }));
  next.holdingAreas = {
    ambiguous: next.holdingAreas.ambiguous.filter((id) => id !== conversationId),
    oneOffs: next.holdingAreas.oneOffs.filter((id) => id !== conversationId),
    excluded: next.holdingAreas.excluded.filter((id) => id !== conversationId),
  };

  if (target.type === "cluster") {
    next.clusters = next.clusters.map((cluster) =>
      cluster.id === target.id
        ? {
            ...cluster,
            conversationIds: appendUnique(cluster.conversationIds, conversationId),
          }
        : cluster
    );
  } else {
    next.holdingAreas[target.id] = appendUnique(
      next.holdingAreas[target.id],
      conversationId
    );
  }

  return next;
}

export function applyQuestionToggle(
  state: ImportClusterReviewState,
  questionId: string,
  enabled: boolean
): ImportClusterReviewState {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return state;

  let next = cloneState(state);
  next.questions = next.questions.map((item) =>
    item.id === questionId ? { ...item, enabled } : item
  );

  const operations = enabled ? question.onOperations : question.offOperations;
  for (const operation of operations) {
    next = applyOperation(next, operation);
  }
  next.history = [
    ...next.history,
    `${enabled ? "Enabled" : "Disabled"} question: ${question.label}`,
  ];
  next.lastInstructionResult = {
    status: "applied",
    message: `${enabled ? "Applied" : "Reverted"}: ${question.label}`,
  };
  return next;
}

export function applyInstruction(
  state: ImportClusterReviewState,
  instruction: string
): ImportClusterReviewState {
  const normalized = instruction.trim().toLowerCase();
  if (!normalized) return state;

  let next = cloneState(state);
  if (normalized.includes("burn") && normalized.includes("workos")) {
    next = moveConversation(next, "conv-burn", {
      type: "cluster",
      id: "cluster-workos",
    });
    return withInstructionResult(next, "Moved Burn into WorkOS.");
  }

  if (normalized.includes("anthropic") && normalized.includes("split")) {
    next = applyOperation(next, {
      type: "create_cluster",
      cluster: {
        id: "cluster-anthropic",
        title: "Anthropic Job Search",
        confidence: "high",
        rationale:
          "Anthropic-specific outreach, job descriptions, and role-fit conversations.",
        conversationIds: [],
      },
    });
    for (const conversationId of ANTHROPIC_IDS) {
      next = moveConversation(next, conversationId, {
        type: "cluster",
        id: "cluster-anthropic",
      });
    }
    return withInstructionResult(
      next,
      "Split Anthropic-specific job search into its own cluster."
    );
  }

  if (
    normalized.includes("immigration") ||
    normalized.includes("visa") ||
    normalized.includes("stem opt")
  ) {
    next = applyQuestionToggle(next, "q-immigration-split", true);
    return withInstructionResult(
      next,
      "Separated immigration and visa planning from finance/legal."
    );
  }

  if (normalized.includes("exclude") && normalized.includes("empty")) {
    next = moveConversation(next, "conv-empty-batch", {
      type: "holding",
      id: "excluded",
    });
    return withInstructionResult(next, "Kept empty conversations excluded.");
  }

  if (normalized.includes("vegas") || normalized.includes("craps")) {
    next = applyOperation(next, {
      type: "create_cluster",
      cluster: {
        id: "cluster-vegas",
        title: "Vegas Bachelor Party Planning",
        confidence: "medium",
        rationale:
          "Event planning, game ideas, and casino context for the bachelor party.",
        conversationIds: [],
      },
    });
    for (const conversationId of VEGAS_IDS) {
      next = moveConversation(next, conversationId, {
        type: "cluster",
        id: "cluster-vegas",
      });
    }
    return withInstructionResult(
      next,
      "Created Vegas Bachelor Party Planning and moved three conversations."
    );
  }

  return {
    ...next,
    lastInstructionResult: {
      status: "not_understood",
      message: "I could not confidently map that instruction yet.",
    },
  };
}

export function createClusterFromConversation(
  state: ImportClusterReviewState,
  conversationId: string,
  title: string
): ImportClusterReviewState {
  const id = clusterIdFromTitle(title);
  let next = applyOperation(state, {
    type: "create_cluster",
    cluster: {
      id,
      title,
      confidence: "medium",
      rationale: "User-created cluster.",
      conversationIds: [],
    },
  });
  next = moveConversation(next, conversationId, { type: "cluster", id });
  return {
    ...next,
    history: [...next.history, `Created cluster: ${title}`],
  };
}

function applyOperation(
  state: ImportClusterReviewState,
  operation: ReviewOperation
): ImportClusterReviewState {
  if (operation.type === "create_cluster" && operation.cluster) {
    if (state.clusters.some((cluster) => cluster.id === operation.cluster?.id)) {
      return state;
    }
    return {
      ...cloneState(state),
      clusters: [...state.clusters, { ...operation.cluster, conversationIds: [] }],
    };
  }

  if (
    operation.type === "move_conversation" &&
    operation.conversationId &&
    operation.target
  ) {
    return moveConversation(state, operation.conversationId, operation.target);
  }

  return state;
}

function withInstructionResult(
  state: ImportClusterReviewState,
  message: string
): ImportClusterReviewState {
  return {
    ...state,
    history: [...state.history, message],
    lastInstructionResult: { status: "applied", message },
  };
}

function appendUnique(items: string[], item: string): string[] {
  return items.includes(item) ? items : [...items, item];
}

function clusterIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `cluster-${slug || "new"}`;
}

function cloneState(state: ImportClusterReviewState): ImportClusterReviewState {
  return {
    importJobId: state.importJobId,
    clusters: state.clusters.map((cluster) => ({
      ...cluster,
      conversationIds: [...cluster.conversationIds],
    })),
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      highSignalTurns: [...conversation.highSignalTurns],
      rareTerms: [...conversation.rareTerms],
    })),
    questions: state.questions.map((question) => ({
      ...question,
      affectedConversationIds: [...question.affectedConversationIds],
      onOperations: question.onOperations.map(cloneOperation),
      offOperations: question.offOperations.map(cloneOperation),
    })),
    holdingAreas: {
      ambiguous: [...state.holdingAreas.ambiguous],
      oneOffs: [...state.holdingAreas.oneOffs],
      excluded: [...state.holdingAreas.excluded],
    },
    history: [...state.history],
    lastInstructionResult: state.lastInstructionResult
      ? { ...state.lastInstructionResult }
      : null,
  };
}

function cloneOperation(operation: ReviewOperation): ReviewOperation {
  return {
    ...operation,
    target: operation.target ? { ...operation.target } : undefined,
    cluster: operation.cluster
      ? {
          ...operation.cluster,
          conversationIds: [...operation.cluster.conversationIds],
        }
      : undefined,
  };
}
