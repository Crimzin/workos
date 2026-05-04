# Prompt Engineering Patterns — Inborn Knowledge Source Material

**CONFIDENTIAL · IP · GITIGNORED**

*This document contains prompt engineering patterns Will learned over the last few years. Special thanks to Neel Doshi for invaluable mentorship on this subject.*

*Add this file path to `.gitignore` before committing anything in this directory.*

## Core Mental Models

### LLMs as Translation Engines, Not Reasoners

The model doesn't actually deduce or induce. It takes words, converts them to a vector space of concepts, and converts back to words. "Reasoning" in LLMs is best understood as **chained translations** — sequences of conceptual transformations that approximate reasoning steps.

**Implication for prompt design:** Don't ask the model to "reason." Structure the prompt as a sequence of explicit translation steps that, in aggregate, produce reasoning-like output.

### The Pareto Quality Curve

Productivity isn't "least time, lowest quality." Productivity is reaching the Pareto point — 80% of quality from 20% of time. AI augmentation is most valuable when it accelerates the path to that Pareto point, not when it tries to replace the final 20% of human craft.

**Implication:** Prompts should produce high-quality first drafts that humans can refine, not finished outputs. The bar is "does this idea accelerate me to quality?" not "is this output ready to ship?"

### LLMs Encapsulate "Internet Average Best Practice," Not Actual Best Practice

LLMs were trained on the internet. When you ask "what's the best way to do X?", you get the average of what the internet thinks is best — not what the actual experts in that field would say.

**Implication:** Always layer in domain expertise. Use LLMs for first drafts and divergent thinking, but bring proprietary knowledge to steer toward actual best practice. This is the entire rationale for BrainShare's curated inborn knowledge layer.

---

## Prompt Architecture Patterns

### Identity, Purpose, Then Process

Every well-tuned prompt opens with three things:

1. **Identity** — "You are \[X\], an AI assistant" or "Act like a senior content strategist." This anchors the model in the right region of vector space.  
2. **Purpose** — One clear sentence about what we're trying to accomplish. This focuses the model on the goal, not just the process.  
3. **Process** — The structured sequence of steps the model should take.

Identity and purpose feel optional but they materially improve output quality. They get the model into the right "frame of mind" before the work starts.

### Goal-First Workflows

The first prompt in any workflow chain should ask: **what are you trying to accomplish?**

Skipping this step produces context-poor output downstream. "What's the goal of this article?" or "What's the goal of this video?" or "What's the goal of this landing page?" should be the first prompt before any tactical work begins.

This insight came from observing that workflows skipping goal-clarification produced consistently worse output, regardless of how good the tactical prompts were.

### Visible Reasoning Through Hidden Output

Built-in reasoning modes (Gemini's, Claude's, OpenAI's) cost more, run slower, and produce reasoning that's worse than what you can manually engineer. Better approach:

Have the model output its reasoning steps inside an **HTML comment** at the top of its response. The user doesn't see them (the rendering escapes HTML), but they're saved with the post. This:

- Mimics reasoning behavior at lower cost  
- Lets you see exactly what the model "thought" during debugging  
- Lets downstream prompts pick up the reasoning context  
- Gives you full control over the reasoning sequence

The prompt explicitly instructs: *"Output an HTML comment without a code block, including the exact content below and your answers to any unanswered questions."*

**For BrainShare:** This pattern becomes less critical with MCP (you can structure the reasoning trace as part of the tool call), but the underlying insight — separate visible output from reasoning trace — is fundamental.

### Branching Output: 2A vs 2B

Prompts that may need to interview the user (when context is missing) should structure their outputs as:

- **Output 1:** Always required (e.g., the reasoning HTML comment with state)  
- **Output 2A:** If context is insufficient → conduct an interview  
- **Output 2B:** If context is sufficient → produce the final output

This makes a single prompt handle both "I have enough info, just do the work" and "I need more from you" without splitting into two separate prompts.

### Boilerplate That Bridges Tools

When one AI tool starts an interview and another finishes it (a chained workflow), the first tool needs to pass instructions to the second tool. The pattern:

*"Instructions for \[next tool\]: Follow these instructions until you produce the final post or the user changes the subject. \[Embedded instruction set\]."*

This is essentially a controlled prompt injection between tools in a chain. The downstream tool reads the instructions from the previous tool's output and treats them as its own.

**For BrainShare:** This is a workaround for systems without proper state-passing. With Graphiti episodes and typed primitives, the state is the graph. No injection needed.

---

## Idea Generation Patterns

### Generate-Score-Refine for Creativity

For tasks requiring creative variety (idea generation, hooks, slogans):

1. **Generate broadly** — produce 60 ideas to ultimately keep 15  
2. **Self-generate scoring criteria** — "What attributes should we use to score these ideas?"  
3. **Score against self-generated criteria**  
4. **Deduplicate and merge similar ideas**  
5. **Group into final categories**

The "more ideas → better ideas" principle works. But not always — see below.

### When MORE Hurts Creativity

For some creative tasks, generating MORE worsens output. Example: generating 50 hook variations of each of 10 ideas produced LESS creative results than generating 10 hooks total. Pattern: when the task requires precise linguistic compression (slogan-like phrasing), volume hurts because the model loses focus on the compression criteria.

**Heuristic:** Use volume for divergent ideation. Don't use volume for convergent linguistic precision.

### Self-Generated Scoring Criteria

Instead of telling the model what makes good output, ask it to derive the criteria first:

*"What criteria does an article title need to meet for this target audience to click on it and read the article?"*

Then use those criteria to score outputs. The model often generates better criteria than you'd write manually because it's reasoning specifically about your context, not about generic best practices.

**Caveat:** Models grade-inflate when scoring against their own criteria. If accuracy matters, add a second instruction: *"You gave it a 5 — is that really a 5, or do you need to rescore?"* This forces re-evaluation.

### Force Explicit Statement of Hidden Inferences

Models often skip stating things they "know" — but they need to state them to integrate the insight downstream.

Example: A strategy-generation prompt needs to know "is this an executive leadership team?" because it changes the kind of strategies generated. The model knows this from context, but won't apply the insight unless forced to explicitly state it first.

**Pattern:** Use questions that force explicit naming before reasoning continues:

- "Is this team's workload majority strategy work, or BAU?"  
- "Is this an executive leadership team?"  
- "Based only on the previous two questions, what kind of ideas make most sense?"

This is essentially the LLM equivalent of "show your work" — but it materially improves output quality, not just visibility.

---

## Linguistic and Formatting Patterns

### Parentheses as Implicit Instruction Suppression

Instructions formatted as `Group: (which ideas don't already exist)` will produce:

- Output: `Group: [list of ideas]`

Without parentheses, the same instruction produces:

- Output: `Group: Which ideas don't already exist? [list of ideas]`

The parenthetical form tells the model "this is meta-instruction about what the section means, not output to include." Works \~95% of the time. Saves tokens and improves output cleanliness.

### Markdown for Format Continuity Across Tools

When chaining prompts through multiple AI tools, format the expected final output as **markdown** within the reasoning HTML comment. This ensures downstream tools rendering the output produce consistent formatting.

### Naming Matters for Prompt-Generation Prompts

Meta-prompts (prompts that generate other prompts) confuse the model because everything is called "instructions." A potential workaround: use distinct vocabulary at different levels:

- "Commands" for the meta-prompt's directives  
- "Instructions" for what the generated prompt will contain

This isn't fully solved yet. **Open problem worth flagging in BrainShare's inborn knowledge.**

---

## Workflow Engineering Patterns

### Parallel Optimization for Debiasing

When optimizing a prompt, run it across **4+ different use cases simultaneously**. This prevents over-fitting the prompt to one specific subject matter.

Example: optimizing the article hook prompt should run across 4 different article topics in parallel. Optimizing across 4 articles in different domains (microbiology, video games, B2B SaaS, lifestyle) is even better.

### Generalize Snippets Through Context Curation, Not Embedding

Old approach: embed reference content as static "snippets" in prompts (article snippet, brand voice snippet, etc.).

New approach: keep prompts generic, and curate context through linked structured data at runtime. Instead of embedding "here are our articles" as a snippet, link to a stack containing all articles. The prompt accesses the stack contents at execution time.

This makes prompts portable across organizations. The same prompt works for any team that has an "articles" stack — they just link their stack instead of yours.

**For BrainShare:** This is exactly how typed primitives \+ graph linking should work. Prompts reference primitive types (Decision, Goal, etc.) generically; the graph supplies the specific context at runtime.

### Dogfooding as the Fastest Feedback Loop

The prompts that improve fastest are the ones used in own daily work. Article writing prompts improved fastest because he was writing articles. Strategy generation prompts improved fastest after he ran them on real client work.

**Implication:** Build the dogfooding loop tight. The owner of a prompt should be its primary user. Don't optimize prompts you don't use.

---

## Anti-Patterns to Avoid

### "Write the Whole Article" Trap

Asking the model to produce final-quality output in one shot has near-zero probability of success for complex creative work. The output will be slop. Productivity gains from slop are productivity losses, because someone has to fix the slop.

**Better:** Break work into layers. Layer 1 \= strategy and goal. Layer 2 \= ideation and hooks. Layer 3 \= structure and outline. Layer 4 \= draft. Each layer produces a high-quality artifact that humans can review before the next layer runs.

### Reasoning-Mode Dependency

Built-in reasoning modes (Gemini reasoning, Claude extended thinking, OpenAI o-models) feel powerful but come with costs:

- Higher per-token cost  
- Slower response time  
- Less control over the reasoning sequence  
- Often worse than manually engineered reasoning steps for specific tasks

**Use reasoning mode when:** the task is genuinely novel and you can't anticipate the reasoning sequence. **Avoid reasoning mode when:** you've designed the reasoning sequence yourself.

### Snippet Proliferation

Embedding reference content as static snippets in prompts creates maintenance burden, makes prompts non-portable, and often pollutes context with irrelevant material. Resist the urge to bake everything into the prompt itself. Use structured context references instead.

### Average Best Practice from the Model

Don't trust the model's "best practice" claims. They're a synthesis of internet content, weighted by frequency and recency, not by actual expertise. Cross-check against domain experts and authoritative sources. The model is a starting point, not an authority.

---

## Observations About LLM Behavior (Empirical)

### Gemini Flash Handles HTML-Comment State Better Than Claude

As of late 2025, Gemini Flash reliably preserved HTML-comment-embedded reasoning state across responses. Claude struggled with this pattern.

**Caveat:** Claude has improved significantly since this testing. Worth re-validating before encoding as a rule.

### Models Won't Apply Inferences They Haven't Stated

An insight known to the model from context won't influence downstream reasoning unless the model has explicitly stated it. This is why "force explicit statement" works — it transforms latent knowledge into active context.

### Stochastic Output Means You Can't Force Deterministic Behavior

Models are probabilistic. Even with explicit instructions, \~5-10% of outputs will deviate from spec. Build prompts to be robust to this, or add validation/retry layers downstream.

---

## Patterns to Encode in BrainShare's Inborn Knowledge

The following should be added to BrainShare's curated inborn knowledge library as operational patterns for AI-augmented work:

1. **Goal-first workflow design** — the first prompt in any chain asks what we're trying to accomplish  
2. **Layered output construction** — strategy → ideation → structure → draft, with human review between layers  
3. **Generate-score-refine for divergent thinking** — works for ideation, fails for convergent linguistic precision  
4. **Self-generated scoring criteria with re-check for inflation** — produces context-specific quality bars  
5. **Force explicit statement of inferences** — latent knowledge doesn't propagate; stated knowledge does  
6. **Generalized prompts \+ runtime context curation** — beats embedded snippets for portability  
7. **Parallel optimization across 4+ use cases** — debiases prompt tuning  
8. **Augmentation, not replacement** — model produces options, human chooses; the menu is the productivity gain

These patterns should also inform Swarm's operational intelligence — many of them apply to how Swarm structures its own outputs (alignment session flows, strategy generation, problem-solving deep dives).

---

## What BrainShare's Architecture Solves That Manual Prompt Engineering Hit Walls On

1. **Meta-prompt confusion** (prompts that generate prompts) — solved by typed primitives separating Episode (raw source) from Decision (structured extraction). No ambiguity about whose instructions are whose.  
     
2. **State passing between tools** — solved by Graphiti's episode model and the temporal graph. No need for HTML-comment injection.  
     
3. **Manual prompt iteration asymptote** — solved by structured causal context. Instead of hand-tuning prompts to be smarter, give them pre-structured context to reason over.  
     
4. **Snippet vs. context tension** — solved by graph linking. Prompts reference primitive types generically; the graph supplies specifics at runtime.  
     
5. **Single-system optimization** — solved by tool-agnostic architecture. BrainShare's value compounds across tools, not within one closed system.

---

*End of source material. These patterns should be reformulated, recombined, and encoded in BrainShare's inborn knowledge layer as standalone operational patterns. Do not republish this document or any verbatim quotes externally.*  
