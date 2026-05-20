# BrainShare Inborn AI Standards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build editable BrainShare universal AI standards in WorkOS and wire them into current `@Claude` replies.

**Architecture:** Ship canonical inborn standards as code defaults, store instance-level overrides/custom standards in Supabase, merge them at runtime, and render the effective standards into Claude's system prompt. Add a quiet admin settings page at `/settings/ai-standards` so standards can be tuned without code changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Server Components, Server Actions, Supabase/Postgres migrations, Tailwind v4 design tokens.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/platform/src/lib/ai-standards.ts` | Types, default standards, Supabase read, merge logic, render helper |
| `apps/platform/src/lib/ai-standards.test.ts` | Pure tests for defaults, merge behavior, and prompt rendering |
| `apps/platform/src/lib/ai-standards-validation.ts` | Pure validation/normalization used by server actions |
| `apps/platform/src/lib/ai-standards-validation.test.ts` | Pure tests for action input validation |
| `apps/platform/src/lib/actions/ai-standards.ts` | Server actions for save, reset, create, and delete |
| `apps/platform/src/lib/cache.ts` | Cache tag and revalidation helper for AI standards |
| `apps/platform/src/lib/types.ts` | `AIStandard` types |
| `apps/platform/src/lib/agents/claude-prompt.ts` | Accept effective standards and render them into system prompt |
| `apps/platform/src/lib/agents/claude-prompt.test.ts` | Extend existing prompt tests for standards rendering |
| `apps/platform/src/lib/actions/posts.ts` | Load effective standards during agent invocation |
| `apps/platform/src/app/settings/ai-standards/page.tsx` | Admin settings route |
| `apps/platform/src/components/ai-standards-settings.tsx` | Editable standards table/detail UI |
| `apps/platform/src/components/sidebar.tsx` | Settings navigation link |
| `apps/platform/supabase/migrations/0020_ai_standards.sql` | Instance override/custom standards table |

---

## Task 1: Default Standards Module

**Files:**
- Create: `apps/platform/src/lib/ai-standards.ts`
- Create: `apps/platform/src/lib/ai-standards.test.ts`

- [ ] **Step 1: Write failing tests for defaults, merge, and rendering**

Create `apps/platform/src/lib/ai-standards.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  DEFAULT_AI_STANDARDS,
  mergeAIStandards,
  renderAIStandardsForPrompt,
} from "./ai-standards";
import type { AIStandardOverrideRow } from "./ai-standards";

assert.ok(
  DEFAULT_AI_STANDARDS.some(
    (s) => s.standard_key === "standard.ai_interaction.goal_first"
  )
);
assert.ok(
  DEFAULT_AI_STANDARDS.some(
    (s) => s.standard_key === "standard.output.pyramid_principle"
  )
);

const overrideRows: AIStandardOverrideRow[] = [
  {
    standard_key: "standard.output.pyramid_principle",
    category: "output",
    title: "Lead With The Answer",
    instruction: "Lead with the answer before supporting details.",
    mode: "visible_when_useful",
    enabled: true,
    position: 99,
    source: "override",
  },
  {
    standard_key: "standard.output.mece_structure",
    category: "output",
    title: "MECE structure",
    instruction: "Disabled override should remove this default.",
    mode: "visible_when_useful",
    enabled: false,
    position: 20,
    source: "override",
  },
  {
    standard_key: "standard.custom.exec_memo",
    category: "output",
    title: "Executive memo style",
    instruction: "Use crisp executive memo structure for leadership updates.",
    mode: "visible_when_useful",
    enabled: true,
    position: 200,
    source: "custom",
  },
];

const merged = mergeAIStandards(DEFAULT_AI_STANDARDS, overrideRows);

assert.equal(
  merged.find((s) => s.standard_key === "standard.output.pyramid_principle")
    ?.title,
  "Lead With The Answer"
);
assert.equal(
  merged.some((s) => s.standard_key === "standard.output.mece_structure"),
  false
);
assert.ok(merged.some((s) => s.standard_key === "standard.custom.exec_memo"));

const rendered = renderAIStandardsForPrompt(merged);
assert.match(rendered, /# BrainShare Inborn AI Standards/);
assert.match(rendered, /## Interaction/);
assert.match(rendered, /## Output/);
assert.match(rendered, /Lead With The Answer/);
assert.doesNotMatch(rendered, /Disabled override/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx tsc --module commonjs --target es2022 --esModuleInterop --skipLibCheck --outDir /tmp/workos-ai-standards-tests apps/platform/src/lib/ai-standards.test.ts
```

Expected: FAIL because `apps/platform/src/lib/ai-standards.ts` does not exist.

- [ ] **Step 3: Implement default standards, merge, and prompt rendering**

Create `apps/platform/src/lib/ai-standards.ts`:

```ts
import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";

export type AIStandardCategory = "interaction" | "output";
export type AIStandardMode = "latent" | "visible_when_useful";
export type AIStandardSource = "default" | "override" | "custom";

export interface AIStandardDefinition {
  standard_key: string;
  category: AIStandardCategory;
  title: string;
  instruction: string;
  mode: AIStandardMode;
  enabled: boolean;
  position: number;
  source: AIStandardSource;
}

export type AIStandardOverrideRow = Omit<AIStandardDefinition, "source"> & {
  source: "override" | "custom";
};

export const DEFAULT_AI_STANDARDS: AIStandardDefinition[] = [
  {
    standard_key: "standard.ai_interaction.goal_first",
    category: "interaction",
    title: "Goal-first collaboration",
    instruction:
      "Optimize for the user's real outcome, not merely the literal task. Infer the goal when safe; ask when the missing goal would materially change the work.",
    mode: "latent",
    enabled: true,
    position: 10,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.interview_when_useful",
    category: "interaction",
    title: "Interview when useful",
    instruction:
      "Ask focused questions when missing context would change the answer. Avoid unnecessary questioning when a reasonable assumption is safe.",
    mode: "latent",
    enabled: true,
    position: 20,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.primary_sources",
    category: "interaction",
    title: "Prefer primary sources",
    instruction:
      "Prefer raw material over summaries. When working from secondhand summaries, name that limitation.",
    mode: "latent",
    enabled: true,
    position: 30,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.independent_judgment",
    category: "interaction",
    title: "Independent judgment",
    instruction:
      "Do not launder the user's hypothesis as truth. Separate evidence, inference, speculation, and open questions.",
    mode: "latent",
    enabled: true,
    position: 40,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.role_clarity",
    category: "interaction",
    title: "Use the right expert lens",
    instruction:
      "Adopt the relevant expert role for the work. Name the lens when it helps the user understand the reasoning.",
    mode: "latent",
    enabled: true,
    position: 50,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.workflow_architecture",
    category: "interaction",
    title: "Architect workflows",
    instruction:
      "For recurring work, create reusable processes, templates, checklists, or standards rather than one-off answers.",
    mode: "visible_when_useful",
    enabled: true,
    position: 60,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.constructive_critique",
    category: "interaction",
    title: "Constructive critique",
    instruction:
      "Challenge weak reasoning, missing assumptions, and premature conclusions in service of the user's goal.",
    mode: "latent",
    enabled: true,
    position: 70,
    source: "default",
  },
  {
    standard_key: "standard.ai_interaction.iterative_quality",
    category: "interaction",
    title: "Iterative quality",
    instruction:
      "Treat the first answer as a starting point when refinement would materially improve the result.",
    mode: "latent",
    enabled: true,
    position: 80,
    source: "default",
  },
  {
    standard_key: "standard.output.pyramid_principle",
    category: "output",
    title: "Pyramid principle",
    instruction:
      "Lead with the answer, recommendation, or thesis, then give the supporting logic.",
    mode: "visible_when_useful",
    enabled: true,
    position: 110,
    source: "default",
  },
  {
    standard_key: "standard.output.mece_structure",
    category: "output",
    title: "MECE structure",
    instruction:
      "Break complex analysis into clean dimensions that avoid overlap and cover the important space.",
    mode: "visible_when_useful",
    enabled: true,
    position: 120,
    source: "default",
  },
  {
    standard_key: "standard.output.dimensional_frameworks",
    category: "output",
    title: "Dimensional frameworks",
    instruction:
      "Use helpful axes such as leverage, maturity, risk, evidence, owner, timeline, dependency, and opportunity.",
    mode: "visible_when_useful",
    enabled: true,
    position: 130,
    source: "default",
  },
  {
    standard_key: "standard.output.tables_for_scanability",
    category: "output",
    title: "Tables for scanability",
    instruction:
      "Use tables when they make comparison, prioritization, or synthesis easier to scan.",
    mode: "visible_when_useful",
    enabled: true,
    position: 140,
    source: "default",
  },
  {
    standard_key: "standard.output.so_what_synthesis",
    category: "output",
    title: "So-what synthesis",
    instruction:
      "Translate facts into implications, risks, recommendations, and next moves.",
    mode: "visible_when_useful",
    enabled: true,
    position: 150,
    source: "default",
  },
  {
    standard_key: "standard.output.adaptive_presentation",
    category: "output",
    title: "Adaptive presentation",
    instruction:
      "Apply the standards quietly for simple, emotional, operational, or creative requests; use visible structure for analysis, research, strategy, planning, decisions, and critique.",
    mode: "latent",
    enabled: true,
    position: 160,
    source: "default",
  },
];

export function mergeAIStandards(
  defaults: AIStandardDefinition[],
  overrides: AIStandardOverrideRow[]
): AIStandardDefinition[] {
  const byKey = new Map<string, AIStandardDefinition>();
  for (const standard of defaults) {
    if (standard.enabled) byKey.set(standard.standard_key, standard);
  }
  for (const override of overrides) {
    if (!override.enabled) {
      byKey.delete(override.standard_key);
      continue;
    }
    byKey.set(override.standard_key, { ...override });
  }
  return [...byKey.values()].sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title)
  );
}

export function renderAIStandardsForPrompt(
  standards: AIStandardDefinition[]
): string {
  const interaction = standards.filter((s) => s.category === "interaction");
  const output = standards.filter((s) => s.category === "output");
  const renderRows = (rows: AIStandardDefinition[]) =>
    rows.map((s) => `- ${s.title}: ${s.instruction}`).join("\n");

  return [
    "# BrainShare Inborn AI Standards",
    "These are universal WorkOS standards for AI teammates. Apply them quietly to almost every request. Use visible structure when it improves comprehension.",
    "",
    "## Interaction",
    renderRows(interaction),
    "",
    "## Output",
    renderRows(output),
  ].join("\n");
}

export async function getEffectiveAIStandards(
  instanceId: string
): Promise<AIStandardDefinition[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("ai_standards")
        .select(
          "standard_key,category,title,instruction,mode,enabled,position,source"
        )
        .eq("instance_id", instanceId)
        .order("position", { ascending: true });
      if (error) throw error;
      return mergeAIStandards(
        DEFAULT_AI_STANDARDS,
        (data ?? []) as AIStandardOverrideRow[]
      );
    },
    [`ai-standards-instance-${instanceId}`],
    { tags: [cacheTags.aiStandards(instanceId)], revalidate: false }
  )();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx tsc --module commonjs --target es2022 --esModuleInterop --skipLibCheck --outDir /tmp/workos-ai-standards-tests apps/platform/src/lib/ai-standards.test.ts
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NODE_PATH="$PWD/node_modules:$PWD/apps/platform/node_modules" node /tmp/workos-ai-standards-tests/lib/ai-standards.test.js
```

Expected: compile exits 0 and node exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/ai-standards.ts apps/platform/src/lib/ai-standards.test.ts
git commit -m "feat(platform): add default ai standards"
```

---

## Task 2: Database, Types, and Cache Tags

**Files:**
- Create: `apps/platform/supabase/migrations/0020_ai_standards.sql`
- Modify: `apps/platform/src/lib/types.ts`
- Modify: `apps/platform/src/lib/cache.ts`
- Modify: `apps/platform/src/lib/ai-standards.ts`

- [ ] **Step 1: Add migration**

Create `apps/platform/supabase/migrations/0020_ai_standards.sql`:

```sql
-- 0020_ai_standards.sql
-- Instance-level overrides and custom standards for BrainShare inborn AI
-- interaction/output defaults. Code owns defaults; this table stores edits.

create table if not exists ai_standards (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references instances(id) on delete cascade,
  standard_key  text not null,
  category      text not null,
  title         text not null,
  instruction   text not null,
  mode          text not null default 'latent',
  enabled       boolean not null default true,
  position      numeric not null default 0,
  source        text not null default 'override',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(instance_id, standard_key),
  check (category in ('interaction', 'output')),
  check (mode in ('latent', 'visible_when_useful')),
  check (source in ('override', 'custom')),
  check (length(trim(title)) > 0),
  check (length(trim(instruction)) > 0),
  check (length(trim(standard_key)) > 0)
);

create index if not exists ai_standards_instance_idx on ai_standards(instance_id);
create index if not exists ai_standards_category_idx on ai_standards(category);
create index if not exists ai_standards_position_idx on ai_standards(instance_id, position);

create or replace function set_ai_standards_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ai_standards_updated_at on ai_standards;
create trigger trg_ai_standards_updated_at
  before update on ai_standards
  for each row execute function set_ai_standards_updated_at();

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Add shared types**

Modify `apps/platform/src/lib/types.ts` by appending:

```ts
export type AIStandardCategory = "interaction" | "output";
export type AIStandardMode = "latent" | "visible_when_useful";
export type AIStandardSource = "default" | "override" | "custom";

export interface AIStandard {
  id?: string;
  instance_id?: string;
  standard_key: string;
  category: AIStandardCategory;
  title: string;
  instruction: string;
  mode: AIStandardMode;
  enabled: boolean;
  position: number;
  source: AIStandardSource;
  created_at?: string;
  updated_at?: string;
}
```

- [ ] **Step 3: Reuse shared types in `ai-standards.ts`**

Modify `apps/platform/src/lib/ai-standards.ts` imports and type definitions:

```ts
import { unstable_cache } from "next/cache";
import { cacheTags } from "./cache";
import { supabase } from "./supabase";
import type { AIStandard } from "./types";

export type AIStandardDefinition = AIStandard;
export type AIStandardOverrideRow = Omit<AIStandard, "id" | "instance_id" | "created_at" | "updated_at"> & {
  source: "override" | "custom";
};
```

Remove the local `AIStandardCategory`, `AIStandardMode`, `AIStandardSource`, and `AIStandardDefinition` interface declarations from `ai-standards.ts`.

- [ ] **Step 4: Add cache helpers**

Modify `apps/platform/src/lib/cache.ts`:

```ts
export const cacheTags = {
  rootNodes: () => "root-nodes",
  node: (id: string) => `node:${id}`,
  children: (parentId: string) => `node-children:${parentId}`,
  workspaceBoard: (workspaceId: string) => `workspace-board:${workspaceId}`,
  instanceFields: (instanceId: string) => `instance-fields:${instanceId}`,
  aiStandards: (instanceId: string) => `ai-standards:${instanceId}`,
  workspaceViews: (workspaceId: string) => `workspace-views:${workspaceId}`,
  nodePosts: (nodeId: string) => `posts:${nodeId}`,
  workspaceFeed: (workspaceId: string) => `workspace-feed:${workspaceId}`,
  nodeLinks: (nodeId: string) => `links:${nodeId}`,
  nodeMemoryPrimitives: (nodeId: string) => `memory-primitives:${nodeId}`,
};
```

Add below `revalidateInstanceFields`:

```ts
export function revalidateAIStandards(instanceId: string) {
  revalidateTag(cacheTags.aiStandards(instanceId), PROFILE);
}
```

- [ ] **Step 5: Typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/supabase/migrations/0020_ai_standards.sql apps/platform/src/lib/types.ts apps/platform/src/lib/cache.ts apps/platform/src/lib/ai-standards.ts
git commit -m "feat(platform): persist ai standard overrides"
```

---

## Task 3: Validation and Server Actions

**Files:**
- Create: `apps/platform/src/lib/ai-standards-validation.ts`
- Create: `apps/platform/src/lib/ai-standards-validation.test.ts`
- Create: `apps/platform/src/lib/actions/ai-standards.ts`

- [ ] **Step 1: Write failing validation tests**

Create `apps/platform/src/lib/ai-standards-validation.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  normalizeAIStandardInput,
  standardKeyFromTitle,
} from "./ai-standards-validation";

const normalized = normalizeAIStandardInput({
  standardKey: "standard.output.pyramid_principle",
  category: "output",
  title: "  Pyramid principle  ",
  instruction: "  Lead with the answer.  ",
  mode: "visible_when_useful",
  enabled: true,
  position: 10,
  source: "override",
});

assert.equal(normalized.standard_key, "standard.output.pyramid_principle");
assert.equal(normalized.title, "Pyramid principle");
assert.equal(normalized.instruction, "Lead with the answer.");

assert.throws(
  () =>
    normalizeAIStandardInput({
      standardKey: "standard.output.empty",
      category: "output",
      title: "",
      instruction: "Use structure.",
      mode: "latent",
      enabled: true,
      position: 1,
      source: "override",
    }),
  /title_required/
);

assert.throws(
  () =>
    normalizeAIStandardInput({
      standardKey: "standard.output.empty",
      category: "output",
      title: "Empty instruction",
      instruction: "",
      mode: "latent",
      enabled: true,
      position: 1,
      source: "override",
    }),
  /instruction_required/
);

assert.equal(
  standardKeyFromTitle("Executive Memo Style"),
  "standard.custom.executive_memo_style"
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx tsc --module commonjs --target es2022 --esModuleInterop --skipLibCheck --outDir /tmp/workos-ai-standards-tests apps/platform/src/lib/ai-standards-validation.test.ts
```

Expected: FAIL because `ai-standards-validation.ts` does not exist.

- [ ] **Step 3: Implement validation helper**

Create `apps/platform/src/lib/ai-standards-validation.ts`:

```ts
import type {
  AIStandardCategory,
  AIStandardMode,
  AIStandardSource,
} from "./types";

export interface AIStandardInput {
  standardKey: string;
  category: AIStandardCategory;
  title: string;
  instruction: string;
  mode: AIStandardMode;
  enabled: boolean;
  position: number;
  source: Exclude<AIStandardSource, "default">;
}

export interface NormalizedAIStandardInput {
  standard_key: string;
  category: AIStandardCategory;
  title: string;
  instruction: string;
  mode: AIStandardMode;
  enabled: boolean;
  position: number;
  source: "override" | "custom";
}

export function normalizeAIStandardInput(
  input: AIStandardInput
): NormalizedAIStandardInput {
  const standardKey = input.standardKey.trim();
  const title = input.title.trim();
  const instruction = input.instruction.trim();

  if (!standardKey) throw new Error("standard_key_required");
  if (!title) throw new Error("title_required");
  if (!instruction) throw new Error("instruction_required");
  if (!["interaction", "output"].includes(input.category)) {
    throw new Error("invalid_category");
  }
  if (!["latent", "visible_when_useful"].includes(input.mode)) {
    throw new Error("invalid_mode");
  }
  if (!["override", "custom"].includes(input.source)) {
    throw new Error("invalid_source");
  }

  return {
    standard_key: standardKey,
    category: input.category,
    title,
    instruction,
    mode: input.mode,
    enabled: input.enabled,
    position: Number.isFinite(input.position) ? input.position : 0,
    source: input.source,
  };
}

export function standardKeyFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) throw new Error("title_required");
  return `standard.custom.${slug}`;
}
```

- [ ] **Step 4: Implement server actions**

Create `apps/platform/src/lib/actions/ai-standards.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateAIStandards } from "../cache";
import { DEFAULT_AI_STANDARDS } from "../ai-standards";
import {
  normalizeAIStandardInput,
  standardKeyFromTitle,
  type AIStandardInput,
} from "../ai-standards-validation";
import { supabase } from "../supabase";

export async function saveAIStandardOverride(
  input: AIStandardInput
): Promise<void> {
  const actor = await getCurrentActor();
  const payload = normalizeAIStandardInput(input);

  const { error } = await supabase.from("ai_standards").upsert(
    {
      instance_id: actor.instance_id,
      ...payload,
    },
    { onConflict: "instance_id,standard_key" }
  );
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");
}

export async function createCustomAIStandard(input: {
  category: AIStandardInput["category"];
  title: string;
  instruction: string;
  mode: AIStandardInput["mode"];
  position?: number;
}): Promise<void> {
  const standardKey = standardKeyFromTitle(input.title);
  await saveAIStandardOverride({
    standardKey,
    category: input.category,
    title: input.title,
    instruction: input.instruction,
    mode: input.mode,
    enabled: true,
    position: input.position ?? 1000,
    source: "custom",
  });
}

export async function resetAIStandardOverride(
  standardKey: string
): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("ai_standards")
    .delete()
    .eq("instance_id", actor.instance_id)
    .eq("standard_key", standardKey);
  if (error) throw error;

  revalidateAIStandards(actor.instance_id);
  revalidatePath("/settings/ai-standards");
}

export async function disableDefaultAIStandard(
  standardKey: string
): Promise<void> {
  const defaultStandard = DEFAULT_AI_STANDARDS.find(
    (standard) => standard.standard_key === standardKey
  );
  if (!defaultStandard) throw new Error("default_standard_not_found");

  await saveAIStandardOverride({
    standardKey: defaultStandard.standard_key,
    category: defaultStandard.category,
    title: defaultStandard.title,
    instruction: defaultStandard.instruction,
    mode: defaultStandard.mode,
    enabled: false,
    position: defaultStandard.position,
    source: "override",
  });
}
```

- [ ] **Step 5: Run validation tests**

Run:

```bash
npx tsc --module commonjs --target es2022 --esModuleInterop --skipLibCheck --outDir /tmp/workos-ai-standards-tests apps/platform/src/lib/ai-standards-validation.test.ts
node /tmp/workos-ai-standards-tests/lib/ai-standards-validation.test.js
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/ai-standards-validation.ts apps/platform/src/lib/ai-standards-validation.test.ts apps/platform/src/lib/actions/ai-standards.ts
git commit -m "feat(platform): add ai standards actions"
```

---

## Task 4: Wire Standards Into Claude Prompt Assembly

**Files:**
- Modify: `apps/platform/src/lib/agents/claude-prompt.ts`
- Modify: `apps/platform/src/lib/agents/claude-prompt.test.ts`
- Modify: `apps/platform/src/lib/actions/posts.ts`

- [ ] **Step 1: Extend prompt test**

Modify `apps/platform/src/lib/agents/claude-prompt.test.ts` after the existing prompt assertions:

```ts
const promptWithStandards = renderClaudePrompt(ctx, {
  targetPostId: "target",
  standards: [
    {
      standard_key: "standard.output.pyramid_principle",
      category: "output",
      title: "Pyramid principle",
      instruction: "Lead with the answer, then support it.",
      mode: "visible_when_useful",
      enabled: true,
      position: 10,
      source: "default",
    },
  ],
});

assert.match(
  promptWithStandards.systemPrompt,
  /# BrainShare Inborn AI Standards/
);
assert.match(promptWithStandards.systemPrompt, /Pyramid principle/);
assert.match(
  promptWithStandards.systemPrompt,
  /Only respond to the post explicitly marked/
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx tsc --module commonjs --target es2022 --esModuleInterop --skipLibCheck --outDir /tmp/workos-ai-standards-tests apps/platform/src/lib/agents/claude-prompt.test.ts
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NODE_PATH="$PWD/node_modules:$PWD/apps/platform/node_modules" node /tmp/workos-ai-standards-tests/lib/agents/claude-prompt.test.js
```

Expected: FAIL because `ClaudePromptOptions` does not accept `standards`.

- [ ] **Step 3: Update prompt renderer**

Modify `apps/platform/src/lib/agents/claude-prompt.ts` imports:

```ts
import type { AIStandard } from "../types";
import { renderAIStandardsForPrompt } from "../ai-standards";
```

Modify `ClaudePromptOptions`:

```ts
export interface ClaudePromptOptions {
  /**
   * The exact post that triggered this invocation. When present, the renderer
   * marks that post in the active thread so Claude does not answer a nearby
   * sibling/parent thread or an earlier @-mention.
   */
  targetPostId?: string;
  /**
   * Effective BrainShare inborn standards for this instance. These are
   * product-level defaults plus instance overrides.
   */
  standards?: AIStandard[];
}
```

Modify `renderClaudePrompt`:

```ts
export function renderClaudePrompt(
  ctx: NodeContext,
  options: ClaudePromptOptions = {}
): ClaudePrompt {
  return {
    systemPrompt: buildSystemPrompt(ctx, options),
    userMessage: buildUserMessage(ctx, options),
  };
}
```

Modify `buildSystemPrompt` signature and lines:

```ts
function buildSystemPrompt(
  ctx: NodeContext,
  options: ClaudePromptOptions
): string {
  const lines: Array<string | null> = [
    `You are Claude, a teammate inside WorkOS — a work management platform where humans and AI agents collaborate as peers in card and stack post threads.`,
    ``,
    `You have been @-mentioned in a post thread. Your job is to be useful: think with the user, draft, analyze, summarize, plan, or push back honestly. Be concise. Ground every claim in the context below; if context is missing, ask. Only respond to the post explicitly marked "TARGET @MENTION TO ANSWER". Do NOT answer earlier @-mentions or adjacent parent/sibling threads unless the target post asks you to use them. Do NOT @-mention yourself or other agents in your reply. Do NOT prefix your message with "Claude:" or your name — the post is already attributed to you.`,
    ``,
    options.standards && options.standards.length > 0
      ? `${renderAIStandardsForPrompt(options.standards)}\n`
      : null,
    `# Node`,
```

- [ ] **Step 4: Load standards in agent invocation**

Modify `apps/platform/src/lib/actions/posts.ts` imports:

```ts
import { getEffectiveAIStandards, DEFAULT_AI_STANDARDS } from "../ai-standards";
```

Modify the render section inside `runClaudeForMention`:

```ts
    const targetAwareCtx = ensureTargetPostInOwnThread(ctx, targetPost);
    const standards = await getEffectiveAIStandards(actor.instance_id).catch(
      (err) => {
        console.error("[1.11] ai standards fallback:", err);
        return DEFAULT_AI_STANDARDS;
      }
    );
    console.log(
      `[1.11] context gathered (own=${targetAwareCtx.ownThread.length} parent=${targetAwareCtx.parentThread ? targetAwareCtx.parentThread.posts.length : 0} siblings=${targetAwareCtx.siblingThreads.length} children=${targetAwareCtx.childThreads.length}, standards=${standards.length}, ${Date.now() - tCtx}ms)`
    );
    ctxPrompt = renderClaudePrompt(targetAwareCtx, {
      targetPostId: targetPost.id,
      standards,
    });
```

- [ ] **Step 5: Run prompt test**

Run:

```bash
npx tsc --module commonjs --target es2022 --esModuleInterop --skipLibCheck --outDir /tmp/workos-ai-standards-tests apps/platform/src/lib/agents/claude-prompt.test.ts
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NODE_PATH="$PWD/node_modules:$PWD/apps/platform/node_modules" node /tmp/workos-ai-standards-tests/lib/agents/claude-prompt.test.js
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/agents/claude-prompt.ts apps/platform/src/lib/agents/claude-prompt.test.ts apps/platform/src/lib/actions/posts.ts
git commit -m "feat(platform): apply ai standards to claude replies"
```

---

## Task 5: Admin Settings UI

**Files:**
- Create: `apps/platform/src/app/settings/ai-standards/page.tsx`
- Create: `apps/platform/src/components/ai-standards-settings.tsx`
- Modify: `apps/platform/src/components/sidebar.tsx`

- [ ] **Step 1: Create server page**

Create `apps/platform/src/app/settings/ai-standards/page.tsx`:

```tsx
import { getCurrentActor } from "@/lib/actor";
import { getEffectiveAIStandards } from "@/lib/ai-standards";
import { AIStandardsSettings } from "@/components/ai-standards-settings";

export default async function AIStandardsSettingsPage() {
  const actor = await getCurrentActor();
  const standards = await getEffectiveAIStandards(actor.instance_id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
      <header>
        <div className="section-label">Admin</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
          AI Standards
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Universal standards that shape how AI teammates collaborate and
          structure their output.
        </p>
      </header>
      <AIStandardsSettings standards={standards} />
    </div>
  );
}
```

- [ ] **Step 2: Create client settings component**

Create `apps/platform/src/components/ai-standards-settings.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import type { AIStandard } from "@/lib/types";
import {
  resetAIStandardOverride,
  saveAIStandardOverride,
} from "@/lib/actions/ai-standards";

interface AIStandardsSettingsProps {
  standards: AIStandard[];
}

export function AIStandardsSettings({ standards }: AIStandardsSettingsProps) {
  const [drafts, setDrafts] = useState(standards);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grouped = {
    interaction: drafts.filter((s) => s.category === "interaction"),
    output: drafts.filter((s) => s.category === "output"),
  };

  const updateDraft = (
    standardKey: string,
    patch: Partial<AIStandard>
  ) => {
    setDrafts((current) =>
      current.map((standard) =>
        standard.standard_key === standardKey
          ? { ...standard, ...patch }
          : standard
      )
    );
  };

  const save = (standard: AIStandard) => {
    startTransition(async () => {
      await saveAIStandardOverride({
        standardKey: standard.standard_key,
        category: standard.category,
        title: standard.title,
        instruction: standard.instruction,
        mode: standard.mode,
        enabled: standard.enabled,
        position: standard.position,
        source: standard.source === "custom" ? "custom" : "override",
      });
      setSavedKey(standard.standard_key);
      window.setTimeout(() => setSavedKey(null), 1200);
    });
  };

  const reset = (standardKey: string) => {
    startTransition(async () => {
      await resetAIStandardOverride(standardKey);
      setDrafts((current) =>
        current.map((standard) => {
          const original = standards.find(
            (s) => s.standard_key === standard.standard_key
          );
          return original ?? standard;
        })
      );
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-card">
      <StandardGroup
        title="Interaction"
        standards={grouped.interaction}
        pending={pending}
        savedKey={savedKey}
        onUpdate={updateDraft}
        onSave={save}
        onReset={reset}
      />
      <StandardGroup
        title="Output"
        standards={grouped.output}
        pending={pending}
        savedKey={savedKey}
        onUpdate={updateDraft}
        onSave={save}
        onReset={reset}
      />
    </div>
  );
}

function StandardGroup({
  title,
  standards,
  pending,
  savedKey,
  onUpdate,
  onSave,
  onReset,
}: {
  title: string;
  standards: AIStandard[];
  pending: boolean;
  savedKey: string | null;
  onUpdate: (standardKey: string, patch: Partial<AIStandard>) => void;
  onSave: (standard: AIStandard) => void;
  onReset: (standardKey: string) => void;
}) {
  return (
    <section className="border-b border-border last:border-b-0">
      <div className="border-b border-border bg-bg-secondary px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="divide-y divide-border">
        {standards.map((standard) => (
          <div
            key={standard.standard_key}
            className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(160px,240px)_1fr_auto]"
          >
            <div className="min-w-0">
              <input
                value={standard.title}
                onChange={(event) =>
                  onUpdate(standard.standard_key, { title: event.target.value })
                }
                className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-text-primary outline-none focus:border-border-strong focus:bg-bg-primary"
              />
              <div className="mt-1 truncate font-mono text-[11px] text-text-tertiary">
                {standard.standard_key}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <textarea
                value={standard.instruction}
                onChange={(event) =>
                  onUpdate(standard.standard_key, {
                    instruction: event.target.value,
                  })
                }
                rows={3}
                className="min-h-20 w-full resize-y rounded-md border border-border bg-bg-primary px-2 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <select
                value={standard.mode}
                onChange={(event) =>
                  onUpdate(standard.standard_key, {
                    mode: event.target.value as AIStandard["mode"],
                  })
                }
                className="w-fit rounded-md border border-border bg-bg-primary px-2 py-1 text-xs text-text-secondary outline-none focus:border-accent"
              >
                <option value="latent">Latent</option>
                <option value="visible_when_useful">Visible when useful</option>
              </select>
            </div>

            <div className="flex items-start gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdate(standard.standard_key, {
                    enabled: !standard.enabled,
                  })
                }
                title={standard.enabled ? "Disable" : "Enable"}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
              >
                {standard.enabled ? (
                  <ToggleRight size={17} />
                ) : (
                  <ToggleLeft size={17} />
                )}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onSave(standard)}
                title="Save"
                className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
              >
                {savedKey === standard.standard_key ? (
                  <Check size={15} />
                ) : (
                  <Save size={15} />
                )}
              </button>
              <button
                type="button"
                disabled={pending || standard.source === "custom"}
                onClick={() => onReset(standard.standard_key)}
                title="Reset default"
                className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add settings link to sidebar**

Modify `apps/platform/src/components/sidebar.tsx` imports:

```ts
import {
  ChevronLeft,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Rss,
  Search,
  Settings,
} from "lucide-react";
```

Add before the footer theme toggle:

```tsx
      <div className="border-t border-border px-2 py-2">
        <Link
          href="/settings/ai-standards"
          title="AI Standards"
          className={[
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            pathname === "/settings/ai-standards"
              ? "bg-bg-selected text-text-primary"
              : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <Settings size={15} strokeWidth={2} />
          {!collapsed && <span>AI Standards</span>}
        </Link>
      </div>
```

- [ ] **Step 4: Typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 5: Start dev server for visual verification**

Run:

```bash
npm --workspace @workos/platform run dev
```

Expected: dev server starts. Open `/settings/ai-standards` in the browser and verify:

- Settings page loads.
- Interaction and Output groups render.
- Toggling a standard changes the visible icon.
- Editing text does not overlap controls.
- Save button does not crash.
- Sidebar link highlights on the settings route.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/app/settings/ai-standards/page.tsx apps/platform/src/components/ai-standards-settings.tsx apps/platform/src/components/sidebar.tsx
git commit -m "feat(platform): add ai standards settings"
```

---

## Task 6: Final Verification and Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-05-20-ai-standards-design.md` only if implementation diverges from the approved spec.

- [ ] **Step 1: Run full Platform typecheck**

Run:

```bash
npx tsc --noEmit --project apps/platform/tsconfig.json
```

Expected: PASS.

- [ ] **Step 2: Run pure assertion tests**

Run:

```bash
npx tsc --module commonjs --target es2022 --esModuleInterop --skipLibCheck --outDir /tmp/workos-ai-standards-tests \
  apps/platform/src/lib/ai-standards.test.ts \
  apps/platform/src/lib/ai-standards-validation.test.ts \
  apps/platform/src/lib/agents/claude-prompt.test.ts \
  apps/platform/src/lib/panel-resize.test.ts \
  apps/platform/src/lib/blocknote-markdown.test.ts \
  apps/platform/src/lib/agents/markdown-to-blocknote.test.ts \
  apps/platform/src/components/posts-tab-content.test.ts
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NODE_PATH="$PWD/node_modules:$PWD/apps/platform/node_modules" sh -c 'for f in $(find /tmp/workos-ai-standards-tests -name "*.test.js" | sort -u); do node "$f" || exit 1; done'
```

Expected: both commands exit 0.

- [ ] **Step 3: Run lint and record known status**

Run:

```bash
npm --workspace @workos/platform run lint
```

Expected: the command may still fail on pre-existing `react-hooks/set-state-in-effect` and related lint issues. If it fails only on pre-existing files not changed by this task, record that in the final response. If it fails on files changed by this task, fix those failures before continuing.

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: only intended files are modified or untracked.

- [ ] **Step 5: Final commit if verification changed docs or code**

If Task 6 introduced a small fix, commit it:

```bash
git add <changed-files>
git commit -m "fix(platform): finalize ai standards wiring"
```

If Task 6 introduced no changes, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Universal inborn defaults: Task 1.
- Instance overrides in Supabase: Task 2.
- Admin-editable settings surface: Task 5.
- Runtime merge of defaults and overrides: Task 1 and Task 2.
- `@Claude` prompt integration: Task 4.
- Failure fallback to defaults: Task 4.
- Validation and tests: Tasks 1, 3, 4, and 6.
- BrainShare migration path remains documented in the design spec and does not require code in this WorkOS slice.

Placeholder scan:

- No "TBD", "TODO", "fill in details", or "similar to" instructions remain.
- Each code-changing step includes exact paths and concrete code.

Type consistency:

- Stable key field is `standard_key` in Supabase/read models.
- Server action input uses `standardKey` at the client boundary and normalizes to `standard_key`.
- Modes are consistently `latent` and `visible_when_useful`.
- Categories are consistently `interaction` and `output`.
