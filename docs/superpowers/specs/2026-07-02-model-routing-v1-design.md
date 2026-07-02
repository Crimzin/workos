# WorkOS Model Routing V1 Design

Date: 2026-07-02
Status: Draft for review

## Purpose

WorkOS should make model choice feel recognizable without making the user manage a model control panel.

The near-term user already knows brands like Claude, ChatGPT, Gemini, DeepSeek, and Perplexity. They should be able to choose a familiar primary responder, but WorkOS should be smart enough to call a specialist model for a sub-task when that would produce a better answer.

The core product promise is:

> I can talk to the model I trust, and WorkOS knows when to bring in the right specialist.

For example, a user can ask Claude Opus for financial planning help, include a question about the latest immigration policy, and receive one coherent answer authored by Claude while WorkOS quietly uses a research-capable model for the current-events policy lookup.

## Design Direction

Use a primary responder plus specialist routing model.

The primary responder owns the final user-facing answer. Specialist calls gather evidence, perform narrow analysis, critique an answer, or retrieve current information. The final response should read as one coherent reply, not as a pasted committee transcript.

The model interface should remain consumer-recognizable:

- Claude
- ChatGPT
- Gemini
- DeepSeek
- Perplexity

The capability layer underneath should be task-oriented:

- Best
- Fast
- Deep reasoning
- Research
- Cheap
- Private/local, later
- Second opinion, later

Users can understand the brands, but WorkOS routes by job.

## Product Principles

1. The user picks a primary responder, not an execution graph.
2. Automatic specialist routing is on by default only when the benefit is clear.
3. Specialist calls should be visible after the fact through provenance, not noisy during normal composition.
4. The primary answer must cite or summarize specialist results honestly.
5. The user should be able to expand "How this answer was made" to inspect model calls, sources, cost signals, and routing reasons.
6. WorkOS should prefer fewer, higher-confidence specialist calls over broad model fan-out.

## Terminology

Use these distinctions consistently:

- Source app: where imported content came from, such as Claude export or ChatGPT export.
- Provider: the API or service that runs model calls, such as Anthropic, OpenAI, Google, DeepSeek, or Perplexity.
- User-facing brand: the name shown in the UI, such as Claude or ChatGPT.
- Model: a provider-specific model id, such as `claude-opus-4-8` or `gpt-5.5`.
- Job: the reason a model is being used, such as synthesis, research, critique, extraction, or cheap draft.
- Primary responder: the model responsible for the final reply.
- Specialist task: a narrow routed sub-task used to improve the final reply.

Codex and Claude Code should remain execution/tool agents, not ordinary chat brands in this first model-routing surface. They can participate when the job is code, shell, git, or repository work.

## First Provider Set

V1 should prioritize consumer recognizability, with enough capability coverage to create visible magic.

### Claude

Primary role: thoughtful synthesis, writing, long reasoning, personal context, planning.

Claude remains the strongest default for WorkOS's current thread-first experience.

### ChatGPT

Primary role: recognizable generalist and broad default alternative.

User-facing label should be ChatGPT. Internal provider should be OpenAI. OpenAI's current docs recommend `gpt-5.5` as the starting point for complex reasoning and coding, with smaller variants such as `gpt-5.4-mini` for cost and latency-sensitive workloads.

### Gemini

Primary role: long context, multimodal inputs, Google-adjacent workflows, and grounded research when available.

Gemini is important because users recognize it and because long-context or document-heavy work is a natural WorkOS use case.

### DeepSeek

Primary role: cost-efficient reasoning and alternate reasoning path.

DeepSeek should enter as a recognizable low-cost specialist and optional primary responder. Its OpenAI and Anthropic compatibility makes it attractive for implementation, but WorkOS should still treat it as its own provider for labels, defaults, and user trust.

### Perplexity

Primary role: current research with sources.

Perplexity should not be positioned as the default conversational model. It should be the first research specialist: current web lookup, source-backed policy questions, market/event checks, and citation-heavy summaries.

## Second Wave Providers

Add these after the V1 routing loop is working:

- Grok/xAI: recognizable current-events flavor and X ecosystem relevance.
- Mistral: open-weight, EU/compliance, self-deploy, and cost/performance coverage.
- Local/OpenAI-compatible: advanced privacy and local model support through Ollama or custom base URLs.
- Cohere: likely more useful behind the scenes for rerank, retrieval, multilingual enterprise tasks, and embeddings than as a front-and-center chat brand.
- OpenRouter or similar router: useful later for breadth, fallback, and experimentation, but risky as a first-class user-facing option because it can make WorkOS feel like infrastructure.

## Routing Flow

The happy path:

1. User writes a normal prompt in a thread.
2. Composer includes the selected primary responder and whether automatic specialists are enabled.
3. WorkOS assembles thread context through the existing context path.
4. A lightweight router classifies the turn for specialist needs.
5. If no specialist is needed, WorkOS calls only the primary responder.
6. If specialist work is needed, WorkOS creates one or more specialist tasks.
7. Specialist calls run with narrow prompts and explicit output contracts.
8. WorkOS passes specialist summaries, source links, and confidence/freshness metadata to the primary responder.
9. The primary responder writes the final answer.
10. WorkOS stores a manifest showing what was called, why, and what evidence was used.

The user experience should feel like one answer with inspectable provenance.

## Specialist Task Types

V1 should support only a small set:

- Research: current information, source-backed lookup, public policy, market data, legal/regulatory change discovery.
- Source check: verify a factual claim or date against external sources.
- Second opinion: optional deliberate critique for high-stakes decisions.

V1 should avoid broad multi-model debate by default. "Ask the room" can be a later explicit mode.

## Research Specialist V1

The first specialist should be research.

Trigger examples:

- "latest"
- "current"
- "as of today"
- named policy or legal changes
- market, rate, product, or pricing updates
- "look up"
- "find sources"
- "what changed recently"

The router should also infer research need when the question depends on time-sensitive facts, even without an explicit search phrase.

Research output should include:

- concise answer to the sub-question,
- source list,
- publish or access dates when available,
- freshness caveat if needed,
- relevance note for the primary thread question,
- confidence level.

The primary responder should integrate the research rather than merely append it.

## Composer UX

The composer should continue to show a simple selected responder, such as:

`Claude Opus 4.8`

Add a compact specialist control:

`Specialists: Auto`

States:

- Auto: WorkOS may call specialists when useful.
- Off: only call the selected primary responder.
- Ask first: WorkOS pauses before paid or external specialist calls.

The default should be Auto from the start. Early trust should come from clear setup, visible provenance, sane cost controls, and graceful fallback, not from making the user manually approve every useful specialist call.

When a specialist is used, the final answer should show a small provenance affordance:

`Used Research - 4 sources`

Expanding it reveals:

- primary responder,
- specialist model/provider,
- routing reason,
- sources,
- approximate cost or cost tier,
- timestamp,
- any fallback or failure.

Do not expose internal names in user-facing copy. Use plain labels like Context, Sources, Research, and Models.

## Settings UX

Settings should separate:

- Model brands and provider keys.
- Default primary responder.
- Specialist defaults.
- Routing policy.
- Cost and confirmation thresholds.

Recommended settings sections:

- Models: enable Claude, ChatGPT, Gemini, DeepSeek, Perplexity.
- Defaults: choose primary responder for normal threads.
- Specialists: choose preferred Research provider and whether specialists are Auto, Ask first, or Off.
- Safety: require confirmation above a cost tier or before using external web research.

Provider setup should be hand-held. A non-engineer user should understand whether they need an API key, subscription, or built-in WorkOS credit later.

## Provider Onboarding

Adding a model brand usually means connecting an API provider account, not just subscribing to the consumer chat product.

WorkOS should make this explicit before implementation and during setup:

- ChatGPT in WorkOS generally means an OpenAI API key or future WorkOS-managed OpenAI credits, not merely a ChatGPT Plus/Pro subscription.
- Claude in WorkOS generally means an Anthropic API key or future WorkOS-managed Anthropic credits, not merely a Claude app subscription.
- Gemini generally means a Google AI Studio or Vertex AI API key/project.
- DeepSeek generally means a DeepSeek platform API key.
- Perplexity generally means a Perplexity API key for Sonar/research usage.

Consumer subscriptions and API access should be treated as separate surfaces unless a provider explicitly unifies them. The setup UI should avoid implying that a consumer subscription automatically pays for WorkOS model calls.

The implementation plan should include a provider setup checklist for each V1 provider:

- where to create the API key,
- whether billing must be enabled,
- which environment variable or encrypted setting WorkOS stores,
- a tiny validation call,
- expected failure states,
- a redacted connected-state display,
- what the provider is used for by default,
- how Auto routing affects usage and cost.

During implementation, WorkOS should guide the user through one provider at a time. The first shippable path can require user-provided API keys. Later, WorkOS can add hosted credits or billing abstraction so users do not have to manage several provider accounts.

## Data And Runtime Design

The existing `agent_provider_settings`, `agent_runs`, and `AGENT_MODEL_GROUPS` shape is a useful starting point, but it is too narrow for model routing because `provider_key` is currently constrained to execution-oriented providers.

Model Routing V1 should introduce or emulate these concepts:

- Model provider catalog: provider id, user-facing label, auth requirements, supported jobs, model options, default model, cost tier, context limits, grounding support.
- Model call manifest: durable record of primary and specialist calls for a post response.
- Specialist task record: job type, routing reason, provider/model selected, inputs summary, outputs summary, sources, status, error.
- Routing policy config: per-instance and per-thread settings for Auto, Ask first, Off, cost thresholds, and preferred specialists.

Implementation can start with a static TypeScript catalog and JSON manifests before normalizing into dedicated tables. The key is to avoid baking another hardcoded provider union into multiple UI and database constraints.

## Comparable Patterns

The underlying architecture is an established agent pattern, but the WorkOS product expression should be opinionated and calmer than most implementations.

Existing architecture names include:

- Orchestrator-workers: a central model breaks a task into subtasks, delegates to worker models, and synthesizes the result.
- Supervisor or manager agent: one primary agent coordinates specialized workers.
- Agents-as-tools: the main agent remains responsible for the final answer and calls specialists as tools.
- Handoffs: control transfers from one agent to another when a different specialist should own the next step.
- Model router: infrastructure chooses between models or providers based on cost, capability, fallback, or availability.

WorkOS should borrow the proven pattern but not expose it as an agent-building framework. The user-facing innovation is the product layer:

- familiar model brands,
- one primary responder,
- automatic specialist calls only when useful,
- durable provenance,
- context-aware privacy minimization,
- clear cost and setup guidance,
- final answers that stay coherent.

This means Model Routing V1 is not a research invention from scratch. It is a productized, WorkOS-specific form of a known orchestration pattern.

## Manifest Shape

Every routed answer should produce a manifest like:

```json
{
  "primary": {
    "provider": "anthropic",
    "brand": "Claude",
    "model": "claude-opus-4-8",
    "job": "synthesis"
  },
  "specialists": [
    {
      "job": "research",
      "provider": "perplexity",
      "brand": "Perplexity",
      "model": "sonar-pro",
      "reason": "The user asked for the latest immigration policy.",
      "status": "completed",
      "source_count": 4,
      "freshness": "current"
    }
  ],
  "policy": {
    "mode": "auto",
    "confirmation_required": false
  }
}
```

The exact persisted shape can evolve, but the product contract should remain stable: what was called, why, and how it affected the answer.

## Error Handling

Specialist routing should degrade gracefully.

- If a specialist call fails, the primary responder can answer with an explicit caveat.
- If current research is required and unavailable, WorkOS should say it could not verify the current fact rather than bluffing.
- If a provider key is missing, WorkOS should either ask to connect the provider or use a configured fallback.
- If Auto mode would exceed a cost threshold, WorkOS should pause and ask.

Failures should be stored in the manifest so the answer's provenance remains honest.

## Cost And Trust

Multi-model routing can become expensive and opaque. V1 needs trust controls from the start.

Required controls:

- Auto, Ask first, Off routing modes.
- Per-provider enablement.
- Preferred Research provider.
- Per-query specialist budget controls.
- Cost tier shown in expanded provenance.

Recommended V1 defaults:

- Use as many automatic research specialist calls as are appropriate for the user's ask, bounded by policy, cost, latency, and privacy controls.
- Avoid broad fan-out for its own sake; each specialist call must have a named sub-question, routing reason, and expected contribution to the final answer.
- No automatic second opinion unless the user explicitly asks or the thread is configured for high-stakes review.

## Privacy And Data Boundaries

Before sending thread context to a specialist, WorkOS should minimize the payload.

For research tasks, the specialist usually does not need the user's full financial context. It needs the narrow public-policy sub-question and enough framing to return relevant evidence.

The primary responder can receive the user's private context and the research summary. The research specialist should receive only the research question unless the user explicitly includes private context that is necessary.

This is essential for trust once WorkOS spans multiple providers.

## Non-Goals

- Do not build a full model marketplace in V1.
- Do not expose OpenRouter-style provider breadth as the main user experience.
- Do not make every query call multiple models.
- Do not add autonomous long-running agent orchestration as part of this work.
- Do not merge Codex/Claude Code execution agents into normal chat model selection.
- Do not make Perplexity the general-purpose answer author by default.
- Do not require the user to understand provider/model/job terminology in the composer.

## Testing And Verification

Verification should cover:

- Router classification for current-events and source-needed prompts.
- No specialist call for ordinary personal-context questions.
- Correct specialist selection when Research is enabled.
- Graceful fallback when the research provider is disabled or missing credentials.
- Manifest records primary and specialist calls.
- Primary answer receives specialist summary and sources.
- Private thread context is not sent to research specialists unless needed.
- Composer and settings UI remain simple on mobile and desktop.
- Existing Claude-only inline reply flow still works.

Golden tests should include the financial-planning plus current immigration-policy example because it captures the desired behavior.

## Rollout Plan

Phase 1: Catalog and UI language

- Define provider/model/job catalog.
- Add ChatGPT/OpenAI, Gemini, DeepSeek, and Perplexity as recognizable brands in settings.
- Separate execution agents from chat model brands.

Phase 2: Research specialist

- Add turn classification for research needs.
- Add one specialist call path for Research.
- Store a call manifest.
- Feed research summary and sources into the primary responder.

Phase 3: Provenance surface

- Show "Used Research" on answers.
- Expand to show sources, providers, routing reason, timestamp, and fallback state.

Phase 4: Policy controls

- Add Auto, Ask first, Off.
- Add cost thresholds and max specialist calls.
- Add preferred Research provider.

Phase 5: Broader routing

- Add second opinion mode.
- Add cheap draft or cheap extraction routes.
- Add local/OpenAI-compatible provider support.

The first shippable milestone is: a user asks a Claude-led question that depends on current research, WorkOS detects that dependency, calls a research specialist once, and Claude produces a final answer with visible sources and a stored routing manifest.
