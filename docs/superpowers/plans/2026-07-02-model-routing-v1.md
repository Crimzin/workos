# Model Routing V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable Model Routing V1 milestone: recognizable model providers in settings, Auto specialist routing by default, Perplexity-backed research specialist calls, and Claude-authored final replies with visible routing provenance.

**Architecture:** Keep existing execution agents (`inline_claude`, `codex`, `claude_code`) separate from model providers (`anthropic`, `openai`, `google`, `deepseek`, `perplexity`). Add a model provider catalog and settings layer, route research subtasks before the primary Claude stream, pass specialist summaries into the Claude prompt, and persist a manifest on both the run and reply post metadata.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/Postgres migrations, server actions, Tailwind v4 tokens, existing Anthropic SDK wrapper, native `fetch` for Perplexity's OpenAI-compatible chat API, focused `tsx` tests.

---

## Scope

This plan implements the Model Routing V1 first milestone from `docs/superpowers/specs/2026-07-02-model-routing-v1-design.md`.

Included:

- Model provider catalog for Claude, ChatGPT/OpenAI, Gemini, DeepSeek, and Perplexity.
- Provider setup guidance that makes API keys and consumer subscriptions clearly separate.
- Persisted model provider settings and routing policy.
- Composer control showing `Specialists: Auto` by default.
- Research need detection and sub-question extraction for time-sensitive prompts.
- Perplexity research specialist invocation through `PERPLEXITY_API_KEY`.
- Claude prompt integration for research summaries and sources.
- Manifest storage on `agent_runs.prompt_manifest` and reply post metadata.
- Visible `Used Research - N sources` chip on routed agent replies.

Excluded from this plan:

- Making ChatGPT, Gemini, or DeepSeek primary answer authors.
- Broad multi-model debate.
- Ask-first approval UI for specialist calls.
- Hosted WorkOS credits or encrypted API-key storage.
- Grok, Mistral, local models, OpenRouter, and second-wave providers.

The first usable milestone is: a user asks WorkOS/Claude a finance-planning question that depends on current immigration policy, WorkOS automatically runs one or more research specialist calls as needed, Claude writes the final answer, and the reply shows a `Used Research` provenance chip.

## File Structure

Create:

- `apps/platform/src/lib/agents/model-catalog.ts` - static model provider catalog, setup guidance, default models, and routing defaults.
- `apps/platform/src/lib/agents/model-catalog.test.ts` - catalog and provider setup tests.
- `apps/platform/supabase/migrations/0031_model_routing.sql` - model provider settings and routing policy tables.
- `apps/platform/supabase/migrations/model-routing.test.ts` - migration text assertions.
- `apps/platform/src/lib/model-settings.ts` - cached model settings read helper with env-key status.
- `apps/platform/src/lib/actions/model-settings.ts` - server actions for model provider defaults and routing policy.
- `apps/platform/src/components/model-settings.tsx` - `/settings/models` client UI.
- `apps/platform/src/lib/agents/research-router.ts` - pure research routing classifier and sub-question builder.
- `apps/platform/src/lib/agents/research-router.test.ts` - classifier tests, including the finance/immigration example.
- `apps/platform/src/lib/agents/perplexity-research.ts` - Perplexity research request builder, response parser, and invocation.
- `apps/platform/src/lib/agents/perplexity-research.test.ts` - request/parser/error tests.
- `apps/platform/src/lib/agents/model-routing.ts` - orchestration helpers for specialist calls and manifest assembly.
- `apps/platform/src/lib/agents/model-routing.test.ts` - pure manifest and fallback tests.
- `apps/platform/src/components/research-provenance-chip.tsx` - compact `Used Research` chip for agent reply posts.
- `apps/platform/src/components/research-provenance-chip.test.ts` - source-scan tests for chip labels.

Modify:

- `apps/platform/src/lib/types.ts` - model provider, routing policy, and post metadata types.
- `apps/platform/src/lib/cache.ts` - model settings cache tag and revalidation helper.
- `apps/platform/src/lib/settings-nav.ts` - add Models settings tab.
- `apps/platform/src/app/settings/agents/page.tsx` - remove model-default copy from Agents description.
- `apps/platform/src/app/settings/models/page.tsx` - new server page for model settings.
- `apps/platform/src/lib/thread-surface.ts` - load model settings for thread route composer.
- `apps/platform/src/components/thread/thread-surface.tsx` - pass model settings into `PostsTabContent`.
- `apps/platform/src/components/detail-panel.tsx` - load and pass model settings for panel composer.
- `apps/platform/src/components/posts-tab-content.tsx` - show primary model and `Specialists: Auto`, submit model routing policy metadata.
- `apps/platform/src/lib/actions/posts.ts` - run research specialists before streaming Claude and persist manifest/post metadata.
- `apps/platform/src/lib/agents/router.ts` - thread specialist results through prompt rendering.
- `apps/platform/src/lib/agents/claude-prompt.ts` - render specialist research section.
- `apps/platform/src/lib/agents/claude-prompt.test.ts` - assert specialist research is before active thread.
- `apps/platform/src/lib/agents/reply-poster.ts` - accept metadata when creating/updating streaming replies.
- `apps/platform/src/components/post-item.tsx` - render research provenance chip from post metadata.
- `apps/platform/src/lib/agents/model-selection.ts` - keep agent provider selection working while delegating model-provider data to the catalog.
- `apps/platform/src/lib/agents/model-selection.test.ts` - assert WorkOS/Claude still map to `inline_claude`.

## Provider Setup Facts

V1 uses environment variables for API secrets:

- `ANTHROPIC_API_KEY` - already used by Claude.
- `OPENAI_API_KEY` - shown in settings for ChatGPT/OpenAI, not invoked in this plan.
- `GEMINI_API_KEY` - shown in settings for Gemini, not invoked in this plan.
- `DEEPSEEK_API_KEY` - shown in settings for DeepSeek, not invoked in this plan.
- `PERPLEXITY_API_KEY` - used by the Research specialist.

The UI must say consumer subscriptions are separate from API billing:

- ChatGPT Plus/Pro does not cover OpenAI API calls.
- Claude Pro/Max does not cover Anthropic API calls.
- Gemini, DeepSeek, and Perplexity need their own API setup.

No API secret is written to Supabase in this plan.

---

### Task 1: Static Model Provider Catalog

**Files:**
- Create: `apps/platform/src/lib/agents/model-catalog.ts`
- Create: `apps/platform/src/lib/agents/model-catalog.test.ts`
- Modify: `apps/platform/src/lib/types.ts`

- [ ] **Step 1: Add model provider and policy types**

In `apps/platform/src/lib/types.ts`, add these exports near `AgentProviderKey`:

```ts
export type ModelProviderKey =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "perplexity";

export type ModelJob =
  | "synthesis"
  | "research"
  | "source_check"
  | "cheap_reasoning";

export type ModelRoutingMode = "auto" | "ask_first" | "off";
export type ModelCostTier = "low" | "standard" | "premium";

export interface ModelOption {
  providerKey: ModelProviderKey;
  modelId: string;
  label: string;
  jobs: ModelJob[];
  costTier: ModelCostTier;
}

export interface ModelProviderSetting {
  id: string;
  instance_id: string;
  provider_key: ModelProviderKey;
  label: string;
  enabled: boolean;
  auth_strategy: "env";
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ModelRoutingPolicy {
  id: string;
  instance_id: string;
  mode: ModelRoutingMode;
  preferred_research_provider_key: ModelProviderKey;
  max_cost_tier: ModelCostTier;
  allow_parallel_research: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Write failing catalog test**

Create `apps/platform/src/lib/agents/model-catalog.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  DEFAULT_MODEL_ROUTING_POLICY,
  MODEL_PROVIDER_CATALOG,
  defaultModelForModelProvider,
  envVarForModelProvider,
  providerSetupSteps,
  researchProviderOptions,
} from "./model-catalog.ts";

assert.deepEqual(Object.keys(MODEL_PROVIDER_CATALOG), [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "perplexity",
]);

assert.equal(MODEL_PROVIDER_CATALOG.openai.brandLabel, "ChatGPT");
assert.equal(MODEL_PROVIDER_CATALOG.anthropic.brandLabel, "Claude");
assert.equal(MODEL_PROVIDER_CATALOG.perplexity.defaultModelId, "sonar-pro");
assert.equal(defaultModelForModelProvider("perplexity")?.modelId, "sonar-pro");
assert.equal(envVarForModelProvider("deepseek"), "DEEPSEEK_API_KEY");

assert.deepEqual(
  researchProviderOptions().map((option) => option.providerKey),
  ["perplexity", "google"]
);

assert.equal(DEFAULT_MODEL_ROUTING_POLICY.mode, "auto");
assert.equal(DEFAULT_MODEL_ROUTING_POLICY.preferredResearchProviderKey, "perplexity");
assert.equal(DEFAULT_MODEL_ROUTING_POLICY.allowParallelResearch, true);

assert.match(
  providerSetupSteps("openai").join("\n"),
  /ChatGPT Plus\/Pro does not include OpenAI API usage/
);
assert.match(
  providerSetupSteps("anthropic").join("\n"),
  /Claude app subscription does not include Anthropic API usage/
);
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/model-catalog.test.ts
```

Expected: FAIL because `model-catalog.ts` does not exist.

- [ ] **Step 4: Implement catalog**

Create `apps/platform/src/lib/agents/model-catalog.ts`:

```ts
import type {
  ModelCostTier,
  ModelJob,
  ModelOption,
  ModelProviderKey,
  ModelRoutingMode,
} from "../types";

export interface ModelProviderCatalogEntry {
  providerKey: ModelProviderKey;
  brandLabel: string;
  providerLabel: string;
  envVar: string;
  defaultModelId: string;
  supportedJobs: ModelJob[];
  setupUrl: string;
  billingNote: string;
  models: ModelOption[];
}

export interface DefaultModelRoutingPolicy {
  mode: ModelRoutingMode;
  preferredResearchProviderKey: ModelProviderKey;
  maxCostTier: ModelCostTier;
  allowParallelResearch: boolean;
}

export const MODEL_PROVIDER_CATALOG: Record<
  ModelProviderKey,
  ModelProviderCatalogEntry
> = {
  anthropic: {
    providerKey: "anthropic",
    brandLabel: "Claude",
    providerLabel: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModelId: "claude-sonnet-5",
    supportedJobs: ["synthesis"],
    setupUrl: "https://console.anthropic.com/settings/keys",
    billingNote:
      "Claude app subscription does not include Anthropic API usage. WorkOS calls use an Anthropic API key or future WorkOS-managed credits.",
    models: [
      {
        providerKey: "anthropic",
        modelId: "claude-sonnet-5",
        label: "Sonnet 5",
        jobs: ["synthesis"],
        costTier: "standard",
      },
      {
        providerKey: "anthropic",
        modelId: "claude-opus-4-8",
        label: "Opus 4.8",
        jobs: ["synthesis"],
        costTier: "premium",
      },
      {
        providerKey: "anthropic",
        modelId: "claude-haiku-4-5",
        label: "Haiku 4.5",
        jobs: ["synthesis", "cheap_reasoning"],
        costTier: "low",
      },
    ],
  },
  openai: {
    providerKey: "openai",
    brandLabel: "ChatGPT",
    providerLabel: "OpenAI",
    envVar: "OPENAI_API_KEY",
    defaultModelId: "gpt-5.5",
    supportedJobs: ["synthesis"],
    setupUrl: "https://platform.openai.com/api-keys",
    billingNote:
      "ChatGPT Plus/Pro does not include OpenAI API usage. WorkOS calls use an OpenAI API key or future WorkOS-managed credits.",
    models: [
      {
        providerKey: "openai",
        modelId: "gpt-5.5",
        label: "GPT-5.5",
        jobs: ["synthesis"],
        costTier: "premium",
      },
      {
        providerKey: "openai",
        modelId: "gpt-5.4-mini",
        label: "GPT-5.4 Mini",
        jobs: ["synthesis", "cheap_reasoning"],
        costTier: "low",
      },
    ],
  },
  google: {
    providerKey: "google",
    brandLabel: "Gemini",
    providerLabel: "Google",
    envVar: "GEMINI_API_KEY",
    defaultModelId: "gemini-3-pro",
    supportedJobs: ["synthesis", "research"],
    setupUrl: "https://aistudio.google.com/apikey",
    billingNote:
      "Gemini API usage is managed through Google AI Studio or Google Cloud billing. A consumer Gemini app plan is separate from WorkOS API calls.",
    models: [
      {
        providerKey: "google",
        modelId: "gemini-3-pro",
        label: "Gemini 3 Pro",
        jobs: ["synthesis", "research"],
        costTier: "standard",
      },
      {
        providerKey: "google",
        modelId: "gemini-3-flash",
        label: "Gemini 3 Flash",
        jobs: ["synthesis", "research", "cheap_reasoning"],
        costTier: "low",
      },
    ],
  },
  deepseek: {
    providerKey: "deepseek",
    brandLabel: "DeepSeek",
    providerLabel: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    defaultModelId: "deepseek-v4-pro",
    supportedJobs: ["synthesis", "cheap_reasoning"],
    setupUrl: "https://platform.deepseek.com/api_keys",
    billingNote:
      "DeepSeek API usage is billed through the DeepSeek platform. WorkOS uses a DeepSeek API key for DeepSeek calls.",
    models: [
      {
        providerKey: "deepseek",
        modelId: "deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        jobs: ["synthesis"],
        costTier: "standard",
      },
      {
        providerKey: "deepseek",
        modelId: "deepseek-v4-flash",
        label: "DeepSeek V4 Flash",
        jobs: ["synthesis", "cheap_reasoning"],
        costTier: "low",
      },
    ],
  },
  perplexity: {
    providerKey: "perplexity",
    brandLabel: "Perplexity",
    providerLabel: "Perplexity",
    envVar: "PERPLEXITY_API_KEY",
    defaultModelId: "sonar-pro",
    supportedJobs: ["research", "source_check"],
    setupUrl: "https://www.perplexity.ai/settings/api",
    billingNote:
      "Perplexity API usage is billed through the Perplexity API portal. Sonar research calls can include token and request fees.",
    models: [
      {
        providerKey: "perplexity",
        modelId: "sonar-pro",
        label: "Sonar Pro",
        jobs: ["research", "source_check"],
        costTier: "standard",
      },
      {
        providerKey: "perplexity",
        modelId: "sonar",
        label: "Sonar",
        jobs: ["research"],
        costTier: "low",
      },
    ],
  },
};

export const DEFAULT_MODEL_ROUTING_POLICY: DefaultModelRoutingPolicy = {
  mode: "auto",
  preferredResearchProviderKey: "perplexity",
  maxCostTier: "standard",
  allowParallelResearch: true,
};

export function modelProviderKeys(): ModelProviderKey[] {
  return Object.keys(MODEL_PROVIDER_CATALOG) as ModelProviderKey[];
}

export function defaultModelForModelProvider(
  providerKey: ModelProviderKey
): ModelOption | null {
  const entry = MODEL_PROVIDER_CATALOG[providerKey];
  return (
    entry.models.find((model) => model.modelId === entry.defaultModelId) ??
    entry.models[0] ??
    null
  );
}

export function modelForProvider(
  providerKey: ModelProviderKey,
  modelId: string
): ModelOption | null {
  return (
    MODEL_PROVIDER_CATALOG[providerKey].models.find(
      (model) => model.modelId === modelId
    ) ?? null
  );
}

export function envVarForModelProvider(providerKey: ModelProviderKey): string {
  return MODEL_PROVIDER_CATALOG[providerKey].envVar;
}

export function providerSetupSteps(providerKey: ModelProviderKey): string[] {
  const entry = MODEL_PROVIDER_CATALOG[providerKey];
  return [
    `Create or open your ${entry.providerLabel} API account.`,
    `Create an API key at ${entry.setupUrl}.`,
    `Add the key to apps/platform/.env.local as ${entry.envVar}.`,
    entry.billingNote,
    "Restart the WorkOS dev server so the new environment variable is available.",
  ];
}

export function researchProviderOptions(): ModelOption[] {
  return modelProviderKeys()
    .flatMap((providerKey) => MODEL_PROVIDER_CATALOG[providerKey].models)
    .filter((model) => model.jobs.includes("research"));
}
```

- [ ] **Step 5: Run catalog test**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/model-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/types.ts apps/platform/src/lib/agents/model-catalog.ts apps/platform/src/lib/agents/model-catalog.test.ts
git commit -m "feat(model-routing): add model provider catalog"
```

---

### Task 2: Persist Model Settings And Routing Policy

**Files:**
- Create: `apps/platform/supabase/migrations/0031_model_routing.sql`
- Create: `apps/platform/supabase/migrations/model-routing.test.ts`
- Create: `apps/platform/src/lib/model-settings.ts`
- Create: `apps/platform/src/lib/actions/model-settings.ts`
- Modify: `apps/platform/src/lib/cache.ts`

- [ ] **Step 1: Write failing migration test**

Create `apps/platform/supabase/migrations/model-routing.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dirname, "0031_model_routing.sql"),
  "utf8"
);

assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+model_provider_settings/i);
assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+model_routing_policies/i);
assert.match(
  sql,
  /provider_key\s+text\s+not\s+null\s+check\s+\(provider_key\s+in\s+\('anthropic',\s*'openai',\s*'google',\s*'deepseek',\s*'perplexity'\)\)/i
);
assert.match(sql, /mode\s+text\s+not\s+null\s+default\s+'auto'/i);
assert.match(sql, /preferred_research_provider_key\s+text\s+not\s+null\s+default\s+'perplexity'/i);
assert.match(sql, /allow_parallel_research\s+boolean\s+not\s+null\s+default\s+true/i);
assert.match(sql, /unique\s*\(instance_id,\s*provider_key\)/i);
assert.match(sql, /create\s+unique\s+index\s+if\s+not\s+exists\s+model_routing_policies_instance_idx/i);
assert.match(sql, /alter\s+table\s+model_provider_settings\s+enable\s+row\s+level\s+security/i);
assert.match(sql, /alter\s+table\s+model_routing_policies\s+enable\s+row\s+level\s+security/i);
assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i);
```

- [ ] **Step 2: Run migration test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/model-routing.test.ts
```

Expected: FAIL with missing migration file.

- [ ] **Step 3: Add migration**

Create `apps/platform/supabase/migrations/0031_model_routing.sql`:

```sql
-- 0031_model_routing.sql
-- Model provider settings and routing policy for Model Routing V1.

create table if not exists model_provider_settings (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references instances(id) on delete cascade,
  provider_key   text not null check (provider_key in ('anthropic', 'openai', 'google', 'deepseek', 'perplexity')),
  label          text not null,
  enabled        boolean not null default false,
  auth_strategy  text not null default 'env' check (auth_strategy in ('env')),
  config         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(instance_id, provider_key),
  check (length(trim(label)) > 0)
);

create table if not exists model_routing_policies (
  id                              uuid primary key default gen_random_uuid(),
  instance_id                     uuid not null references instances(id) on delete cascade,
  mode                            text not null default 'auto' check (mode in ('auto', 'ask_first', 'off')),
  preferred_research_provider_key text not null default 'perplexity' check (preferred_research_provider_key in ('perplexity', 'google')),
  max_cost_tier                   text not null default 'standard' check (max_cost_tier in ('low', 'standard', 'premium')),
  allow_parallel_research         boolean not null default true,
  config                          jsonb not null default '{}'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create unique index if not exists model_routing_policies_instance_idx
  on model_routing_policies(instance_id);

create index if not exists model_provider_settings_instance_idx
  on model_provider_settings(instance_id);

create or replace function set_model_routing_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_model_provider_settings_updated_at on model_provider_settings;
create trigger trg_model_provider_settings_updated_at
  before update on model_provider_settings
  for each row execute function set_model_routing_updated_at();

drop trigger if exists trg_model_routing_policies_updated_at on model_routing_policies;
create trigger trg_model_routing_policies_updated_at
  before update on model_routing_policies
  for each row execute function set_model_routing_updated_at();

insert into model_provider_settings (instance_id, provider_key, label, enabled, auth_strategy, config)
select id, 'anthropic', 'Claude', true, 'env', '{"default_model_id":"claude-sonnet-5","default_model_label":"Sonnet 5"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (instance_id, provider_key, label, enabled, auth_strategy, config)
select id, 'openai', 'ChatGPT', false, 'env', '{"default_model_id":"gpt-5.5","default_model_label":"GPT-5.5"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (instance_id, provider_key, label, enabled, auth_strategy, config)
select id, 'google', 'Gemini', false, 'env', '{"default_model_id":"gemini-3-pro","default_model_label":"Gemini 3 Pro"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (instance_id, provider_key, label, enabled, auth_strategy, config)
select id, 'deepseek', 'DeepSeek', false, 'env', '{"default_model_id":"deepseek-v4-pro","default_model_label":"DeepSeek V4 Pro"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (instance_id, provider_key, label, enabled, auth_strategy, config)
select id, 'perplexity', 'Perplexity', false, 'env', '{"default_model_id":"sonar-pro","default_model_label":"Sonar Pro"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_routing_policies (instance_id, mode, preferred_research_provider_key, max_cost_tier, allow_parallel_research, config)
select id, 'auto', 'perplexity', 'standard', true, '{}'::jsonb
from instances
on conflict (instance_id) do nothing;

alter table model_provider_settings enable row level security;
alter table model_routing_policies enable row level security;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Add model settings cache tag**

In `apps/platform/src/lib/cache.ts`, add a cache tag and revalidation helper:

```ts
modelSettings: (instanceId: string) => `model-settings:${instanceId}`,
```

Add this near the existing revalidation helpers:

```ts
export function revalidateModelSettings(instanceId: string) {
  revalidateTag(cacheTags.modelSettings(instanceId), IMMEDIATE);
}
```

- [ ] **Step 5: Add model settings read helper**

Create `apps/platform/src/lib/model-settings.ts`:

```ts
import { unstable_cache } from "next/cache";
import {
  DEFAULT_MODEL_ROUTING_POLICY,
  MODEL_PROVIDER_CATALOG,
  defaultModelForModelProvider,
  envVarForModelProvider,
  modelProviderKeys,
} from "./agents/model-catalog";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type {
  ModelProviderKey,
  ModelProviderSetting,
  ModelRoutingPolicy,
} from "./types";

export interface ModelProviderSettingWithStatus extends ModelProviderSetting {
  brand_label: string;
  env_var: string;
  has_api_key: boolean;
  default_model_label: string;
}

export interface ModelSettingsBundle {
  providers: ModelProviderSettingWithStatus[];
  routingPolicy: ModelRoutingPolicy;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function configuredDefaultLabel(
  providerKey: ModelProviderKey,
  config: Record<string, unknown>
): string {
  const configured = config.default_model_label;
  if (typeof configured === "string" && configured.trim()) return configured;
  return defaultModelForModelProvider(providerKey)?.label ?? "Default";
}

function providerWithRuntimeStatus(
  row: ModelProviderSetting
): ModelProviderSettingWithStatus {
  const catalog = MODEL_PROVIDER_CATALOG[row.provider_key];
  const envVar = envVarForModelProvider(row.provider_key);
  return {
    ...row,
    brand_label: catalog.brandLabel,
    env_var: envVar,
    has_api_key: Boolean(process.env[envVar]),
    default_model_label: configuredDefaultLabel(row.provider_key, row.config),
  };
}

export async function getModelSettings(
  instanceId: string
): Promise<ModelSettingsBundle> {
  return unstable_cache(
    async () => {
      const [providersResult, policyResult] = await Promise.all([
        supabase
          .from("model_provider_settings")
          .select(
            "id,instance_id,provider_key,label,enabled,auth_strategy,config,created_at,updated_at"
          )
          .eq("instance_id", instanceId)
          .order("provider_key", { ascending: true }),
        supabase
          .from("model_routing_policies")
          .select(
            "id,instance_id,mode,preferred_research_provider_key,max_cost_tier,allow_parallel_research,config,created_at,updated_at"
          )
          .eq("instance_id", instanceId)
          .maybeSingle(),
      ]);

      if (providersResult.error) throw providersResult.error;
      if (policyResult.error) throw policyResult.error;

      const rows = (providersResult.data ?? []) as ModelProviderSetting[];
      const byKey = new Map(rows.map((row) => [row.provider_key, row]));
      const providers = modelProviderKeys().map((providerKey) => {
        const row = byKey.get(providerKey);
        if (row) return providerWithRuntimeStatus(row);
        const catalog = MODEL_PROVIDER_CATALOG[providerKey];
        return providerWithRuntimeStatus({
          id: `catalog-${providerKey}`,
          instance_id: instanceId,
          provider_key: providerKey,
          label: catalog.brandLabel,
          enabled: providerKey === "anthropic",
          auth_strategy: "env",
          config: {
            default_model_id: catalog.defaultModelId,
            default_model_label:
              defaultModelForModelProvider(providerKey)?.label ?? "Default",
          },
          created_at: new Date(0).toISOString(),
          updated_at: new Date(0).toISOString(),
        });
      });

      const policy =
        (policyResult.data as ModelRoutingPolicy | null) ??
        ({
          id: `catalog-policy-${instanceId}`,
          instance_id: instanceId,
          mode: DEFAULT_MODEL_ROUTING_POLICY.mode,
          preferred_research_provider_key:
            DEFAULT_MODEL_ROUTING_POLICY.preferredResearchProviderKey,
          max_cost_tier: DEFAULT_MODEL_ROUTING_POLICY.maxCostTier,
          allow_parallel_research:
            DEFAULT_MODEL_ROUTING_POLICY.allowParallelResearch,
          config: {},
          created_at: new Date(0).toISOString(),
          updated_at: new Date(0).toISOString(),
        } satisfies ModelRoutingPolicy);

      return { providers, routingPolicy: policy };
    },
    [`model-settings-${instanceId}`],
    { tags: [cacheTags.modelSettings(instanceId)], revalidate: false }
  )();
}

export function getConfiguredModelId(
  provider: Pick<ModelProviderSetting, "provider_key" | "config">
): string {
  const config = asRecord(provider.config);
  return typeof config.default_model_id === "string"
    ? config.default_model_id
    : MODEL_PROVIDER_CATALOG[provider.provider_key].defaultModelId;
}
```

- [ ] **Step 6: Add server actions**

Create `apps/platform/src/lib/actions/model-settings.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  MODEL_PROVIDER_CATALOG,
  modelForProvider,
} from "../agents/model-catalog";
import { getCurrentActor } from "../actor";
import { revalidateModelSettings } from "../cache";
import { supabase } from "../supabase";
import type {
  ModelCostTier,
  ModelProviderKey,
  ModelRoutingMode,
} from "../types";

function assertModelProviderKey(value: ModelProviderKey): void {
  if (!MODEL_PROVIDER_CATALOG[value]) {
    throw new Error(`Unsupported model provider "${value}".`);
  }
}

function assertResearchProviderKey(value: ModelProviderKey): void {
  if (value !== "perplexity" && value !== "google") {
    throw new Error(`Unsupported research provider "${value}".`);
  }
}

export async function setModelProviderEnabled(
  providerKey: ModelProviderKey,
  enabled: boolean
): Promise<void> {
  assertModelProviderKey(providerKey);
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("model_provider_settings")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("instance_id", actor.instance_id)
    .eq("provider_key", providerKey);
  if (error) throw error;

  revalidateModelSettings(actor.instance_id);
  revalidatePath("/settings/models");
}

export async function setModelProviderDefaultModel(
  providerKey: ModelProviderKey,
  modelId: string
): Promise<void> {
  assertModelProviderKey(providerKey);
  const model = modelForProvider(providerKey, modelId);
  if (!model) {
    throw new Error(`Unsupported model "${modelId}" for "${providerKey}".`);
  }
  const actor = await getCurrentActor();
  const { data, error: readError } = await supabase
    .from("model_provider_settings")
    .select("config")
    .eq("instance_id", actor.instance_id)
    .eq("provider_key", providerKey)
    .single();
  if (readError) throw readError;

  const currentConfig =
    data?.config && typeof data.config === "object" && !Array.isArray(data.config)
      ? (data.config as Record<string, unknown>)
      : {};
  const config = {
    ...currentConfig,
    default_model_id: model.modelId,
    default_model_label: model.label,
  };

  const { error } = await supabase
    .from("model_provider_settings")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("instance_id", actor.instance_id)
    .eq("provider_key", providerKey);
  if (error) throw error;

  revalidateModelSettings(actor.instance_id);
  revalidatePath("/settings/models");
}

export async function setModelRoutingPolicy(
  input: {
    mode?: ModelRoutingMode;
    preferredResearchProviderKey?: ModelProviderKey;
    maxCostTier?: ModelCostTier;
    allowParallelResearch?: boolean;
  }
): Promise<void> {
  const actor = await getCurrentActor();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.mode) patch.mode = input.mode;
  if (input.preferredResearchProviderKey) {
    assertResearchProviderKey(input.preferredResearchProviderKey);
    patch.preferred_research_provider_key = input.preferredResearchProviderKey;
  }
  if (input.maxCostTier) patch.max_cost_tier = input.maxCostTier;
  if (typeof input.allowParallelResearch === "boolean") {
    patch.allow_parallel_research = input.allowParallelResearch;
  }

  const { error } = await supabase
    .from("model_routing_policies")
    .update(patch)
    .eq("instance_id", actor.instance_id);
  if (error) throw error;

  revalidateModelSettings(actor.instance_id);
  revalidatePath("/settings/models");
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
cd apps/platform && npx --yes tsx supabase/migrations/model-routing.test.ts && npx --yes tsx src/lib/agents/model-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/supabase/migrations/0031_model_routing.sql apps/platform/supabase/migrations/model-routing.test.ts apps/platform/src/lib/cache.ts apps/platform/src/lib/model-settings.ts apps/platform/src/lib/actions/model-settings.ts
git commit -m "feat(model-routing): persist model settings"
```

---

### Task 3: Models Settings UI With Setup Handholding

**Files:**
- Create: `apps/platform/src/app/settings/models/page.tsx`
- Create: `apps/platform/src/components/model-settings.tsx`
- Modify: `apps/platform/src/lib/settings-nav.ts`
- Modify: `apps/platform/src/app/settings/agents/page.tsx`

- [ ] **Step 1: Write source-scan UI test**

Create `apps/platform/src/components/model-settings.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./model-settings.tsx", import.meta.url),
  "utf8"
);

assert.match(source, /ChatGPT Plus\/Pro does not include OpenAI API usage/);
assert.match(source, /Claude app subscription does not include Anthropic API usage/);
assert.match(source, /Specialists default to Auto/);
assert.match(source, /PERPLEXITY_API_KEY/);
assert.doesNotMatch(source, /BrainShare|Swarm|Finiti/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/model-settings.test.ts
```

Expected: FAIL because `model-settings.tsx` does not exist.

- [ ] **Step 3: Add Models settings page**

Create `apps/platform/src/app/settings/models/page.tsx`:

```tsx
import { ModelSettings } from "@/components/model-settings";
import { getCurrentActor } from "@/lib/actor";
import { getModelSettings } from "@/lib/model-settings";

export const dynamic = "force-dynamic";

export default async function ModelsSettingsPage() {
  const actor = await getCurrentActor();
  const settings = await getModelSettings(actor.instance_id);
  const settingsKey = [
    ...settings.providers.map(
      (provider) =>
        `${provider.provider_key}:${provider.enabled}:${provider.has_api_key}:${JSON.stringify(provider.config)}`
    ),
    `${settings.routingPolicy.mode}:${settings.routingPolicy.preferred_research_provider_key}:${settings.routingPolicy.allow_parallel_research}`,
  ].join("|");

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Models</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Choose familiar model brands and let WorkOS route specialist research automatically.
        </p>
      </div>
      <ModelSettings
        key={settingsKey}
        providers={settings.providers}
        routingPolicy={settings.routingPolicy}
      />
    </section>
  );
}
```

- [ ] **Step 4: Add Models tab and adjust Agents copy**

In `apps/platform/src/lib/settings-nav.ts`, insert Models before Agents:

```ts
{
  href: "/settings/models",
  label: "Models",
  description: "Primary model brands, specialist routing, and API setup.",
},
```

Set:

```ts
export const DEFAULT_SETTINGS_PATH = "/settings/models";
```

In `apps/platform/src/app/settings/agents/page.tsx`, change the description to:

```tsx
Manage AI teammates, execution agents, and required tools.
```

- [ ] **Step 5: Add ModelSettings client component**

Create `apps/platform/src/components/model-settings.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, Search, ToggleLeft, ToggleRight } from "lucide-react";
import {
  setModelProviderDefaultModel,
  setModelProviderEnabled,
  setModelRoutingPolicy,
} from "@/lib/actions/model-settings";
import {
  MODEL_PROVIDER_CATALOG,
  providerSetupSteps,
} from "@/lib/agents/model-catalog";
import type {
  ModelProviderKey,
  ModelRoutingPolicy,
} from "@/lib/types";
import type { ModelProviderSettingWithStatus } from "@/lib/model-settings";

export interface ModelSettingsProps {
  providers: ModelProviderSettingWithStatus[];
  routingPolicy: ModelRoutingPolicy;
}

export function ModelSettings({
  providers,
  routingPolicy,
}: ModelSettingsProps) {
  const [localProviders, setLocalProviders] = useState(providers);
  const [localPolicy, setLocalPolicy] = useState(routingPolicy);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleProvider = (provider: ModelProviderSettingWithStatus) => {
    const enabled = !provider.enabled;
    setLocalProviders((current) =>
      current.map((item) =>
        item.provider_key === provider.provider_key ? { ...item, enabled } : item
      )
    );
    setError(null);
    startTransition(async () => {
      try {
        await setModelProviderEnabled(provider.provider_key, enabled);
      } catch {
        setError("Could not update that model provider.");
        setLocalProviders(providers);
      }
    });
  };

  const setDefaultModel = (
    providerKey: ModelProviderKey,
    modelId: string
  ) => {
    const model = MODEL_PROVIDER_CATALOG[providerKey].models.find(
      (candidate) => candidate.modelId === modelId
    );
    if (!model) return;
    setLocalProviders((current) =>
      current.map((item) =>
        item.provider_key === providerKey
          ? {
              ...item,
              config: {
                ...item.config,
                default_model_id: model.modelId,
                default_model_label: model.label,
              },
              default_model_label: model.label,
            }
          : item
      )
    );
    setError(null);
    startTransition(async () => {
      try {
        await setModelProviderDefaultModel(providerKey, modelId);
      } catch {
        setError("Could not update that default model.");
        setLocalProviders(providers);
      }
    });
  };

  const setResearchProvider = (providerKey: ModelProviderKey) => {
    setLocalPolicy((current) => ({
      ...current,
      preferred_research_provider_key: providerKey,
    }));
    setError(null);
    startTransition(async () => {
      try {
        await setModelRoutingPolicy({ preferredResearchProviderKey: providerKey });
      } catch {
        setError("Could not update the research provider.");
        setLocalPolicy(routingPolicy);
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-bg-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Model Routing</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Specialists default to Auto. WorkOS calls research models when the prompt needs current sources.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-secondary">
            {error}
          </div>
        )}
      </div>

      <section className="border-b border-border px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Specialists</h3>
              <p className="text-xs text-text-tertiary">
                Mode: Auto. Research provider: {MODEL_PROVIDER_CATALOG[localPolicy.preferred_research_provider_key].brandLabel}.
              </p>
            </div>
          </div>
          <select
            value={localPolicy.preferred_research_provider_key}
            onChange={(event) =>
              setResearchProvider(event.target.value as ModelProviderKey)
            }
            disabled={pending}
            className="h-8 rounded-md border border-border bg-bg-card px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            <option value="perplexity">Perplexity</option>
            <option value="google">Gemini</option>
          </select>
        </div>
      </section>

      <section>
        <div className="divide-y divide-border">
          {localProviders.map((provider) => {
            const catalog = MODEL_PROVIDER_CATALOG[provider.provider_key];
            return (
              <div key={provider.provider_key} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {catalog.brandLabel}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-text-tertiary">
                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {provider.has_api_key
                        ? `${provider.env_var} configured`
                        : `Set ${provider.env_var} in apps/platform/.env.local`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleProvider(provider)}
                    disabled={pending}
                    className="rounded-md p-1 text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                    aria-label={`${provider.enabled ? "Disable" : "Enable"} ${catalog.brandLabel}`}
                  >
                    {provider.enabled ? (
                      <ToggleRight className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label
                    htmlFor={`default-model-${provider.provider_key}`}
                    className="text-xs font-medium text-text-tertiary"
                  >
                    Default model
                  </label>
                  <select
                    id={`default-model-${provider.provider_key}`}
                    value={String(provider.config.default_model_id ?? catalog.defaultModelId)}
                    onChange={(event) =>
                      setDefaultModel(provider.provider_key, event.target.value)
                    }
                    disabled={pending}
                    className="h-8 rounded-md border border-border bg-bg-card px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                  >
                    {catalog.models.map((model) => (
                      <option key={model.modelId} value={model.modelId}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 rounded-md border border-border bg-bg-secondary px-3 py-2">
                  <div className="flex items-center gap-1 text-xs font-medium text-text-secondary">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Setup
                  </div>
                  <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-text-tertiary">
                    {providerSetupSteps(provider.provider_key).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run UI test**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/model-settings.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run settings nav tests**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/settings-nav.test.ts
```

Expected before updating the test: FAIL because `DEFAULT_SETTINGS_PATH` and the section labels changed.

Update `apps/platform/src/lib/settings-nav.test.ts` to:

```ts
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS_PATH,
  SETTINGS_SECTIONS,
  isSettingsPathActive,
} from "./settings-nav.ts";

assert.equal(DEFAULT_SETTINGS_PATH, "/settings/models");
assert.deepEqual(
  SETTINGS_SECTIONS.map((section) => section.label),
  ["Models", "Agents", "AI Standards", "Sources", "Memory"]
);
assert.equal(isSettingsPathActive("/settings"), true);
assert.equal(isSettingsPathActive("/settings/models"), true);
assert.equal(isSettingsPathActive("/settings/agents"), true);
assert.equal(isSettingsPathActive("/settings/ai-standards"), true);
assert.equal(isSettingsPathActive("/settings/memory"), true);
assert.equal(isSettingsPathActive("/n/workspace-1"), false);
```

Run again:

```bash
cd apps/platform && npx --yes tsx src/lib/settings-nav.test.ts
```

Expected after updating the test: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/src/app/settings/models/page.tsx apps/platform/src/components/model-settings.tsx apps/platform/src/components/model-settings.test.ts apps/platform/src/lib/settings-nav.ts apps/platform/src/app/settings/agents/page.tsx apps/platform/src/lib/settings-nav.test.ts
git commit -m "feat(model-routing): add model settings UI"
```

---

### Task 4: Pass Model Settings To The Composer

**Files:**
- Modify: `apps/platform/src/lib/thread-surface.ts`
- Modify: `apps/platform/src/components/thread/thread-surface.tsx`
- Modify: `apps/platform/src/components/detail-panel.tsx`
- Modify: `apps/platform/src/components/posts-tab-content.tsx`
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Create: `apps/platform/src/components/model-routing-composer.test.ts`

- [ ] **Step 1: Write source-scan composer wiring test**

Create `apps/platform/src/components/model-routing-composer.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const postsTab = readFileSync(
  new URL("./posts-tab-content.tsx", import.meta.url),
  "utf8"
);
const threadSurface = readFileSync(
  new URL("./thread/thread-surface.tsx", import.meta.url),
  "utf8"
);
const detailPanel = readFileSync(
  new URL("./detail-panel.tsx", import.meta.url),
  "utf8"
);

assert.match(postsTab, /modelSettings:/);
assert.match(postsTab, /Specialists: Auto/);
assert.match(postsTab, /modelRoutingPolicy/);
assert.match(threadSurface, /modelSettings=/);
assert.match(detailPanel, /modelSettings=/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/model-routing-composer.test.ts
```

Expected: FAIL because the prop chain is not wired.

- [ ] **Step 3: Add model settings to thread-surface data**

In `apps/platform/src/lib/thread-surface.ts`:

Add import:

```ts
import { getModelSettings, type ModelSettingsBundle } from "./model-settings";
```

Add to `ThreadSurfaceData`:

```ts
modelSettings: ModelSettingsBundle;
```

Add `modelSettings` to the Promise list:

```ts
modelSettings,
```

where the Promise is:

```ts
getModelSettings(actor.instance_id),
```

Return it:

```ts
modelSettings,
```

- [ ] **Step 4: Pass model settings through thread surface**

In `apps/platform/src/components/thread/thread-surface.tsx`, destructure:

```ts
modelSettings,
```

Pass into `PostsTabContent`:

```tsx
modelSettings={modelSettings}
```

- [ ] **Step 5: Pass model settings through detail panel**

In `apps/platform/src/components/detail-panel.tsx`:

Add import:

```ts
import { getModelSettings, type ModelSettingsBundle } from "@/lib/model-settings";
```

Add `modelSettings` to the Promise list:

```ts
getModelSettings(actor.instance_id),
```

Add it to `DetailBody` props:

```tsx
modelSettings={modelSettings}
```

Add to `DetailBody` type:

```ts
modelSettings: ModelSettingsBundle;
```

Pass into `PostsTabContent`:

```tsx
modelSettings={modelSettings}
```

- [ ] **Step 6: Add composer prop and submit metadata**

In `apps/platform/src/components/posts-tab-content.tsx`, add import:

```ts
import type { ModelSettingsBundle } from "@/lib/model-settings";
```

Add to `PostsTabContentProps`:

```ts
modelSettings: ModelSettingsBundle;
```

Destructure it in the component args:

```ts
modelSettings,
```

Create a primary model label:

```ts
const primaryModelProvider =
  modelSettings.providers.find((provider) => provider.provider_key === "anthropic") ??
  modelSettings.providers[0] ??
  null;
const primaryModelLabel = primaryModelProvider
  ? `${primaryModelProvider.brand_label} ${primaryModelProvider.default_model_label}`
  : selectedModel?.label ?? "AI";
```

Where `createPost` is called, include model routing policy:

```ts
modelRoutingPolicy: {
  mode: modelSettings.routingPolicy.mode,
  preferredResearchProviderKey:
    modelSettings.routingPolicy.preferred_research_provider_key,
  allowParallelResearch: modelSettings.routingPolicy.allow_parallel_research,
},
```

Near the existing `AgentModelMenu`, render a compact indicator:

```tsx
<div className="hidden items-center gap-1 text-xs font-medium text-text-tertiary sm:flex">
  <span className="truncate">{primaryModelLabel}</span>
  <span aria-hidden="true">-</span>
  <span>Specialists: Auto</span>
</div>
```

In `apps/platform/src/lib/actions/posts.ts`, extend `createPost` options:

```ts
modelRoutingPolicy?: {
  mode: "auto" | "ask_first" | "off";
  preferredResearchProviderKey: "anthropic" | "openai" | "google" | "deepseek" | "perplexity";
  allowParallelResearch: boolean;
} | null;
```

Thread this through `processAgentMentionsForPost` input:

```ts
modelRoutingPolicy: options.modelRoutingPolicy ?? null,
```

and add it to the process function input type.

- [ ] **Step 7: Run composer wiring test**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/model-routing-composer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/src/lib/thread-surface.ts apps/platform/src/components/thread/thread-surface.tsx apps/platform/src/components/detail-panel.tsx apps/platform/src/components/posts-tab-content.tsx apps/platform/src/lib/actions/posts.ts apps/platform/src/components/model-routing-composer.test.ts
git commit -m "feat(model-routing): show auto specialists in composer"
```

---

### Task 5: Research Routing Classifier

**Files:**
- Create: `apps/platform/src/lib/agents/research-router.ts`
- Create: `apps/platform/src/lib/agents/research-router.test.ts`

- [ ] **Step 1: Write failing research router test**

Create `apps/platform/src/lib/agents/research-router.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildResearchRoutingPlan,
  extractResearchSubQuestions,
  shouldUseResearchSpecialist,
} from "./research-router.ts";

assert.equal(
  shouldUseResearchSpecialist(
    "I am planning finances. Research the Trump administration's latest immigration policy and how it might affect my job timeline."
  ),
  true
);

assert.deepEqual(
  extractResearchSubQuestions(
    "For my financial plan, research the latest immigration policy and current mortgage rates."
  ),
  [
    "What are the latest immigration policy changes relevant to the user's financial planning question?",
    "What are current mortgage rate conditions relevant to the user's financial planning question?",
  ]
);

assert.equal(
  shouldUseResearchSpecialist("Help me think through the tradeoff using the context already in this thread."),
  false
);

assert.deepEqual(
  buildResearchRoutingPlan({
    text: "Look up recent H-1B policy changes and current CD rates.",
    mode: "auto",
    preferredProviderKey: "perplexity",
    allowParallelResearch: true,
  }),
  {
    mode: "auto",
    providerKey: "perplexity",
    tasks: [
      {
        job: "research",
        providerKey: "perplexity",
        question:
          "What are recent H-1B policy changes relevant to the user's question?",
        reason: "The user asked for recent policy information.",
      },
      {
        job: "research",
        providerKey: "perplexity",
        question:
          "What are current CD rate conditions relevant to the user's question?",
        reason: "The user asked for current financial market information.",
      },
    ],
  }
);

assert.equal(
  buildResearchRoutingPlan({
    text: "Look up the latest immigration policy.",
    mode: "off",
    preferredProviderKey: "perplexity",
    allowParallelResearch: true,
  }).tasks.length,
  0
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/research-router.test.ts
```

Expected: FAIL because `research-router.ts` does not exist.

- [ ] **Step 3: Implement research router**

Create `apps/platform/src/lib/agents/research-router.ts`:

```ts
import type { ModelProviderKey, ModelRoutingMode } from "../types";

export interface ResearchRoutingTask {
  job: "research";
  providerKey: ModelProviderKey;
  question: string;
  reason: string;
}

export interface ResearchRoutingPlan {
  mode: ModelRoutingMode;
  providerKey: ModelProviderKey;
  tasks: ResearchRoutingTask[];
}

export interface BuildResearchRoutingPlanInput {
  text: string;
  mode: ModelRoutingMode;
  preferredProviderKey: ModelProviderKey;
  allowParallelResearch: boolean;
}

const RECENCY_TERMS = [
  "latest",
  "current",
  "recent",
  "as of today",
  "today",
  "this week",
  "this month",
  "look up",
  "research",
  "find sources",
  "what changed",
];

const POLICY_TERMS = [
  "immigration",
  "visa",
  "h-1b",
  "policy",
  "regulation",
  "administration",
  "law",
  "legal",
];

const MARKET_TERMS = [
  "mortgage",
  "rate",
  "rates",
  "cd rate",
  "treasury",
  "market",
  "inflation",
  "tax",
  "pricing",
];

function includesAny(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export function shouldUseResearchSpecialist(text: string): boolean {
  const normalized = text.toLowerCase();
  const asksForFreshness = includesAny(normalized, RECENCY_TERMS);
  const isTimeSensitive =
    includesAny(normalized, POLICY_TERMS) || includesAny(normalized, MARKET_TERMS);
  return asksForFreshness && isTimeSensitive;
}

export function extractResearchSubQuestions(text: string): string[] {
  const normalized = text.toLowerCase();
  const questions: string[] = [];

  if (includesAny(normalized, ["immigration", "visa", "h-1b"])) {
    if (normalized.includes("h-1b")) {
      questions.push(
        "What are recent H-1B policy changes relevant to the user's question?"
      );
    } else {
      questions.push(
        "What are the latest immigration policy changes relevant to the user's financial planning question?"
      );
    }
  } else if (includesAny(normalized, ["policy", "regulation", "law"])) {
    questions.push(
      "What are the latest policy or regulatory changes relevant to the user's question?"
    );
  }

  if (includesAny(normalized, ["mortgage", "mortgage rates"])) {
    questions.push(
      "What are current mortgage rate conditions relevant to the user's financial planning question?"
    );
  } else if (includesAny(normalized, ["cd rate", "cd rates"])) {
    questions.push(
      "What are current CD rate conditions relevant to the user's question?"
    );
  } else if (includesAny(normalized, ["market", "inflation", "treasury"])) {
    questions.push(
      "What are current market conditions relevant to the user's question?"
    );
  }

  if (questions.length === 0 && shouldUseResearchSpecialist(text)) {
    questions.push(
      "What current external facts are needed to answer the user's question accurately?"
    );
  }

  return [...new Set(questions)];
}

function reasonForQuestion(question: string): string {
  const normalized = question.toLowerCase();
  if (
    normalized.includes("policy") ||
    normalized.includes("immigration") ||
    normalized.includes("h-1b")
  ) {
    return "The user asked for recent policy information.";
  }
  if (
    normalized.includes("rate") ||
    normalized.includes("market") ||
    normalized.includes("inflation")
  ) {
    return "The user asked for current financial market information.";
  }
  return "The user asked for current external information.";
}

export function buildResearchRoutingPlan(
  input: BuildResearchRoutingPlanInput
): ResearchRoutingPlan {
  if (input.mode === "off" || !shouldUseResearchSpecialist(input.text)) {
    return {
      mode: input.mode,
      providerKey: input.preferredProviderKey,
      tasks: [],
    };
  }

  const questions = extractResearchSubQuestions(input.text);
  const selectedQuestions = input.allowParallelResearch
    ? questions
    : questions.slice(0, 1);

  return {
    mode: input.mode,
    providerKey: input.preferredProviderKey,
    tasks: selectedQuestions.map((question) => ({
      job: "research",
      providerKey: input.preferredProviderKey,
      question,
      reason: reasonForQuestion(question),
    })),
  };
}
```

- [ ] **Step 4: Run research router test**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/research-router.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/agents/research-router.ts apps/platform/src/lib/agents/research-router.test.ts
git commit -m "feat(model-routing): classify research specialist needs"
```

---

### Task 6: Perplexity Research Specialist Client

**Files:**
- Create: `apps/platform/src/lib/agents/perplexity-research.ts`
- Create: `apps/platform/src/lib/agents/perplexity-research.test.ts`

- [ ] **Step 1: Write failing Perplexity client test**

Create `apps/platform/src/lib/agents/perplexity-research.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  ProviderConfigurationError,
  buildPerplexityResearchRequest,
  parsePerplexityResearchResponse,
} from "./perplexity-research.ts";

const request = buildPerplexityResearchRequest({
  model: "sonar-pro",
  question: "What are the latest immigration policy changes?",
});

assert.equal(request.model, "sonar-pro");
assert.equal(request.messages[0].role, "system");
assert.match(request.messages[0].content, /source-backed research specialist/);
assert.equal(request.messages[1].role, "user");
assert.match(request.messages[1].content, /latest immigration policy/);

const parsed = parsePerplexityResearchResponse({
  id: "resp-1",
  model: "sonar-pro",
  choices: [
    {
      message: {
        role: "assistant",
        content:
          "Recent policy changes include new filing guidance.\n\nSources:\n- https://example.gov/policy\n- https://example.com/analysis",
      },
    },
  ],
  citations: ["https://example.gov/policy", "https://example.com/analysis"],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  },
});

assert.equal(parsed.model, "sonar-pro");
assert.equal(parsed.summary.includes("Recent policy changes"), true);
assert.deepEqual(parsed.sources.map((source) => source.url), [
  "https://example.gov/policy",
  "https://example.com/analysis",
]);
assert.equal(parsed.usage?.total_tokens, 150);

const error = new ProviderConfigurationError("perplexity", "PERPLEXITY_API_KEY");
assert.equal(
  error.message,
  "perplexity is not configured. Set PERPLEXITY_API_KEY in apps/platform/.env.local."
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/perplexity-research.test.ts
```

Expected: FAIL because `perplexity-research.ts` does not exist.

- [ ] **Step 3: Implement Perplexity client**

Create `apps/platform/src/lib/agents/perplexity-research.ts`:

```ts
export interface PerplexityResearchInput {
  model: string;
  question: string;
}

export interface ResearchSource {
  title: string | null;
  url: string;
}

export interface ResearchUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ResearchSpecialistResult {
  job: "research";
  providerKey: "perplexity";
  brand: "Perplexity";
  model: string;
  question: string;
  summary: string;
  sources: ResearchSource[];
  usage: ResearchUsage | null;
  status: "completed" | "failed";
  error?: string;
}

export class ProviderConfigurationError extends Error {
  constructor(providerKey: string, envVar: string) {
    super(
      `${providerKey} is not configured. Set ${envVar} in apps/platform/.env.local.`
    );
    this.name = "ProviderConfigurationError";
  }
}

export function buildPerplexityResearchRequest(input: PerplexityResearchInput) {
  return {
    model: input.model,
    messages: [
      {
        role: "system" as const,
        content:
          "You are a source-backed research specialist for WorkOS. Answer the narrow research question with current information, cite sources, include dates when they matter, and avoid using private user assumptions not present in the question.",
      },
      {
        role: "user" as const,
        content: input.question,
      },
    ],
  };
}

interface PerplexityResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
  }>;
  citations?: string[];
  usage?: ResearchUsage;
}

export function parsePerplexityResearchResponse(
  response: PerplexityResponse
): Omit<ResearchSpecialistResult, "job" | "providerKey" | "brand" | "question" | "status"> {
  const summary =
    response.choices?.[0]?.message?.content?.trim() ??
    "(Perplexity returned an empty research response.)";
  const urlsFromCitations = response.citations ?? [];
  const urlsFromBody = [...summary.matchAll(/https?:\/\/[^\s)]+/g)].map(
    (match) => match[0].replace(/[.,;]+$/, "")
  );
  const uniqueUrls = [...new Set([...urlsFromCitations, ...urlsFromBody])];

  return {
    model: response.model ?? "sonar-pro",
    summary,
    sources: uniqueUrls.map((url) => ({ title: null, url })),
    usage: response.usage ?? null,
  };
}

export async function invokePerplexityResearch(
  input: PerplexityResearchInput
): Promise<ResearchSpecialistResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new ProviderConfigurationError("perplexity", "PERPLEXITY_API_KEY");

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPerplexityResearchRequest(input)),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Perplexity research failed with ${response.status}: ${text.slice(0, 240)}`
    );
  }

  const parsed = parsePerplexityResearchResponse(
    (await response.json()) as PerplexityResponse
  );

  return {
    job: "research",
    providerKey: "perplexity",
    brand: "Perplexity",
    question: input.question,
    status: "completed",
    ...parsed,
  };
}
```

- [ ] **Step 4: Run Perplexity client test**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/perplexity-research.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/agents/perplexity-research.ts apps/platform/src/lib/agents/perplexity-research.test.ts
git commit -m "feat(model-routing): add perplexity research client"
```

---

### Task 7: Orchestrate Specialist Research And Claude Prompt Integration

**Files:**
- Create: `apps/platform/src/lib/agents/model-routing.ts`
- Create: `apps/platform/src/lib/agents/model-routing.test.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.test.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`
- Modify: `apps/platform/src/lib/agents/reply-poster.ts`
- Modify: `apps/platform/src/lib/agents/router.ts`

- [ ] **Step 1: Write failing model-routing test**

Create `apps/platform/src/lib/agents/model-routing.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildModelRoutingManifest,
  renderResearchResultsForPrompt,
} from "./model-routing.ts";
import type { ResearchSpecialistResult } from "./perplexity-research.ts";

const result: ResearchSpecialistResult = {
  job: "research",
  providerKey: "perplexity",
  brand: "Perplexity",
  model: "sonar-pro",
  question: "What are the latest immigration policy changes?",
  summary: "A new policy memo changed filing guidance.",
  sources: [
    { title: null, url: "https://example.gov/policy" },
    { title: null, url: "https://example.com/analysis" },
  ],
  usage: { total_tokens: 123 },
  status: "completed",
};

assert.match(renderResearchResultsForPrompt([result]), /# Specialist Research/);
assert.match(renderResearchResultsForPrompt([result]), /A new policy memo/);
assert.match(renderResearchResultsForPrompt([result]), /https:\/\/example.gov\/policy/);

assert.deepEqual(
  buildModelRoutingManifest({
    primary: {
      provider: "anthropic",
      brand: "Claude",
      model: "claude-opus-4-8",
      job: "synthesis",
    },
    specialists: [result],
    policy: {
      mode: "auto",
      confirmationRequired: false,
    },
  }),
  {
    primary: {
      provider: "anthropic",
      brand: "Claude",
      model: "claude-opus-4-8",
      job: "synthesis",
    },
    specialists: [
      {
        job: "research",
        provider: "perplexity",
        brand: "Perplexity",
        model: "sonar-pro",
        reason: "What are the latest immigration policy changes?",
        status: "completed",
        source_count: 2,
        usage: { total_tokens: 123 },
      },
    ],
    policy: {
      mode: "auto",
      confirmation_required: false,
    },
  }
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/model-routing.test.ts
```

Expected: FAIL because `model-routing.ts` does not exist.

- [ ] **Step 3: Add model routing helpers**

Create `apps/platform/src/lib/agents/model-routing.ts`:

```ts
import type { ModelRoutingMode } from "../types";
import type { ResearchSpecialistResult } from "./perplexity-research";

export interface PrimaryModelManifest {
  provider: "anthropic";
  brand: "Claude";
  model: string;
  job: "synthesis";
}

export interface BuildModelRoutingManifestInput {
  primary: PrimaryModelManifest;
  specialists: ResearchSpecialistResult[];
  policy: {
    mode: ModelRoutingMode;
    confirmationRequired: boolean;
  };
}

export function renderResearchResultsForPrompt(
  results: ResearchSpecialistResult[]
): string | null {
  const completed = results.filter((result) => result.status === "completed");
  if (completed.length === 0) return null;

  return [
    "# Specialist Research",
    "",
    "Use these source-backed research notes when they are relevant. Do not claim more certainty than the sources support.",
    "",
    ...completed.flatMap((result, index) => [
      `## Research ${index + 1}: ${result.question}`,
      "",
      result.summary,
      "",
      "Sources:",
      ...result.sources.map((source, sourceIndex) =>
        `${sourceIndex + 1}. ${source.title ? `${source.title}: ` : ""}${source.url}`
      ),
      "",
    ]),
  ].join("\n").trim();
}

export function buildModelRoutingManifest(
  input: BuildModelRoutingManifestInput
): Record<string, unknown> {
  return {
    primary: input.primary,
    specialists: input.specialists.map((result) => ({
      job: result.job,
      provider: result.providerKey,
      brand: result.brand,
      model: result.model,
      reason: result.question,
      status: result.status,
      source_count: result.sources.length,
      usage: result.usage,
      ...(result.error ? { error: result.error } : {}),
    })),
    policy: {
      mode: input.policy.mode,
      confirmation_required: input.policy.confirmationRequired,
    },
  };
}

export function researchSourceCount(results: ResearchSpecialistResult[]): number {
  return results.reduce((count, result) => count + result.sources.length, 0);
}
```

- [ ] **Step 4: Thread research results into Claude prompt**

In `apps/platform/src/lib/agents/claude-prompt.ts`, add import:

```ts
import {
  renderResearchResultsForPrompt,
} from "./model-routing";
import type { ResearchSpecialistResult } from "./perplexity-research";
```

Add to `ClaudePromptOptions`:

```ts
specialistResearchResults?: ResearchSpecialistResult[];
```

In `buildUserMessage`, after the thread context sheet block and before attached context guidance, insert:

```ts
const specialistResearch = renderResearchResultsForPrompt(
  options.specialistResearchResults ?? []
);
if (specialistResearch) sections.push(specialistResearch);
```

Append to `apps/platform/src/lib/agents/claude-prompt.test.ts`:

```ts
const researchPrompt = renderClaudePrompt(ctx, {
  targetPostId: "target",
  now: new Date("2026-06-22T16:43:00.000Z"),
  specialistResearchResults: [
    {
      job: "research",
      providerKey: "perplexity",
      brand: "Perplexity",
      model: "sonar-pro",
      question: "What are the latest immigration policy changes?",
      summary: "A new policy memo changed filing guidance.",
      sources: [{ title: null, url: "https://example.gov/policy" }],
      usage: null,
      status: "completed",
    },
  ],
});

assert.ok(
  researchPrompt.userMessage.indexOf("# Specialist Research") <
    researchPrompt.userMessage.indexOf(
      '# Active thread on "AI Diagnostic 2.0: Contextual assessment"'
    )
);
assert.match(researchPrompt.userMessage, /https:\/\/example.gov\/policy/);
```

- [ ] **Step 5: Allow streaming replies to receive metadata**

In `apps/platform/src/lib/agents/reply-poster.ts`, extend `CreateStreamingAgentReplyOptions`:

```ts
metadata?: Record<string, unknown>;
```

In `createStreamingAgentReply`, include metadata in the insert:

```ts
metadata: options.metadata ?? {},
```

Add an exported helper:

```ts
export async function updateStreamingAgentReplyMetadata(
  handle: StreamingReplyHandle,
  metadata: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("posts")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", handle.postId);
  if (error) throw error;
}
```

- [ ] **Step 6: Run specialists before Claude stream**

In `apps/platform/src/lib/actions/posts.ts`, add imports:

```ts
import { getModelSettings } from "../model-settings";
import { buildResearchRoutingPlan } from "../agents/research-router";
import {
  buildModelRoutingManifest,
  researchSourceCount,
} from "../agents/model-routing";
import {
  ProviderConfigurationError,
  invokePerplexityResearch,
  type ResearchSpecialistResult,
} from "../agents/perplexity-research";
```

Extend `processAgentMentionsForPost` input:

```ts
modelRoutingPolicy: {
  mode: "auto" | "ask_first" | "off";
  preferredResearchProviderKey: "anthropic" | "openai" | "google" | "deepseek" | "perplexity";
  allowParallelResearch: boolean;
} | null;
```

Before `routeAgentMentions`, compute specialist results:

```ts
let specialistResearchResults: ResearchSpecialistResult[] = [];
let modelRoutingManifest: Record<string, unknown> | null = null;
try {
  const modelSettings = await getModelSettings(input.actor.instance_id);
  const policy = input.modelRoutingPolicy ?? {
    mode: modelSettings.routingPolicy.mode,
    preferredResearchProviderKey:
      modelSettings.routingPolicy.preferred_research_provider_key,
    allowParallelResearch: modelSettings.routingPolicy.allow_parallel_research,
  };
  const researchPlan = buildResearchRoutingPlan({
    text: input.plainText,
    mode: policy.mode,
    preferredProviderKey: policy.preferredResearchProviderKey,
    allowParallelResearch: policy.allowParallelResearch,
  });
  if (researchPlan.tasks.length > 0) {
    await updatePrecreatedInlineRunsStage(
      input.precreatedInlineRunIds,
      "Researching current sources..."
    );
    specialistResearchResults = await Promise.all(
      researchPlan.tasks.map(async (task) => {
        try {
          return await invokePerplexityResearch({
            model: "sonar-pro",
            question: task.question,
          });
        } catch (error) {
          const message =
            error instanceof ProviderConfigurationError ||
            error instanceof Error
              ? error.message
              : "Research specialist failed.";
          return {
            job: "research",
            providerKey: "perplexity",
            brand: "Perplexity",
            model: "sonar-pro",
            question: task.question,
            summary: "",
            sources: [],
            usage: null,
            status: "failed",
            error: message,
          } satisfies ResearchSpecialistResult;
        }
      })
    );
  }
  modelRoutingManifest = buildModelRoutingManifest({
    primary: {
      provider: "anthropic",
      brand: "Claude",
      model: input.modelSelection?.modelId ?? "claude-sonnet-5",
      job: "synthesis",
    },
    specialists: specialistResearchResults,
    policy: {
      mode: policy.mode,
      confirmationRequired: false,
    },
  });
} catch (error) {
  console.error("[model-routing] specialist routing failed:", error);
}
```

When calling `renderClaudePrompt`, pass:

```ts
specialistResearchResults,
```

When calling `streamInlineClaudeReply`, pass:

```ts
promptManifest: modelRoutingManifest
  ? { model_routing: modelRoutingManifest }
  : undefined,
replyMetadata: modelRoutingManifest
  ? {
      model_routing: modelRoutingManifest,
      research_source_count: researchSourceCount(specialistResearchResults),
    }
  : undefined,
```

Extend `streamInlineClaudeReply` input:

```ts
replyMetadata?: Record<string, unknown>;
```

When `createStreamingAgentReply` is called for the first chunk, pass:

```ts
{ metadata: input.replyMetadata }
```

When `createStreamingAgentReply` is called in the empty-response fallback branch, pass the same metadata:

```ts
{ metadata: input.replyMetadata }
```

When building `finalPromptManifest`, merge `model_routing`:

```ts
const finalPromptManifest = usageReport
  ? {
      ...promptManifest,
      claude_usage: usageReport.usage,
      estimated_cost_usd: usageReport.estimated_cost_usd,
      model: usageReport.model,
      request_id: usageReport.request_id,
    }
  : promptManifest;
```

Keep this existing shape; the new `promptManifest` already carries `model_routing`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd apps/platform && npx --yes tsx src/lib/agents/model-routing.test.ts && npx --yes tsx src/lib/agents/claude-prompt.test.ts && npx --yes tsx src/lib/agents/research-router.test.ts && npx --yes tsx src/lib/agents/perplexity-research.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/platform/src/lib/agents/model-routing.ts apps/platform/src/lib/agents/model-routing.test.ts apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts apps/platform/src/lib/actions/posts.ts apps/platform/src/lib/agents/reply-poster.ts apps/platform/src/lib/agents/router.ts
git commit -m "feat(model-routing): route research into claude replies"
```

---

### Task 8: Visible Research Provenance Chip

**Files:**
- Create: `apps/platform/src/components/research-provenance-chip.tsx`
- Create: `apps/platform/src/components/research-provenance-chip.test.ts`
- Modify: `apps/platform/src/components/post-item.tsx`

- [ ] **Step 1: Write failing provenance chip test**

Create `apps/platform/src/components/research-provenance-chip.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chip = readFileSync(
  new URL("./research-provenance-chip.tsx", import.meta.url),
  "utf8"
);
const postItem = readFileSync(new URL("./post-item.tsx", import.meta.url), "utf8");

assert.match(chip, /Used Research/);
assert.match(chip, /sourceCount/);
assert.match(postItem, /ResearchProvenanceChip/);
assert.match(postItem, /model_routing/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/research-provenance-chip.test.ts
```

Expected: FAIL because the chip does not exist.

- [ ] **Step 3: Add research provenance chip**

Create `apps/platform/src/components/research-provenance-chip.tsx`:

```tsx
import { SearchCheck } from "lucide-react";

export interface ResearchProvenanceChipProps {
  sourceCount: number;
}

export function ResearchProvenanceChip({
  sourceCount,
}: ResearchProvenanceChipProps) {
  if (sourceCount <= 0) return null;

  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-bg-secondary px-2 text-[11px] font-medium text-text-tertiary">
      <SearchCheck className="h-3.5 w-3.5" aria-hidden="true" />
      Used Research - {sourceCount} {sourceCount === 1 ? "source" : "sources"}
    </span>
  );
}
```

- [ ] **Step 4: Render chip in PostItem**

In `apps/platform/src/components/post-item.tsx`, import:

```ts
import { ResearchProvenanceChip } from "./research-provenance-chip";
```

Add helper near existing metadata helpers:

```ts
function researchSourceCountFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): number {
  const direct = metadata?.research_source_count;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return Math.max(0, direct);
  }
  const routing = metadata?.model_routing;
  if (!routing || typeof routing !== "object" || Array.isArray(routing)) return 0;
  const specialists = (routing as Record<string, unknown>).specialists;
  if (!Array.isArray(specialists)) return 0;
  return specialists.reduce((count, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return count;
    const sourceCount = (item as Record<string, unknown>).source_count;
    return count + (typeof sourceCount === "number" ? sourceCount : 0);
  }, 0);
}
```

Inside `PostItem`, after `const absoluteCreatedAt`, add:

```ts
const researchSourceCount = researchSourceCountFromMetadata(post.metadata);
```

After the post body block, render:

```tsx
{researchSourceCount > 0 ? (
  <div className="mt-2">
    <ResearchProvenanceChip sourceCount={researchSourceCount} />
  </div>
) : null}
```

- [ ] **Step 5: Run provenance chip test**

Run:

```bash
cd apps/platform && npx --yes tsx src/components/research-provenance-chip.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/components/research-provenance-chip.tsx apps/platform/src/components/research-provenance-chip.test.ts apps/platform/src/components/post-item.tsx
git commit -m "feat(model-routing): show research provenance on replies"
```

---

### Task 9: Final Verification And Manual Setup Guide

**Files:**
- Modify: `docs/superpowers/plans/2026-07-02-model-routing-v1.md` only if execution reveals a command or setup correction.

- [ ] **Step 1: Run focused TypeScript tests**

Run:

```bash
cd apps/platform && \
npx --yes tsx src/lib/agents/model-catalog.test.ts && \
npx --yes tsx supabase/migrations/model-routing.test.ts && \
npx --yes tsx src/components/model-settings.test.ts && \
npx --yes tsx src/components/model-routing-composer.test.ts && \
npx --yes tsx src/lib/agents/research-router.test.ts && \
npx --yes tsx src/lib/agents/perplexity-research.test.ts && \
npx --yes tsx src/lib/agents/model-routing.test.ts && \
npx --yes tsx src/lib/agents/claude-prompt.test.ts && \
npx --yes tsx src/components/research-provenance-chip.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
cd apps/platform && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run focused lint**

Run:

```bash
cd apps/platform && npx eslint src/lib/agents/model-catalog.ts src/lib/model-settings.ts src/lib/actions/model-settings.ts src/components/model-settings.tsx src/lib/agents/research-router.ts src/lib/agents/perplexity-research.ts src/lib/agents/model-routing.ts src/components/research-provenance-chip.tsx
```

Expected: PASS.

- [ ] **Step 4: Manual API-key setup**

For local testing, set the research specialist key:

1. Open `apps/platform/.env.local`.
2. Add a line named `PERPLEXITY_API_KEY`.
3. Paste the API key value copied from the Perplexity API portal after the equals sign.
4. Save the file.

Restart the dev server after editing `.env.local`.

If testing other provider setup states, also add:

1. `OPENAI_API_KEY` with the key copied from OpenAI Platform.
2. `GEMINI_API_KEY` with the key copied from Google AI Studio.
3. `DEEPSEEK_API_KEY` with the key copied from DeepSeek Platform.

Expected: `/settings/models` shows the matching env var as configured after restart.

- [ ] **Step 5: Apply migration locally**

Run:

```bash
cd apps/platform && npx supabase db reset
```

Expected: local Supabase applies `0031_model_routing.sql` without errors.

If the project is linked to remote Supabase and local reset is not the intended environment, use the existing project migration workflow instead:

```bash
cd apps/platform && npx supabase db push
```

Expected: remote Supabase applies `0031_model_routing.sql` without errors.

- [ ] **Step 6: Browser smoke**

Start dev server:

```bash
cd apps/platform && npm run dev
```

Open:

```text
http://localhost:3000/settings/models
```

Expected:

- Models tab appears in settings.
- Claude, ChatGPT, Gemini, DeepSeek, and Perplexity are listed.
- ChatGPT and Claude setup copy clearly says consumer subscriptions do not include API usage.
- Specialists show Auto and Perplexity as the research provider.

Open any existing thread from the sidebar so the URL is an `/n/` thread route.

Submit:

```text
@Claude I'm updating my financial plan. Please research the latest immigration policy changes that might affect my job timeline, then explain how that should change my cash runway assumptions.
```

Expected:

- Inline stage reaches `Researching current sources...`.
- Claude writes one final answer.
- Reply post shows `Used Research - N sources`.
- `agent_runs.prompt_manifest` includes `model_routing.primary` and `model_routing.specialists`.

- [ ] **Step 7: Commit verification fixes**

If verification required small corrections:

Stage only the exact files edited during verification, then run:

```bash
git commit -m "fix(model-routing): address verification findings"
```

If no corrections were needed, do not create an empty commit.
