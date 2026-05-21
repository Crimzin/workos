# Agent Runtime V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable slice of WorkOS conversational agent runtime: provider-neutral mention routing, durable planning-only coding agent runs, minimal provider/tool settings, and AiDex installation prompting.

**Architecture:** Keep the existing inline `@Claude` chat behavior working while adding a provider-neutral router in front of it. Coding-capable agents create an `agent_run`, post a short interpretation/plan, and wait for user confirmation; this plan does not yet execute Codex or Claude Code in a worker. Settings are intentionally minimal so provider/tool configuration has a home without building a full marketplace.

**Tech Stack:** Next.js 16 App Router, TypeScript strict mode, Supabase migrations, Server Actions, `unstable_cache`, BlockNote post bodies, existing WorkOS design tokens.

---

## Scope

This plan implements the first safe slice of the approved design spec:

- provider-neutral routing instead of hardcoded Claude-only mention handling;
- agent actor capabilities;
- durable `agent_runs`, `agent_run_events`, and `agent_run_artifacts` schema;
- planning-only flow for coding-capable agents;
- simple confirmation detection that marks a run `queued` but does not execute it;
- minimal `/settings/agents` surface for configured providers/tools;
- AiDex unavailable/install prompt behavior as data and copy.

This plan intentionally defers:

- local worker process;
- real Codex or Claude Code CLI execution;
- provider hooks generation;
- full logs viewer;
- PR creation;
- Standards Scout.

## File Structure

Create:

- `apps/platform/supabase/migrations/0021_agent_runtime.sql` — schema for capabilities, runs, events, artifacts, and provider/tool settings.
- `apps/platform/src/lib/agents/types.ts` — provider-neutral runtime types.
- `apps/platform/src/lib/agents/capabilities.ts` — fetch/derive actor capabilities.
- `apps/platform/src/lib/agents/runs.ts` — create/read/update agent runs and events.
- `apps/platform/src/lib/agents/planning.ts` — render planning response for coding-capable agents.
- `apps/platform/src/lib/agents/router.ts` — route mentioned agents to chat or coding-planning flow.
- `apps/platform/src/lib/agents/confirmation.ts` — detect "go/proceed" replies and queue awaiting runs.
- `apps/platform/src/lib/agents/runs.test.ts` — pure tests for run payload construction.
- `apps/platform/src/lib/agents/planning.test.ts` — pure tests for planning copy.
- `apps/platform/src/lib/agents/router.test.ts` — pure tests for routing decisions.
- `apps/platform/src/lib/agents/confirmation.test.ts` — pure tests for confirmation detection.
- `apps/platform/src/lib/agent-settings.ts` — cached reads for settings page.
- `apps/platform/src/lib/actions/agent-settings.ts` — server actions for minimal provider/tool settings.
- `apps/platform/src/components/agent-settings.tsx` — minimal admin UI for providers/tools.
- `apps/platform/src/app/settings/agents/page.tsx` — admin settings route.

Modify:

- `apps/platform/src/lib/types.ts` — add agent runtime, capability, and settings types.
- `apps/platform/src/lib/cache.ts` — add cache tags/revalidators for agent settings and runs.
- `apps/platform/src/lib/actions/posts.ts` — replace Claude-specific mention filter with router call; add confirmation handling after human posts.
- `apps/platform/src/lib/agents/reply-poster.ts` — keep existing posting helpers; reuse them for planning posts.
- `apps/platform/src/lib/agents/claude-prompt.ts` — no required behavior change; keep inline chat path intact.

## Task 1: Schema

**Files:**
- Create: `apps/platform/supabase/migrations/0021_agent_runtime.sql`
- Modify: `apps/platform/src/lib/types.ts`

- [ ] **Step 1: Create the migration**

Create `apps/platform/supabase/migrations/0021_agent_runtime.sql`:

```sql
-- 0021_agent_runtime.sql
-- Provider-neutral agent capabilities, durable planning runs, run events,
-- run artifacts, and minimal provider/tool settings.

create table if not exists agent_actor_capabilities (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references actors(id) on delete cascade,
  capability  text not null,
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(actor_id, capability),
  check (capability in ('chat', 'code', 'shell', 'git', 'browser', 'github', 'database', 'web'))
);

create table if not exists agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  instance_id          uuid not null references instances(id) on delete cascade,
  workspace_id         uuid not null references nodes(id) on delete cascade,
  target_node_id       uuid not null references nodes(id) on delete cascade,
  trigger_post_id      uuid not null references posts(id) on delete cascade,
  requester_actor_id   uuid not null references actors(id) on delete cascade,
  agent_actor_id       uuid not null references actors(id) on delete cascade,
  provider_key         text not null,
  status               text not null default 'planning',
  branch_name          text,
  worktree_path        text,
  summary              text,
  error                text,
  plan_body            text,
  confirmation_post_id uuid references posts(id) on delete set null,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (status in ('mentioned', 'planning', 'awaiting_confirmation', 'queued', 'running', 'needs_input', 'verifying', 'completed', 'failed', 'cancelled'))
);

create table if not exists agent_run_events (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references agent_runs(id) on delete cascade,
  event_type  text not null,
  message     text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists agent_run_artifacts (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references agent_runs(id) on delete cascade,
  artifact_type text not null,
  title         text not null,
  uri           text,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  check (length(trim(title)) > 0)
);

create table if not exists agent_provider_settings (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references instances(id) on delete cascade,
  provider_key text not null,
  label        text not null,
  enabled      boolean not null default false,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(instance_id, provider_key),
  check (provider_key in ('inline_claude', 'codex', 'claude_code')),
  check (length(trim(label)) > 0)
);

create table if not exists agent_tool_settings (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references instances(id) on delete cascade,
  tool_key     text not null,
  label        text not null,
  status       text not null default 'missing',
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(instance_id, tool_key),
  check (tool_key in ('aidex')),
  check (status in ('available', 'missing', 'stale', 'disabled')),
  check (length(trim(label)) > 0)
);

create index if not exists agent_actor_capabilities_actor_idx on agent_actor_capabilities(actor_id);
create index if not exists agent_runs_instance_idx on agent_runs(instance_id);
create index if not exists agent_runs_target_node_idx on agent_runs(target_node_id);
create index if not exists agent_runs_trigger_post_idx on agent_runs(trigger_post_id);
create index if not exists agent_runs_status_idx on agent_runs(status);
create index if not exists agent_run_events_run_idx on agent_run_events(run_id, created_at);
create index if not exists agent_run_artifacts_run_idx on agent_run_artifacts(run_id);
create index if not exists agent_provider_settings_instance_idx on agent_provider_settings(instance_id);
create index if not exists agent_tool_settings_instance_idx on agent_tool_settings(instance_id);

create or replace function set_agent_runtime_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agent_actor_capabilities_updated_at on agent_actor_capabilities;
create trigger trg_agent_actor_capabilities_updated_at
  before update on agent_actor_capabilities
  for each row execute function set_agent_runtime_updated_at();

drop trigger if exists trg_agent_runs_updated_at on agent_runs;
create trigger trg_agent_runs_updated_at
  before update on agent_runs
  for each row execute function set_agent_runtime_updated_at();

drop trigger if exists trg_agent_provider_settings_updated_at on agent_provider_settings;
create trigger trg_agent_provider_settings_updated_at
  before update on agent_provider_settings
  for each row execute function set_agent_runtime_updated_at();

drop trigger if exists trg_agent_tool_settings_updated_at on agent_tool_settings;
create trigger trg_agent_tool_settings_updated_at
  before update on agent_tool_settings
  for each row execute function set_agent_runtime_updated_at();

insert into agent_provider_settings (instance_id, provider_key, label, enabled, config)
select id, 'inline_claude', 'Claude inline replies', true, '{}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into agent_provider_settings (instance_id, provider_key, label, enabled, config)
select id, 'codex', 'Codex', false, '{"requires_confirmation":true}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into agent_provider_settings (instance_id, provider_key, label, enabled, config)
select id, 'claude_code', 'Claude Code', false, '{"requires_confirmation":true}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into agent_tool_settings (instance_id, tool_key, label, status, config)
select id, 'aidex', 'AiDex', 'missing', '{}'::jsonb
from instances
on conflict (instance_id, tool_key) do nothing;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Add TypeScript types**

Modify `apps/platform/src/lib/types.ts`:

```ts
export type AgentType =
  | "claude"
  | "claude_code"
  | "codex"
  | "swarm"
  | "brainshare";

export type AIStandardCategory = "interaction" | "output" | "execution";

export type AgentCapability =
  | "chat"
  | "code"
  | "shell"
  | "git"
  | "browser"
  | "github"
  | "database"
  | "web";

export type AgentRunStatus =
  | "mentioned"
  | "planning"
  | "awaiting_confirmation"
  | "queued"
  | "running"
  | "needs_input"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentProviderKey = "inline_claude" | "codex" | "claude_code";
export type AgentToolKey = "aidex";
export type AgentToolStatus = "available" | "missing" | "stale" | "disabled";

export interface AgentActorCapabilityRecord {
  id: string;
  actor_id: string;
  capability: AgentCapability;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  instance_id: string;
  workspace_id: string;
  target_node_id: string;
  trigger_post_id: string;
  requester_actor_id: string;
  agent_actor_id: string;
  provider_key: AgentProviderKey;
  status: AgentRunStatus;
  branch_name: string | null;
  worktree_path: string | null;
  summary: string | null;
  error: string | null;
  plan_body: string | null;
  confirmation_post_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentProviderSetting {
  id: string;
  instance_id: string;
  provider_key: AgentProviderKey;
  label: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentToolSetting {
  id: string;
  instance_id: string;
  tool_key: AgentToolKey;
  label: string;
  status: AgentToolStatus;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

Keep the existing `Actor`, `AIStandard`, and other interfaces unchanged except for the `AgentType` and `AIStandardCategory` expansions.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: TypeScript may fail if other files exhaustively switch on `AIStandardCategory`. Fix only the necessary compile errors by adding `execution` grouping where required.

- [ ] **Step 4: Commit**

```bash
git add apps/platform/supabase/migrations/0021_agent_runtime.sql apps/platform/src/lib/types.ts
git commit -m "feat(data): add agent runtime schema"
```

## Task 2: Agent Settings Reads And UI

**Files:**
- Create: `apps/platform/src/lib/agent-settings.ts`
- Create: `apps/platform/src/lib/actions/agent-settings.ts`
- Create: `apps/platform/src/components/agent-settings.tsx`
- Create: `apps/platform/src/app/settings/agents/page.tsx`
- Modify: `apps/platform/src/lib/cache.ts`

- [ ] **Step 1: Write cached settings reads**

Create `apps/platform/src/lib/agent-settings.ts`:

```ts
import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { AgentProviderSetting, AgentToolSetting } from "./types";

export interface AgentSettingsBundle {
  providers: AgentProviderSetting[];
  tools: AgentToolSetting[];
}

export async function getAgentSettings(
  instanceId: string
): Promise<AgentSettingsBundle> {
  return unstable_cache(
    async () => {
      const [providersResult, toolsResult] = await Promise.all([
        supabase
          .from("agent_provider_settings")
          .select("id,instance_id,provider_key,label,enabled,config,created_at,updated_at")
          .eq("instance_id", instanceId)
          .order("provider_key", { ascending: true }),
        supabase
          .from("agent_tool_settings")
          .select("id,instance_id,tool_key,label,status,config,created_at,updated_at")
          .eq("instance_id", instanceId)
          .order("tool_key", { ascending: true }),
      ]);

      if (providersResult.error) throw providersResult.error;
      if (toolsResult.error) throw toolsResult.error;

      return {
        providers: (providersResult.data ?? []) as AgentProviderSetting[],
        tools: (toolsResult.data ?? []) as AgentToolSetting[],
      };
    },
    [`agent-settings-${instanceId}`],
    { tags: [cacheTags.agentSettings(instanceId)], revalidate: false }
  )();
}
```

- [ ] **Step 2: Add cache tag**

Modify `apps/platform/src/lib/cache.ts`:

```ts
export const cacheTags = {
  rootNodes: () => "root-nodes",
  node: (id: string) => `node:${id}`,
  children: (parentId: string) => `node-children:${parentId}`,
  workspaceBoard: (workspaceId: string) => `workspace-board:${workspaceId}`,
  instanceFields: (instanceId: string) => `instance-fields:${instanceId}`,
  aiStandards: (instanceId: string) => `ai-standards:${instanceId}`,
  agentSettings: (instanceId: string) => `agent-settings:${instanceId}`,
  agentRuns: (nodeId: string) => `agent-runs:${nodeId}`,
  workspaceViews: (workspaceId: string) => `workspace-views:${workspaceId}`,
  nodePosts: (nodeId: string) => `posts:${nodeId}`,
  workspaceFeed: (workspaceId: string) => `workspace-feed:${workspaceId}`,
  nodeLinks: (nodeId: string) => `links:${nodeId}`,
  nodeMemoryPrimitives: (nodeId: string) => `memory-primitives:${nodeId}`,
};

export function revalidateAgentSettings(instanceId: string) {
  revalidateTag(cacheTags.agentSettings(instanceId), IMMEDIATE);
}

export function revalidateAgentRuns(nodeId: string) {
  revalidateTag(cacheTags.agentRuns(nodeId), IMMEDIATE);
}
```

Preserve all existing cache helpers.

- [ ] **Step 3: Add server actions**

Create `apps/platform/src/lib/actions/agent-settings.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateAgentSettings } from "../cache";
import { supabase } from "../supabase";
import type { AgentProviderKey, AgentToolKey, AgentToolStatus } from "../types";

export async function setAgentProviderEnabled(
  providerKey: AgentProviderKey,
  enabled: boolean
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("agent_provider_settings")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("instance_id", actor.instance_id)
    .eq("provider_key", providerKey);
  if (error) throw error;

  revalidateAgentSettings(actor.instance_id);
  revalidatePath("/settings/agents");
}

export async function setAgentToolStatus(
  toolKey: AgentToolKey,
  status: AgentToolStatus
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("agent_tool_settings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("instance_id", actor.instance_id)
    .eq("tool_key", toolKey);
  if (error) throw error;

  revalidateAgentSettings(actor.instance_id);
  revalidatePath("/settings/agents");
}
```

- [ ] **Step 4: Add settings component**

Create `apps/platform/src/components/agent-settings.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Bot, CheckCircle2, PlugZap, ToggleLeft, ToggleRight } from "lucide-react";
import {
  setAgentProviderEnabled,
  setAgentToolStatus,
} from "@/lib/actions/agent-settings";
import type { AgentProviderSetting, AgentToolSetting } from "@/lib/types";

interface AgentSettingsProps {
  providers: AgentProviderSetting[];
  tools: AgentToolSetting[];
}

export function AgentSettings({ providers, tools }: AgentSettingsProps) {
  const [localProviders, setLocalProviders] = useState(providers);
  const [localTools, setLocalTools] = useState(tools);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleProvider = (provider: AgentProviderSetting) => {
    const enabled = !provider.enabled;
    setLocalProviders((current) =>
      current.map((item) =>
        item.provider_key === provider.provider_key ? { ...item, enabled } : item
      )
    );
    setError(null);
    startTransition(async () => {
      try {
        await setAgentProviderEnabled(provider.provider_key, enabled);
      } catch {
        setError("Could not update that provider.");
        setLocalProviders(providers);
      }
    });
  };

  const markAiDexAvailable = (tool: AgentToolSetting) => {
    setLocalTools((current) =>
      current.map((item) =>
        item.tool_key === tool.tool_key ? { ...item, status: "available" } : item
      )
    );
    setError(null);
    startTransition(async () => {
      try {
        await setAgentToolStatus(tool.tool_key, "available");
      } catch {
        setError("Could not update that tool.");
        setLocalTools(tools);
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-bg-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Agent Connections
          </h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Enable providers and required tools for WorkOS AI teammates.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-secondary">
            {error}
          </div>
        )}
      </div>

      <section className="border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <Bot className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">Providers</h3>
        </div>
        <div className="divide-y divide-border">
          {localProviders.map((provider) => (
            <div
              key={provider.provider_key}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {provider.label}
                </div>
                <div className="text-xs text-text-tertiary">
                  {provider.enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleProvider(provider)}
                disabled={pending}
                className="rounded-md p-1 text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                aria-label={`${provider.enabled ? "Disable" : "Enable"} ${provider.label}`}
              >
                {provider.enabled ? (
                  <ToggleRight className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <ToggleLeft className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 px-4 py-3">
          <PlugZap className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">Tools</h3>
        </div>
        <div className="divide-y divide-border">
          {localTools.map((tool) => (
            <div
              key={tool.tool_key}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {tool.label}
                </div>
                <div className="text-xs text-text-tertiary">
                  Status: {tool.status}
                </div>
              </div>
              <button
                type="button"
                onClick={() => markAiDexAvailable(tool)}
                disabled={pending || tool.status === "available"}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Mark available
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Add settings route**

Create `apps/platform/src/app/settings/agents/page.tsx`:

```tsx
import { AgentSettings } from "@/components/agent-settings";
import { getAgentSettings } from "@/lib/agent-settings";
import { getCurrentActor } from "@/lib/actor";

export default async function AgentsSettingsPage() {
  const actor = await getCurrentActor();
  const settings = await getAgentSettings(actor.instance_id);
  const settingsKey = [
    ...settings.providers.map(
      (provider) => `${provider.provider_key}:${provider.enabled}`
    ),
    ...settings.tools.map((tool) => `${tool.tool_key}:${tool.status}`),
  ].join("|");

  return (
    <main className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header>
          <div className="section-label">Admin</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            Agents
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Connect AI teammates and the tools they need to work inside WorkOS.
          </p>
        </header>

        <AgentSettings
          key={settingsKey}
          providers={settings.providers}
          tools={settings.tools}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/cache.ts apps/platform/src/lib/agent-settings.ts apps/platform/src/lib/actions/agent-settings.ts apps/platform/src/components/agent-settings.tsx apps/platform/src/app/settings/agents/page.tsx
git commit -m "feat(platform): add agent settings"
```

## Task 3: Pure Routing And Planning Logic

**Files:**
- Create: `apps/platform/src/lib/agents/types.ts`
- Create: `apps/platform/src/lib/agents/capabilities.ts`
- Create: `apps/platform/src/lib/agents/planning.ts`
- Create: `apps/platform/src/lib/agents/router.ts`
- Create: `apps/platform/src/lib/agents/planning.test.ts`
- Create: `apps/platform/src/lib/agents/router.test.ts`

- [ ] **Step 1: Add runtime types**

Create `apps/platform/src/lib/agents/types.ts`:

```ts
import type {
  AgentCapability,
  AgentProviderKey,
  AgentRun,
  AgentToolStatus,
} from "../types";
import type { MentionedAgent } from "./mention-detection";
import type { NodeContext } from "./node-context";
import type { PostRecord } from "../posts";

export type AgentRouteKind = "inline_chat" | "coding_plan";

export interface ResolvedAgentRoute {
  mention: MentionedAgent;
  providerKey: AgentProviderKey;
  capabilities: AgentCapability[];
  kind: AgentRouteKind;
}

export interface AgentRoutingInput {
  mentions: MentionedAgent[];
  resolvedRoutes: ResolvedAgentRoute[];
}

export interface AgentPlanningInput {
  agentName: string;
  providerKey: AgentProviderKey;
  nodeContext: NodeContext;
  targetPost: PostRecord;
  aidexStatus: AgentToolStatus;
}

export interface AgentPlanningResult {
  planBody: string;
  status: AgentRun["status"];
  metadata: Record<string, unknown>;
}
```

- [ ] **Step 2: Add capability resolver**

Create `apps/platform/src/lib/agents/capabilities.ts`:

```ts
import { supabase } from "../supabase";
import type { AgentCapability, AgentProviderKey } from "../types";
import type { MentionedAgent } from "./mention-detection";
import type { ResolvedAgentRoute } from "./types";

const CHAT_ONLY: AgentCapability[] = ["chat"];
const CODING: AgentCapability[] = ["chat", "code", "shell", "git"];

function providerFromName(name: string): AgentProviderKey {
  const normalized = name.toLowerCase();
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("claude code")) return "claude_code";
  return "inline_claude";
}

function fallbackCapabilities(providerKey: AgentProviderKey): AgentCapability[] {
  if (providerKey === "codex" || providerKey === "claude_code") return CODING;
  return CHAT_ONLY;
}

export function routeKindForCapabilities(
  capabilities: AgentCapability[]
): ResolvedAgentRoute["kind"] {
  return capabilities.includes("code") ? "coding_plan" : "inline_chat";
}

export async function resolveAgentRoutes(
  mentions: MentionedAgent[]
): Promise<ResolvedAgentRoute[]> {
  if (mentions.length === 0) return [];

  const { data, error } = await supabase
    .from("agent_actor_capabilities")
    .select("actor_id,capability,enabled")
    .in(
      "actor_id",
      mentions.map((mention) => mention.id)
    )
    .eq("enabled", true);
  if (error) throw error;

  const byActor = new Map<string, AgentCapability[]>();
  for (const row of data ?? []) {
    const capability = row.capability as AgentCapability;
    const current = byActor.get(row.actor_id as string) ?? [];
    byActor.set(row.actor_id as string, [...current, capability]);
  }

  return mentions.map((mention) => {
    const providerKey = providerFromName(mention.name);
    const capabilities =
      byActor.get(mention.id) ?? fallbackCapabilities(providerKey);
    return {
      mention,
      providerKey,
      capabilities,
      kind: routeKindForCapabilities(capabilities),
    };
  });
}
```

- [ ] **Step 3: Add planning renderer**

Create `apps/platform/src/lib/agents/planning.ts`:

```ts
import { plainTextFromBody } from "./node-context";
import type { AgentPlanningInput, AgentPlanningResult } from "./types";

const AIDEX_INSTALL_PROMPT =
  "This repo's AiDex index is not available. I can fall back to direct file search, but AiDex is strongly recommended for coding agents because it gives better repo search and session continuity. Want me to install and configure it for this repo?";

export function renderCodingAgentPlan(
  input: AgentPlanningInput
): AgentPlanningResult {
  const targetText = plainTextFromBody(input.targetPost.body ?? "").trim();
  const title = input.nodeContext.node.title;
  const aidexLine =
    input.aidexStatus === "available"
      ? "- I will start by checking repo instructions and AiDex before broad file reads."
      : `- ${AIDEX_INSTALL_PROMPT}`;

  const planBody = [
    `I read this as a coding request on "${title}".`,
    "",
    "My plan:",
    "- Confirm the goal from this thread and the card context.",
    aidexLine,
    "- Inspect the relevant source files before proposing edits.",
    "- Make the smallest safe change in an isolated branch/worktree once execution is enabled.",
    "- Verify with the narrowest meaningful checks before calling it done.",
    "",
    targetText
      ? `I will wait for your "go" before file edits.`
      : `I need one more sentence about the desired outcome before I can plan the work.`,
  ].join("\n");

  return {
    planBody,
    status: "awaiting_confirmation",
    metadata: {
      aidex_status: input.aidexStatus,
      provider_key: input.providerKey,
    },
  };
}
```

- [ ] **Step 4: Add pure planning test**

Create `apps/platform/src/lib/agents/planning.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCodingAgentPlan } from "./planning";
import type { AgentPlanningInput } from "./types";

const baseInput: AgentPlanningInput = {
  agentName: "Codex",
  providerKey: "codex",
  aidexStatus: "available",
  nodeContext: {
    node: {
      id: "node-1",
      instance_id: "inst-1",
      parent_id: null,
      type: "card",
      title: "Fix composer mentions",
      description: null,
      owner_id: null,
      position: 1,
      stack_lifecycle_status: "prioritized",
      archived_at: null,
      created_at: "2026-05-21T00:00:00Z",
      updated_at: "2026-05-21T00:00:00Z",
    },
    workspaceTitle: "WorkOS",
    breadcrumb: "WorkOS / Fix composer mentions",
    owner: null,
    members: [],
    fields: [],
    links: [],
    memory: { rationale: null, assumptions: [], decisions: [] },
    ownThread: [],
    parentThread: null,
    siblingThreads: [],
    childThreads: [],
  },
  targetPost: {
    id: "post-1",
    node_id: "node-1",
    actor_id: "human-1",
    post_type: "post",
    body: JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "Please fix this." }] },
    ]),
    metadata: null,
    pinned: false,
    pinned_at: null,
    created_at: "2026-05-21T00:00:00Z",
    updated_at: "2026-05-21T00:00:00Z",
    actor: { id: "human-1", name: "Will", kind: "human" },
  },
};

test("renderCodingAgentPlan waits for go and mentions AiDex when available", () => {
  const result = renderCodingAgentPlan(baseInput);

  assert.equal(result.status, "awaiting_confirmation");
  assert.match(result.planBody, /I read this as a coding request/);
  assert.match(result.planBody, /wait for your "go"/);
  assert.match(result.planBody, /AiDex/);
});

test("renderCodingAgentPlan strongly recommends AiDex install when missing", () => {
  const result = renderCodingAgentPlan({
    ...baseInput,
    aidexStatus: "missing",
  });

  assert.match(result.planBody, /strongly recommended/);
  assert.match(result.planBody, /install and configure/);
});
```

- [ ] **Step 5: Add routing tests**

Create `apps/platform/src/lib/agents/router.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeKindForCapabilities } from "./capabilities";

test("routeKindForCapabilities routes code-capable agents to planning", () => {
  assert.equal(routeKindForCapabilities(["chat", "code"]), "coding_plan");
});

test("routeKindForCapabilities keeps chat-only agents inline", () => {
  assert.equal(routeKindForCapabilities(["chat"]), "inline_chat");
});
```

- [ ] **Step 6: Run pure tests**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: TypeScript passes and includes the new focused test files.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/agents/types.ts apps/platform/src/lib/agents/capabilities.ts apps/platform/src/lib/agents/planning.ts apps/platform/src/lib/agents/planning.test.ts apps/platform/src/lib/agents/router.test.ts
git commit -m "feat(platform): add agent routing primitives"
```

## Task 4: Durable Runs And Confirmation

**Files:**
- Create: `apps/platform/src/lib/agents/runs.ts`
- Create: `apps/platform/src/lib/agents/confirmation.ts`
- Create: `apps/platform/src/lib/agents/runs.test.ts`
- Create: `apps/platform/src/lib/agents/confirmation.test.ts`

- [ ] **Step 1: Add confirmation detection**

Create `apps/platform/src/lib/agents/confirmation.ts`:

```ts
const CONFIRMATION_PATTERNS = [
  /^go[.!]?$/i,
  /^yes[.!]?$/i,
  /^yep[.!]?$/i,
  /^do it[.!]?$/i,
  /^proceed[.!]?$/i,
  /^start[.!]?$/i,
];

export function isAgentRunConfirmation(text: string): boolean {
  const normalized = text.trim();
  return CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalized));
}
```

- [ ] **Step 2: Add confirmation tests**

Create `apps/platform/src/lib/agents/confirmation.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAgentRunConfirmation } from "./confirmation";

test("isAgentRunConfirmation accepts concise go replies", () => {
  assert.equal(isAgentRunConfirmation("go"), true);
  assert.equal(isAgentRunConfirmation("Proceed."), true);
  assert.equal(isAgentRunConfirmation("do it"), true);
});

test("isAgentRunConfirmation rejects ambiguous replies", () => {
  assert.equal(isAgentRunConfirmation("what would you do?"), false);
  assert.equal(isAgentRunConfirmation("not yet"), false);
  assert.equal(isAgentRunConfirmation("go look at the settings later"), false);
});
```

- [ ] **Step 3: Add run persistence helpers**

Create `apps/platform/src/lib/agents/runs.ts`:

```ts
import { revalidatePath } from "next/cache";
import { revalidateAgentRuns, revalidateNodePosts, revalidateWorkspaceFeed } from "../cache";
import { supabase } from "../supabase";
import type { AgentProviderKey, AgentRun, AgentRunStatus } from "../types";

export interface CreateAgentRunInput {
  instanceId: string;
  workspaceId: string;
  targetNodeId: string;
  triggerPostId: string;
  requesterActorId: string;
  agentActorId: string;
  providerKey: AgentProviderKey;
  planBody: string;
  metadata: Record<string, unknown>;
}

export function buildAgentRunInsert(input: CreateAgentRunInput) {
  return {
    instance_id: input.instanceId,
    workspace_id: input.workspaceId,
    target_node_id: input.targetNodeId,
    trigger_post_id: input.triggerPostId,
    requester_actor_id: input.requesterActorId,
    agent_actor_id: input.agentActorId,
    provider_key: input.providerKey,
    status: "awaiting_confirmation" satisfies AgentRunStatus,
    plan_body: input.planBody,
    metadata: input.metadata,
  };
}

export async function createPlanningAgentRun(
  input: CreateAgentRunInput
): Promise<AgentRun> {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert(buildAgentRunInsert(input))
    .select("*")
    .single();
  if (error) throw error;

  await appendAgentRunEvent(data.id as string, "plan_posted", input.planBody, {
    provider_key: input.providerKey,
  });

  revalidateAgentRuns(input.targetNodeId);
  revalidatePath(`/n/${input.workspaceId}`);

  return data as AgentRun;
}

export async function appendAgentRunEvent(
  runId: string,
  eventType: string,
  message: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.from("agent_run_events").insert({
    run_id: runId,
    event_type: eventType,
    message,
    payload,
  });
  if (error) throw error;
}

export async function queueAwaitingRunsForConfirmation(input: {
  nodeId: string;
  workspaceId: string;
  requesterActorId: string;
  confirmationPostId: string;
}): Promise<number> {
  const { data: runs, error: readError } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("target_node_id", input.nodeId)
    .eq("requester_actor_id", input.requesterActorId)
    .eq("status", "awaiting_confirmation")
    .order("created_at", { ascending: false })
    .limit(1);
  if (readError) throw readError;
  if (!runs || runs.length === 0) return 0;

  const runId = runs[0].id as string;
  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: "queued",
      confirmation_post_id: input.confirmationPostId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (updateError) throw updateError;

  await appendAgentRunEvent(runId, "confirmed", "User confirmed the run.", {
    confirmation_post_id: input.confirmationPostId,
  });

  revalidateAgentRuns(input.nodeId);
  revalidateNodePosts(input.nodeId);
  revalidateWorkspaceFeed(input.workspaceId);
  revalidatePath(`/n/${input.workspaceId}`);

  return 1;
}
```

- [ ] **Step 4: Add run helper test**

Create `apps/platform/src/lib/agents/runs.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgentRunInsert } from "./runs";

test("buildAgentRunInsert creates an awaiting confirmation run", () => {
  const insert = buildAgentRunInsert({
    instanceId: "inst-1",
    workspaceId: "workspace-1",
    targetNodeId: "node-1",
    triggerPostId: "post-1",
    requesterActorId: "human-1",
    agentActorId: "agent-1",
    providerKey: "codex",
    planBody: "I read this as a coding task.",
    metadata: { aidex_status: "missing" },
  });

  assert.equal(insert.status, "awaiting_confirmation");
  assert.equal(insert.provider_key, "codex");
  assert.equal(insert.metadata.aidex_status, "missing");
});
```

- [ ] **Step 5: Run pure tests**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/agents/runs.ts apps/platform/src/lib/agents/confirmation.ts apps/platform/src/lib/agents/runs.test.ts apps/platform/src/lib/agents/confirmation.test.ts
git commit -m "feat(platform): add agent run planning state"
```

## Task 5: Router Integration With Posts

**Files:**
- Create: `apps/platform/src/lib/agents/router.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`

- [ ] **Step 1: Add router orchestration**

Create `apps/platform/src/lib/agents/router.ts`:

```ts
import { getAgentSettings } from "../agent-settings";
import type { CurrentActor } from "../actor";
import type { PostRecord } from "../posts";
import { createStreamingAgentReply } from "./reply-poster";
import { gatherNodeContext, type NodeContext } from "./node-context";
import { renderCodingAgentPlan } from "./planning";
import { resolveAgentRoutes } from "./capabilities";
import { createPlanningAgentRun } from "./runs";
import type { MentionedAgent } from "./mention-detection";
import type { ClaudePrompt } from "./claude-prompt";

export interface RouteAgentMentionsInput {
  mentions: MentionedAgent[];
  actor: CurrentActor;
  nodeId: string;
  workspaceId: string;
  targetPost: PostRecord;
  renderClaudePromptForContext: (ctx: NodeContext) => ClaudePrompt;
  scheduleInlineClaude: (agent: MentionedAgent, prompt: ClaudePrompt) => void;
}

export async function routeAgentMentions(
  input: RouteAgentMentionsInput
): Promise<void> {
  const routes = await resolveAgentRoutes(input.mentions);
  if (routes.length === 0) return;

  const nodeContext = await gatherNodeContext(input.nodeId);
  if (!nodeContext) return;

  const settings = await getAgentSettings(input.actor.instance_id);
  const aidexStatus =
    settings.tools.find((tool) => tool.tool_key === "aidex")?.status ?? "missing";

  for (const route of routes) {
    if (route.kind === "inline_chat") {
      input.scheduleInlineClaude(
        route.mention,
        input.renderClaudePromptForContext(nodeContext)
      );
      continue;
    }

    const plan = renderCodingAgentPlan({
      agentName: route.mention.name,
      providerKey: route.providerKey,
      nodeContext,
      targetPost: input.targetPost,
      aidexStatus,
    });

    await createPlanningAgentRun({
      instanceId: input.actor.instance_id,
      workspaceId: input.workspaceId,
      targetNodeId: input.nodeId,
      triggerPostId: input.targetPost.id,
      requesterActorId: input.actor.id,
      agentActorId: route.mention.id,
      providerKey: route.providerKey,
      planBody: plan.planBody,
      metadata: plan.metadata,
    });

    await createStreamingAgentReply(
      input.nodeId,
      input.workspaceId,
      route.mention.id,
      plan.planBody
    );
  }
}
```

- [ ] **Step 2: Replace hardcoded Claude filter in `createPost`**

Modify `apps/platform/src/lib/actions/posts.ts`:

```ts
import { findAgentMentions } from "../agents/mention-detection";
import { routeAgentMentions } from "../agents/router";
import { isAgentRunConfirmation } from "../agents/confirmation";
import { queueAwaitingRunsForConfirmation } from "../agents/runs";
```

Inside `createPost`, after revalidation and mention detection:

```ts
if (isAgentRunConfirmation(plainTextFromBody(trimmed))) {
  try {
    const queued = await queueAwaitingRunsForConfirmation({
      nodeId,
      workspaceId,
      requesterActorId: actor.id,
      confirmationPostId: targetPost.id,
    });
    if (queued > 0) return;
  } catch (err) {
    console.error("[agent-runtime] confirmation failed:", err);
  }
}
```

Then replace the Claude-only `filterClaudeAgents` block with:

```ts
if (mentions.length === 0) return;

await routeAgentMentions({
  mentions,
  actor,
  nodeId,
  workspaceId,
  targetPost,
  renderClaudePromptForContext: (ctx) =>
    renderClaudePrompt(ensureTargetPostInOwnThread(ctx, targetPost), {
      targetPostId: targetPost.id,
    }),
  scheduleInlineClaude: (agent, ctxPrompt) => {
    after(async () => {
      await streamInlineClaudeReply({
        agent,
        nodeId,
        workspaceId,
        ctxPrompt,
      });
    });
  },
});
```

Extract the current streaming body from the existing `after(async () => { ... })` block into a local helper in the same file:

```ts
async function streamInlineClaudeReply(input: {
  agent: MentionedAgent;
  nodeId: string;
  workspaceId: string;
  ctxPrompt: ReturnType<typeof renderClaudePrompt>;
}): Promise<void> {
  // Move the existing streamClaude/createStreamingAgentReply/updateStreamingAgentReply
  // code here unchanged, replacing closed-over variables with input.*.
}
```

Delete `filterClaudeAgents` only after the inline Claude path still works through `resolveAgentRoutes`.

- [ ] **Step 3: Add missing import**

Add `plainTextFromBody` to the existing node-context import:

```ts
import {
  gatherNodeContext,
  plainTextFromBody,
  type NodeContext,
} from "../agents/node-context";
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 5: Run agent tests**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/actions/posts.ts apps/platform/src/lib/agents/router.ts
git commit -m "feat(platform): route agent mentions"
```

## Task 6: Final Verification

**Files:**
- Verify all files touched by Tasks 1-5.

- [ ] **Step 1: Run TypeScript**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm --prefix apps/platform run build
```

Expected: PASS. If Google Fonts/network causes a transient failure, retry once and record the exact failure if it persists.

- [ ] **Step 4: Manual smoke test**

Run the dev server:

```bash
npm --prefix apps/platform run dev
```

Expected: server starts on the default available port.

In the browser:

1. Open `/settings/agents`.
2. Confirm provider rows render.
3. Confirm AiDex row renders as missing or available.
4. Mention `@Claude` in an existing card thread and confirm inline reply still works.
5. Mention a Codex-like agent actor if seeded; confirm it posts a plan and waits for `go`.
6. Reply `go`; confirm the latest awaiting run becomes `queued` in Supabase.

- [ ] **Step 5: Commit any smoke-test fixes**

```bash
git status --short
git add <only-files-changed-for-this-plan>
git commit -m "fix(platform): finalize agent runtime v0"
```

Only run this commit if the smoke test required code changes.

## Self-Review Notes

Spec coverage:

- Conversational, provider-neutral routing: Tasks 3 and 5.
- Durable runs/events/artifacts: Tasks 1 and 4.
- Planning gate before edits: Tasks 3, 4, and 5.
- AiDex unavailable install prompt: Task 3.
- Minimal admin settings: Task 2.
- Context budgeting, run-scoped approvals, provider hooks, real worker execution: intentionally deferred to follow-up implementation plans after this v0 slice.

No incomplete markers are intentionally left in implementation steps. Deferred work is listed explicitly in Scope and Self-Review Notes.
