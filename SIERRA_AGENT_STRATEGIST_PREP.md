# Sierra Agent Strategist — Interview Cheat Sheet

> **Memory triggers, not scripts.** Headline → 2–3 actions → result / lesson → stop.

## 30-minute map

| Time | Likely use |
|---|---|
| 2–3 min | Intro / why Sierra |
| 15–20 min | About 3 substantive questions with follow-ups |
| 5–10 min | Your questions |

**Answer target:** 60–90 seconds. Let the interviewer pull for depth.

## Five messages to land

| Message | Proof |
|---|---|
| **Customer-facing builder** | Product → implementation → GTM → AI building |
| **Can go from ambiguity to a working system** | WorkOS / BrainShare |
| **Strong customer judgment** | Logistics workaround; pharma M&A |
| **Reflective about misses** | Alumni-sales pilot success criteria |
| **Honest about boundaries** | Not a traditional engineer; single-user prototype; no fake enterprise claims |

## Why Sierra / why now

- Rare combination: **close to the customer + hands-on building**.
- Natural continuation of your career arc; now at post-PMF enterprise scale.
- Want to learn enterprise agent evaluation, safety, reliability, and deployment.
- Recruiter’s four signals: **crisp communication, AI fluency, customer experience, technical building/scoping**.
- Role is roughly **70% customer management**; enough technical depth to build and translate.

---

# Story selector

| If they ask about… | Story | Essential beats | Result / lesson |
|---|---|---|---|
| **AI build / technical depth** | WorkOS + BrainShare | Context walls → model-agnostic surface → extraction / conviction / retrieval → financial test | Personalized context in a blank thread; extraction quality mattered most |
| **Customer need vs. roadmap** | Logistics velocity | Hierarchical product; customer needed flat team comparison; feature not planned; script → CSV → weekly ranking | Need met throughout engagement; relationship expanded and renewed |
| **Failure / mistake** | Alumni-sales pilot | Wanted sales + retention; 6 months; 100% retention; sales flat; CEO did not scale | Metrics agreed, decision rule unclear; define thresholds/tradeoffs upfront |
| **Change management** | Replacement manager | New manager halfway through; model facilitation → give him portions → feedback → gradual handoff | Ran process independently; strong relationship; pilot stayed on track |
| **Stakeholder alignment** | Pharma M&A | Competing optimism / empathy / truth / legal caution; interview leaders; three-answer FAQ; iterate 1:1 + group | Trained 500 leaders; repeated twice; “80% with everyone, 100% with nobody”; “corporate therapy” |
| **Customer insight → product** | Manual-first development | Spreadsheets, surveys, Post-it boards before software | Prove the workflow before engineering builds; don’t invent a forgotten UX insight |

---

# WorkOS + BrainShare

## Ten-second spine

| Beat | Trigger |
|---|---|
| **Problem** | New thread / new tool = missing critical context; copying everywhere; too many subscriptions |
| **First build** | WorkOS: Kanban/work surface + threaded chats + multiple models |
| **Real bottleneck** | Interface mattered less than the context entering each query |
| **Engine** | Extraction → conviction → retrieval / working memory |
| **Proof** | Financial-planning head-to-head with a curated Claude project |
| **Decision** | Stopped when Vellum and Claude solved enough of the problem |

## Three-part engine

| Part | Job | Triggers |
|---|---|---|
| **Extraction** | Turn raw conversations into useful typed information | Decisions, questions, facts, insights; fewer high-signal items |
| **Conviction** | Decide how much weight to give each item | Time, source, human vs. AI, approval, authority; human signal matters |
| **Retrieval** | Build working memory for the current question | Relevant breadth without flooding the context window |

### Automatic model routing

- Protocol chose the LLM based on the query and each model’s strengths.
- Concrete example of **removing choices the system can safely make**.
- Preserve meaningful user decisions; hide needless configuration.

## Golden test: financial planning

| Setup | Recall |
|---|---|
| **Claude** | Carefully maintained project with financial context |
| **WorkOS** | Blank thread after raw import of all Claude chats; no manual organization |
| **Same prompt** | “Help me with financial planning.” |
| **WorkOS recovered** | Exact cash, investments, philosophy, risk tolerance, family/house plans, options being considered |
| **Why convincing** | Facts came from many unrelated conversations; unmistakably nongeneric |
| **Outcome** | Comparably personalized and useful without a curated project/thread |

## Debugging + evaluation

- Made every stage **inspectable**; traced bad answers backward.
- Sampled about **30 items** per stage—not every one of hundreds.
- Corrected silly extractions, missed meaning, and bad labels with Codex.
- **Extraction was the leverage point:** later stages could not rescue a misunderstanding.
- Retrieval problem observed: **how much context to include**.
- First-five shortcut = faster, much worse answers.
- Accepted roughly **20–30 seconds** for substantially better quality.
- Next real evaluation: representative users + side-by-side judgment; not an LLM grading itself.

## Claim boundaries

| Supported | Not supported |
|---|---|
| Worked across finance, career, coaching philosophy, relationships without retuning | Proven cross-user generalization |
| Rich personal facts proved real retrieval | Enterprise benchmark |
| Stage inspection exposed failures | Production reliability/security |

**Clean phrasing:** “It generalized across subjects for me. That is not proof it would generalize across users.”

## Three lessons

1. **Context quality shapes agent quality.**
2. **Remove unnecessary user choices.** Model-routing example.
3. **Inspectability enables improvement.**

## Why you stopped

- Built to solve a problem—not to own the solution forever.
- Vellum became comparably useful without your maintenance burden.
- Claude’s context handling improved soon afterward.
- Good build-vs.-buy judgment; no sunk-cost attachment.
- Market progress validated that the problem was real and timely.

## You vs. Codex

| You | Codex / Claude |
|---|---|
| Goals, core concepts, architecture, protocols, design philosophy | Codex wrote the code and offered ideas |
| Defined “good”; inspected behavior; made tradeoffs | Claude sometimes audited; Codex fixed findings |
| Optimized for personal usefulness | Accelerated implementation |

**Boundary:** personal prototype, not enterprise production. For production, partner with engineers on quality, security, and reliability.

## Privacy / security

- **Didn’t solve it.** Single-user prototype; no multi-tenant auth or customer isolation.
- Don’t rely on an LLM to make privacy decisions.
- Hard software rules should decide access **before the LLM sees the information**.
- Enterprise implementation is something you genuinely want to learn at Sierra.

---

# Customer-story triggers

## Logistics velocity

- Large Asian logistics company; cross-functional teams hidden inside hierarchy.
- Needed flat, sortable view of every team’s velocity.
- Valid goal; feature not on roadmap.
- Pulled database data → CSV → weekly stack-ranked report.
- Reviewed with department head weekly.
- Used for whole engagement; expansions/renewals continued.
- **Use for:** scrappiness, product constraint, outcome over requested feature.

## Alumni-sales pilot

- Roughly 50% yearly attrition; wanted better sales + retention.
- Tested less scripting/commission focus; more intrinsic motivation/experimentation.
- Six months; manager changed halfway.
- Pilot team: **100% retention**; sales equal to control.
- CEO wanted sales lift too; no scale-out.
- **Your miss:** agreeing on metrics ≠ agreeing on what outcome triggers a decision.
- Since then: specify thresholds, tradeoffs, and decision paths upfront.
- **Never:** “CEO made a huge mistake.”

## Replacement manager

- New manager inherited unfamiliar methodology halfway through.
- Apprenticeship, not one-time training.
- You modeled meetings → gave him sections → coached → expanded ownership.
- He was open, learned, and ran it independently.
- **Use for:** change management, developing a stakeholder, unexpected disruption.
- Leave out politics / relative talent.

## Pharma M&A

- Major pharma subsidiary; two announcements; leaders feared cultural damage.
- Camps: hyper-optimism / empathy / blunt truth / legal caution.
- Interviewed core executives + **12 senior leaders**.
- FAQ captured employees’ hardest likely questions.
- For each: **safe-but-useless corporate answer / counterproductive extreme / balanced helpful answer**.
- Iterated in individual + group conversations; pushed candor to the legal boundary.
- Trusted to train **500 people leaders**; repeated for second announcement.
- Lines: **“80% with everyone, 100% with nobody.” “Corporate therapy.”**

## Manual-first product development

**“That was the water we swam in at VegaFactor.”**

| Workflow | Manual proof before software |
|---|---|
| Skills-based compensation | Spreadsheets; calibration with 12+ managers |
| Motivation measurement | Google surveys; refine questions/method first |
| Prioritization + experiments | Physical Post-it boards with hundreds of users |

- Main Post-it result: core behavior was a **runaway success / validated concept**.
- Digital version made proven work easier and scalable.
- Do not manufacture a surprising UX lesson you don’t remember.

---

# Agent-strategy shorthand

## Returns: where to begin

1. Try the return journey personally.
2. Read transcripts + operating data; find repeated friction.
3. Use an LLM to group patterns; personally inspect examples.
4. Ask frontline reps targeted questions where evidence is ambiguous.
5. Separate predictable work from judgment, exceptions, and risk.
6. Scope narrowly; launch and learn—not months of discovery.

**Stance:** data and conversations are complementary. Form a view quickly; talk to people to find what the data misses.

## Returns: where the agent stops

| Check | Question |
|---|---|
| **Consequence** | How harmful is a wrong decision? |
| **Recovery** | Can it be reversed easily? |
| **Detection** | Would we notice the mistake? |
| **Hard boundary** | Does policy/regulation require a person? |

- Start conservative: agent handles straightforward 90%; escalate fraud, high-value items, exceptions.
- Study the 10% for safe sub-patterns.
- Agent can gather evidence/recommend before it earns authority to decide.
- Expand responsibility only when results justify it.

---

# Language guardrails

| Strong | Avoid |
|---|---|
| “I didn’t solve that.” | Pretending principles are implementation experience |
| “It generalized across subjects for me.” | Claiming cross-user proof |
| “Codex wrote the code; I owned the method and decisions.” | Pretending to be a traditional engineer |
| “Fit for a personal prototype.” | “I didn’t care if it was technically correct.” |
| “Hard rules before the LLM sees data.” | Asking the LLM to judge privacy |
| “Evidence first; targeted conversations fill gaps.” | “I must interview everyone before deciding.” |
| “Buyers entered aligned with the methodology.” | Religion / conversion / gospel |
| “We had different definitions of success.” | “The CEO was wrong.” |
| “The failures I observed…” | “There were no other failure modes.” |

---

# Likely WorkOS follow-ups

| Question | Trigger |
|---|---|
| **How do you know retrieval was real?** | Exact personal facts from unrelated threads |
| **How did you find failures?** | Inspect each stage; sample ~30; trace backward |
| **What mattered most?** | Extraction quality |
| **Why tolerate latency?** | Five-item shortcut damaged quality |
| **Was it overfit?** | Cross-domain for one user; not cross-user proof |
| **Why stop?** | Vellum + Claude; solve problem, don’t worship artifact |
| **Who built it?** | You: method/judgment. Codex: code/thought partnership |
| **How verify code?** | Behavioral tests, stage inspection, Claude audits; engineers for production |
| **Privacy?** | Not solved; hard access rules before model exposure |

---

# Questions for the Agent Strategist

Pick **two**.

1. **What separates Agent Strategists who earn customer trust quickly from those who take longer?**
2. **Can you describe an agent that changed significantly after launch because of what you learned from real conversations?**
3. **How do you decide when an agent has earned more autonomy rather than continuing to escalate?**
4. **How does a new Strategist build depth in an assigned vertical?**

---

# Optional: Swarm / Burn Discord bot

> Built/prototyped; do not claim team outcomes you cannot substantiate.

| Beat | Trigger |
|---|---|
| **Problem** | Part-time Burn team; Discord default; unreliable meetings; stale board |
| **Input** | Recent messages across channels + roles + time constraints + milestone + shipped work |
| **Output** | Opinionated two-week plan; owner assignments; explicit “not doing”; target milestone; discussion questions |
| **Product instinct** | Meet teams where they work; infer first; ask only where needed |
| **Sierra relevance** | Turn messy activity into a scoped, actionable agent workflow |

---

## Final glance

- Answer the question asked; don’t dump the whole architecture.
- Don’t manufacture precision.
- Lead with the outcome.
- Use your normal language.
- Best combined signal: **deep customer instinct + ability to turn an idea into a working AI system.**

**Sources:** [Sierra role article](https://sierra.ai/blog/agent-strategist-your-phd-in-applied-ai) · [Recruiter transcript](/Users/williamcorbett/.codex/attachments/6aebcd6d-b8bb-4d66-af03-8569bb534c4c/pasted-text.txt)
