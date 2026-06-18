# Import Cold Start Boom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end WorkOS import flow that turns Claude/ChatGPT exports into reviewed topic clusters, WorkOS threads, Starting Context posts, and provenance-preserving memory primitives.

**Architecture:** BrainShare owns export normalization, episode ingestion, synthesis, and import preview contracts. WorkOS owns upload/review UX and materializes accepted preview items into the existing recursive node/thread/post/memory substrate. V1 is local-file/manual-session oriented and should optimize for a real founder export working end-to-end before broad connector polish.

**Tech Stack:** BrainShare FastAPI/Pydantic/Python tests, WorkOS Next.js 15 App Router/TypeScript/Supabase server actions/BlockNote post bodies, existing recursive `nodes`, `posts`, and `memory_primitives` tables.

---

## File Structure

Create:

- `apps/brainshare/app/import_preview.py` - pure BrainShare functions that turn stored conversation syntheses into WorkOS import preview clusters and Starting Context payloads.
- `apps/brainshare/tests/test_import_preview.py` - BrainShare contract tests for topic clustering and preview shape.
- `apps/platform/src/lib/import-preview.ts` - TypeScript types and pure helpers for WorkOS import preview payloads.
- `apps/platform/src/lib/import-preview.test.ts` - focused tests for Starting Context rendering and preview validation.
- `apps/platform/src/lib/import-materialization.ts` - pure mapping helpers from preview payloads to WorkOS insert payloads.
- `apps/platform/src/lib/import-materialization.test.ts` - focused tests for materialization decisions.
- `apps/platform/src/lib/actions/imports.ts` - server action that materializes accepted preview clusters into nodes, posts, and memory primitives.
- `apps/platform/src/app/import/page.tsx` - first import route.
- `apps/platform/src/components/import/import-workspace.tsx` - client component for paste/upload JSON, preview, include/exclude, and import submit.

Modify:

- `apps/brainshare/app/app.py` - expose import preview endpoint and Pydantic models.
- `apps/brainshare/api-spec.md` - document import preview endpoint.
- `apps/platform/src/components/sidebar.tsx` - add a quiet Import entry or action once the route works.
- `CLAUDE.md` - mark unified WorkOS/thread-first/import-first direction as current.
- `AGENTS.md` - add user-facing naming discipline for BrainShare/Swarm/Finiti.
- `ai-ecosystem-roadmap-v1.2.md` - add architecture decision entry pointing to the new strategy doc and this plan.
- `workos-competitor-context.md` - mark dual-entry/team-marketplace strategy as later expansion, not v1.

---

### Task 1: Reconcile Strategy Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `ai-ecosystem-roadmap-v1.2.md`
- Modify: `workos-competitor-context.md`
- Reference: `docs/strategy/workos-unified-vision-and-build-direction.md`

- [x] **Step 1: Update `CLAUDE.md` project framing**

Replace the opening "What This Project Is" section with this framing:

```markdown
## What This Project Is

WorkOS is a thread-first AI productivity product for non-engineer knowledge workers who want serious AI leverage without manually managing context, models, priorities, and repeatable workflows.

The user-facing product is WorkOS. BrainShare, Swarm, and Finiti are internal capability layers, not separate user-facing products:

- BrainShare powers memory, provenance, context assembly, and import synthesis.
- Swarm powers Focus: ranked, reasoned attention over existing threads.
- Finiti powers Workflows: reusable guided processes created and run inside WorkOS.

The near-term priority is the import/cold-start "boom": a user drops in Claude/ChatGPT exports, reviews topic clusters, and WorkOS creates a clean nested-thread structure with Starting Context posts. Boards, fields, memory primitives, agents, and model routing remain important, but the primary mental model is now thread-first WorkOS.
```

- [x] **Step 2: Update `AGENTS.md` naming discipline**

Add this under "Overview":

```markdown
## User-Facing Naming Discipline

WorkOS is the only user-facing product name for the current phase. BrainShare, Swarm, and Finiti are internal architecture names. Use plain surface names in UI copy and product docs:

- BrainShare -> Context, Memory, Sources, Starting Context
- Swarm -> Focus
- Finiti -> Workflows

Internal specs may still use BrainShare/Swarm/Finiti where architecture boundaries matter.
```

- [x] **Step 3: Add a roadmap decision entry**

Add this as the newest entry in `ai-ecosystem-roadmap-v1.2.md`:

```markdown
- **2026-06-18 - Unified WorkOS direction: import/cold-start is next.**
- The canonical product direction is now one user-facing WorkOS product with BrainShare, Swarm, and Finiti as internal capability layers. The immediate build priority is the import/cold-start "boom": Claude/ChatGPT exports -> topic clusters -> include/exclude review -> generated nested threads -> Starting Context posts with provenance. See `docs/strategy/workos-unified-vision-and-build-direction.md` and `docs/superpowers/plans/2026-06-18-import-cold-start-boom.md`.
```

- [x] **Step 4: Annotate competitor context**

Add this note near the top of `workos-competitor-context.md`:

```markdown
> June 2026 update: this document preserves useful competitive analysis, but the v1 product strategy has shifted from a visible three-product/dual-entry ecosystem to one user-facing WorkOS product. Swarm wedge, agent marketplace, and team/enterprise expansion remain possible later paths, not the immediate v1 narrative.
```

- [x] **Step 5: Verify docs diff**

Run:

```bash
git diff -- CLAUDE.md AGENTS.md ai-ecosystem-roadmap-v1.2.md workos-competitor-context.md docs/strategy/workos-unified-vision-and-build-direction.md
```

Expected: only strategy/doc language changes; no runtime files changed in this task.

- [x] **Step 6: Commit**

```bash
git add CLAUDE.md AGENTS.md ai-ecosystem-roadmap-v1.2.md workos-competitor-context.md docs/strategy/workos-unified-vision-and-build-direction.md docs/superpowers/plans/2026-06-18-import-cold-start-boom.md
git commit -m "docs: canonicalize unified WorkOS direction"
```

---

### Task 2: Add BrainShare Import Preview Contract

**Files:**
- Create: `apps/brainshare/app/import_preview.py`
- Create: `apps/brainshare/tests/test_import_preview.py`
- Modify: `apps/brainshare/app/app.py`
- Modify: `apps/brainshare/api-spec.md`

- [x] **Step 1: Write failing BrainShare preview test**

Create `apps/brainshare/tests/test_import_preview.py`:

```python
import os
import sys
import tempfile
from pathlib import Path

_STORE_DIR = tempfile.TemporaryDirectory()
os.environ["BRAINSHARE_STORE_BACKEND"] = "json"
os.environ["BRAINSHARE_STORE_FILE"] = str(Path(_STORE_DIR.name) / "store.json")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

from fastapi.testclient import TestClient  # noqa: E402
from app import app  # noqa: E402

AUTH = {"Authorization": "Bearer bs_team_abc123"}


def client() -> TestClient:
    return TestClient(app)


def test_import_preview_groups_synthesized_topics_into_workos_threads():
    ingest = client().post(
        "/sources/ai/conversations",
        headers=AUTH,
        json={
            "source_tool": "claude",
            "conversation_id": "claude:boom-test",
            "title": "WorkOS and career planning",
            "messages": [
                {
                    "id": "m1",
                    "role": "human",
                    "author_name": "Will",
                    "content": "WorkOS should become one product with BrainShare hidden under the hood.",
                    "timestamp": "2026-06-17T10:00:00Z",
                },
                {
                    "id": "m2",
                    "role": "assistant",
                    "content": "The first build should be import, clustering, and Starting Context.",
                    "timestamp": "2026-06-17T10:01:00Z",
                },
                {
                    "id": "m3",
                    "role": "human",
                    "author_name": "Will",
                    "content": "Separately, I want Anthropic to remain warm, but not distract from WorkOS.",
                    "timestamp": "2026-06-17T10:02:00Z",
                },
            ],
        },
    )
    assert ingest.status_code == 200, ingest.text

    synthesize = client().post(
        "/conversations/claude:boom-test/synthesize",
        headers=AUTH,
        json={"provider": "dev-rule", "store_synthesis": True, "store_primitives": False},
    )
    assert synthesize.status_code == 200, synthesize.text

    preview = client().post(
        "/imports/ai-conversations/preview",
        headers=AUTH,
        json={"conversation_ids": ["claude:boom-test"], "default_include": True},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["success"] is True
    assert body["import_job_id"].startswith("import_")
    assert body["clusters"]

    first_cluster = body["clusters"][0]
    assert first_cluster["include"] is True
    assert first_cluster["proposed_thread"]["title"]
    assert first_cluster["starting_context"]["summary"]
    assert "pick_up_here" in first_cluster["starting_context"]
    assert first_cluster["source_refs"][0]["conversation_id"] == "claude:boom-test"
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/brainshare
uv run python tests/test_import_preview.py
```

Expected: FAIL with 404 for `/imports/ai-conversations/preview`.

- [x] **Step 3: Create pure import preview module**

Create `apps/brainshare/app/import_preview.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4


@dataclass(frozen=True)
class ImportPreviewRequestData:
    conversation_ids: list[str]
    default_include: bool = True


def _safe_title(value: Any, fallback: str) -> str:
    title = str(value or "").strip()
    return title if title else fallback


def _topic_summary(topic: dict[str, Any], synthesis: dict[str, Any]) -> str:
    summary = str(topic.get("summary") or "").strip()
    if summary:
        return summary
    return str(synthesis.get("conversation_brief", {}).get("summary") or "").strip()


def starting_context_for_topic(topic: dict[str, Any], synthesis: dict[str, Any]) -> dict[str, Any]:
    primitives = [
        primitive
        for primitive in synthesis.get("primitives", [])
        if primitive.get("topic") == topic.get("name")
    ]
    decisions = [
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "decision" and primitive.get("statement")
    ]
    open_questions = [
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "question" and primitive.get("statement")
    ]
    assumptions = [
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "assumption" and primitive.get("statement")
    ]

    topic_name = _safe_title(topic.get("name"), "Imported conversation")
    summary = _topic_summary(topic, synthesis) or f"Imported context about {topic_name}."
    return {
        "summary": summary,
        "key_decisions": decisions[:6],
        "open_questions": open_questions[:6],
        "assumptions_or_constraints": assumptions[:6],
        "pick_up_here": f"Continue from the latest useful thread of work on {topic_name}.",
    }


def build_import_preview(
    syntheses: list[dict[str, Any]],
    request: ImportPreviewRequestData,
) -> dict[str, Any]:
    clusters: list[dict[str, Any]] = []
    for synthesis in syntheses:
        conversation_id = synthesis.get("conversation_id")
        topics = synthesis.get("topics") or [
            {
                "name": synthesis.get("title") or conversation_id or "Imported conversation",
                "summary": synthesis.get("conversation_brief", {}).get("summary", ""),
            }
        ]
        for index, topic in enumerate(topics):
            title = _safe_title(topic.get("name"), f"Imported thread {index + 1}")
            cluster_id = f"cluster_{len(clusters) + 1}"
            clusters.append(
                {
                    "id": cluster_id,
                    "title": title,
                    "summary": _topic_summary(topic, synthesis),
                    "include": request.default_include,
                    "proposed_thread": {
                        "title": title,
                        "description": _topic_summary(topic, synthesis),
                        "parent_cluster_id": None,
                    },
                    "starting_context": starting_context_for_topic(topic, synthesis),
                    "candidate_primitives": [
                        primitive
                        for primitive in synthesis.get("primitives", [])
                        if primitive.get("topic") == topic.get("name")
                    ],
                    "source_refs": [
                        {
                            "conversation_id": conversation_id,
                            "synthesis_id": synthesis.get("id"),
                            "source_episode_ids": synthesis.get("source_episode_ids", []),
                            "source_provenance": synthesis.get("source_provenance", {}),
                        }
                    ],
                }
            )

    return {
        "success": True,
        "import_job_id": f"import_{uuid4().hex}",
        "clusters": clusters,
        "excluded_cluster_ids": [cluster["id"] for cluster in clusters if not cluster["include"]],
        "metadata": {"preview_version": "workos_import_preview_v0"},
    }
```

- [x] **Step 4: Add Pydantic models and endpoint**

In `apps/brainshare/app/app.py`, import:

```python
from import_preview import ImportPreviewRequestData, build_import_preview
```

Add near the existing request models:

```python
class AIConversationImportPreviewRequest(BaseModel):
    conversation_ids: list[str] = Field(..., min_length=1)
    default_include: bool = True
```

Add near the conversation synthesis routes:

```python
@app.post("/imports/ai-conversations/preview", dependencies=[Depends(require_auth)])
async def preview_ai_conversation_import(request: AIConversationImportPreviewRequest):
    syntheses: list[dict[str, Any]] = []
    missing: list[str] = []
    for conversation_id in request.conversation_ids:
        stored = store.conversation_syntheses_for(conversation_id)
        if not stored:
            missing.append(conversation_id)
        else:
            syntheses.extend(stored)
    if missing:
        raise HTTPException(status_code=404, detail={"missing_conversation_ids": missing})
    return build_import_preview(
        syntheses,
        ImportPreviewRequestData(
            conversation_ids=request.conversation_ids,
            default_include=request.default_include,
        ),
    )
```

- [x] **Step 5: Document endpoint**

Add to `apps/brainshare/api-spec.md`:

```markdown
### POST /imports/ai-conversations/preview
Build a WorkOS import preview from stored AI conversation syntheses. This endpoint does not create WorkOS nodes. It returns topic clusters, proposed thread titles, Starting Context payloads, candidate primitives, and provenance references for WorkOS to review/materialize.
```

- [x] **Step 6: Run BrainShare tests**

Run:

```bash
cd apps/brainshare
uv run python tests/test_import_preview.py
uv run python tests/test_conversation_synthesis.py
uv run python tests/test_cli_ai_session_continuity.py
```

Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add apps/brainshare/app/import_preview.py apps/brainshare/app/app.py apps/brainshare/tests/test_import_preview.py apps/brainshare/api-spec.md
git commit -m "feat(brainshare): add AI conversation import preview"
```

---

### Task 3: Add WorkOS Import Preview Types And Starting Context Rendering

**Files:**
- Create: `apps/platform/src/lib/import-preview.ts`
- Create: `apps/platform/src/lib/import-preview.test.ts`

- [x] **Step 1: Write failing WorkOS helper test**

Create `apps/platform/src/lib/import-preview.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  renderStartingContextMarkdown,
  validateImportPreview,
} from "./import-preview";

const preview = {
  success: true,
  import_job_id: "import_123",
  clusters: [
    {
      id: "cluster_1",
      title: "WorkOS unified direction",
      summary: "WorkOS is now one user-facing product.",
      include: true,
      proposed_thread: {
        title: "WorkOS unified direction",
        description: "WorkOS is now one user-facing product.",
        parent_cluster_id: null,
      },
      starting_context: {
        summary: "WorkOS is now one user-facing product.",
        key_decisions: ["Hide BrainShare, Swarm, and Finiti as internal layers."],
        open_questions: ["How should import preview be tuned?"],
        assumptions_or_constraints: ["V1 accepts top-level include/exclude only."],
        pick_up_here: "Build the import/cold-start boom.",
      },
      candidate_primitives: [],
      source_refs: [
        {
          conversation_id: "claude:boom-test",
          source_episode_ids: ["ep_1"],
          source_provenance: { source_tool: "claude" },
        },
      ],
    },
  ],
  excluded_cluster_ids: [],
  metadata: { preview_version: "workos_import_preview_v0" },
};

assert.equal(validateImportPreview(preview).clusters.length, 1);

const markdown = renderStartingContextMarkdown(preview.clusters[0].starting_context);
assert.match(markdown, /Starting Context/);
assert.match(markdown, /WorkOS is now one user-facing product/);
assert.match(markdown, /Build the import\/cold-start boom/);
assert.doesNotMatch(markdown, /undefined/);
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npx tsx apps/platform/src/lib/import-preview.test.ts
```

Expected: FAIL because `apps/platform/src/lib/import-preview.ts` does not exist.

- [x] **Step 3: Create import preview types/helper**

Create `apps/platform/src/lib/import-preview.ts`:

```ts
export interface StartingContext {
  summary: string;
  key_decisions: string[];
  open_questions: string[];
  assumptions_or_constraints: string[];
  pick_up_here: string;
}

export interface ImportPreviewCluster {
  id: string;
  title: string;
  summary: string;
  include: boolean;
  proposed_thread: {
    title: string;
    description: string | null;
    parent_cluster_id: string | null;
  };
  starting_context: StartingContext;
  candidate_primitives: Array<Record<string, unknown>>;
  source_refs: Array<{
    conversation_id: string;
    synthesis_id?: string | null;
    source_episode_ids: string[];
    source_provenance: Record<string, unknown>;
  }>;
}

export interface ImportPreview {
  success: true;
  import_job_id: string;
  clusters: ImportPreviewCluster[];
  excluded_cluster_ids: string[];
  metadata: Record<string, unknown>;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

export function validateImportPreview(value: unknown): ImportPreview {
  assertObject(value, "Import preview");
  if (value.success !== true) throw new Error("Import preview must be successful");
  if (typeof value.import_job_id !== "string") throw new Error("import_job_id is required");
  if (!Array.isArray(value.clusters)) throw new Error("clusters must be an array");
  return value as ImportPreview;
}

function renderList(items: string[], emptyText: string): string {
  if (items.length === 0) return `- ${emptyText}`;
  return items.map((item) => `- ${item}`).join("\n");
}

export function renderStartingContextMarkdown(context: StartingContext): string {
  return [
    "# Starting Context",
    "",
    context.summary,
    "",
    "## Key Decisions",
    renderList(context.key_decisions, "No durable decisions detected yet."),
    "",
    "## Open Questions",
    renderList(context.open_questions, "No open questions detected yet."),
    "",
    "## Assumptions And Constraints",
    renderList(context.assumptions_or_constraints, "No explicit assumptions or constraints detected yet."),
    "",
    "## Pick Up Here",
    context.pick_up_here,
  ].join("\n");
}
```

- [x] **Step 4: Run helper test**

Run:

```bash
npx tsx apps/platform/src/lib/import-preview.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/platform/src/lib/import-preview.ts apps/platform/src/lib/import-preview.test.ts
git commit -m "feat(import): add preview contract helpers"
```

---

### Task 4: Add WorkOS Import Materialization Helpers

**Files:**
- Create: `apps/platform/src/lib/import-materialization.ts`
- Create: `apps/platform/src/lib/import-materialization.test.ts`

- [x] **Step 1: Write failing materialization test**

Create `apps/platform/src/lib/import-materialization.test.ts`:

```ts
import assert from "node:assert/strict";
import { buildAcceptedImportPlan } from "./import-materialization";
import type { ImportPreview } from "./import-preview";

const preview: ImportPreview = {
  success: true,
  import_job_id: "import_123",
  clusters: [
    {
      id: "cluster_1",
      title: "WorkOS",
      summary: "Included",
      include: true,
      proposed_thread: { title: "WorkOS", description: "Included", parent_cluster_id: null },
      starting_context: {
        summary: "Included",
        key_decisions: ["One product."],
        open_questions: [],
        assumptions_or_constraints: [],
        pick_up_here: "Continue WorkOS.",
      },
      candidate_primitives: [
        { type: "decision", statement: "One product.", body: "Hide internal layer names.", conviction: 0.9 },
        { type: "question", statement: "Unsupported primitive should stay metadata-only." },
      ],
      source_refs: [{ conversation_id: "claude:1", source_episode_ids: ["ep_1"], source_provenance: {} }],
    },
    {
      id: "cluster_2",
      title: "Personal",
      summary: "Excluded",
      include: false,
      proposed_thread: { title: "Personal", description: "Excluded", parent_cluster_id: null },
      starting_context: {
        summary: "Excluded",
        key_decisions: [],
        open_questions: [],
        assumptions_or_constraints: [],
        pick_up_here: "Do nothing.",
      },
      candidate_primitives: [],
      source_refs: [{ conversation_id: "claude:2", source_episode_ids: ["ep_2"], source_provenance: {} }],
    },
  ],
  excluded_cluster_ids: ["cluster_2"],
  metadata: {},
};

const plan = buildAcceptedImportPlan(preview);
assert.equal(plan.threads.length, 1);
assert.equal(plan.threads[0].title, "WorkOS");
assert.equal(plan.threads[0].memoryPrimitives.length, 1);
assert.equal(plan.threads[0].memoryPrimitives[0].type, "decision");
assert.match(plan.threads[0].startingContextMarkdown, /Starting Context/);
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npx tsx apps/platform/src/lib/import-materialization.test.ts
```

Expected: FAIL because the helper file does not exist.

- [x] **Step 3: Create materialization helper**

Create `apps/platform/src/lib/import-materialization.ts`:

```ts
import {
  renderStartingContextMarkdown,
  type ImportPreview,
  type ImportPreviewCluster,
} from "./import-preview";
import type { MemoryPrimitiveType } from "./types";

export interface ImportMemoryPrimitivePlan {
  type: MemoryPrimitiveType;
  statement: string;
  body: string | null;
  conviction: number;
  metadata: Record<string, unknown>;
  externalEpisodeId: string | null;
}

export interface ImportThreadPlan {
  clusterId: string;
  title: string;
  description: string | null;
  startingContextMarkdown: string;
  sourceRefs: ImportPreviewCluster["source_refs"];
  memoryPrimitives: ImportMemoryPrimitivePlan[];
}

export interface AcceptedImportPlan {
  importJobId: string;
  threads: ImportThreadPlan[];
  excludedClusterIds: string[];
}

function toMemoryType(value: unknown): MemoryPrimitiveType | null {
  if (value === "decision" || value === "assumption") return value;
  if (value === "rationale") return "rationale";
  return null;
}

export function buildAcceptedImportPlan(preview: ImportPreview): AcceptedImportPlan {
  return {
    importJobId: preview.import_job_id,
    excludedClusterIds: preview.excluded_cluster_ids,
    threads: preview.clusters
      .filter((cluster) => cluster.include)
      .map((cluster) => ({
        clusterId: cluster.id,
        title: cluster.proposed_thread.title || cluster.title,
        description: cluster.proposed_thread.description,
        startingContextMarkdown: renderStartingContextMarkdown(cluster.starting_context),
        sourceRefs: cluster.source_refs,
        memoryPrimitives: cluster.candidate_primitives.flatMap((primitive) => {
          const type = toMemoryType(primitive.type);
          const statement = typeof primitive.statement === "string" ? primitive.statement.trim() : "";
          if (!type || !statement) return [];
          const sourceEpisodeIds = cluster.source_refs.flatMap((source) => source.source_episode_ids);
          return [{
            type,
            statement,
            body: typeof primitive.body === "string" ? primitive.body : null,
            conviction: typeof primitive.conviction === "number" ? primitive.conviction : 0.5,
            metadata: { source: "workos_import", primitive, source_refs: cluster.source_refs },
            externalEpisodeId: sourceEpisodeIds[0] ?? null,
          }];
        }),
      })),
  };
}
```

- [x] **Step 4: Run materialization test**

Run:

```bash
npx tsx apps/platform/src/lib/import-materialization.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/platform/src/lib/import-materialization.ts apps/platform/src/lib/import-materialization.test.ts
git commit -m "feat(import): plan WorkOS thread materialization"
```

---

### Task 5: Materialize Accepted Import Preview Into WorkOS

**Files:**
- Create: `apps/platform/src/lib/actions/imports.ts`
- Modify: `apps/platform/src/lib/import-materialization.ts`
- Test: `apps/platform/src/lib/import-materialization.test.ts`

- [ ] **Step 1: Extend test for post body and primitive metadata**

Append to `apps/platform/src/lib/import-materialization.test.ts`:

```ts
assert.equal(plan.threads[0].sourceRefs[0].conversation_id, "claude:1");
assert.equal(plan.threads[0].memoryPrimitives[0].externalEpisodeId, "ep_1");
assert.equal(plan.excludedClusterIds[0], "cluster_2");
```

- [ ] **Step 2: Run test**

Run:

```bash
npx tsx apps/platform/src/lib/import-materialization.test.ts
```

Expected: PASS. This confirms the pure plan is ready before DB work.

- [ ] **Step 3: Add server action**

Create `apps/platform/src/lib/actions/imports.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateNode, revalidateNodeChildren, revalidateRootNodes } from "../cache";
import { buildAcceptedImportPlan } from "../import-materialization";
import { validateImportPreview, type ImportPreview } from "../import-preview";
import { supabase } from "../supabase";

export interface MaterializeImportResult {
  workspaceId: string;
  threadIds: string[];
}

async function nextPosition(parentId: string | null): Promise<number> {
  const { data, error } = await supabase
    .from("nodes")
    .select("position")
    .eq("parent_id", parentId)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  const current = data?.[0]?.position;
  return typeof current === "number" ? current + 1024 : 0;
}

export async function materializeImportPreview(rawPreview: unknown): Promise<MaterializeImportResult> {
  const preview: ImportPreview = validateImportPreview(rawPreview);
  const plan = buildAcceptedImportPlan(preview);
  const actor = await getCurrentActor();

  const workspacePosition = await nextPosition(null);
  const { data: workspace, error: workspaceError } = await supabase
    .from("nodes")
    .insert({
      instance_id: actor.instance_id,
      parent_id: null,
      type: "workspace",
      title: "Imported AI Context",
      description: "Generated from Claude/ChatGPT conversation exports.",
      owner_id: actor.id,
      position: workspacePosition,
    })
    .select("id")
    .single();
  if (workspaceError) throw workspaceError;

  const threadIds: string[] = [];
  for (let index = 0; index < plan.threads.length; index += 1) {
    const thread = plan.threads[index];
    const { data: node, error: nodeError } = await supabase
      .from("nodes")
      .insert({
        instance_id: actor.instance_id,
        parent_id: workspace.id,
        type: "stack",
        title: thread.title,
        description: thread.description,
        owner_id: actor.id,
        position: index * 1024,
        thread_resolution_status: "active",
      })
      .select("id")
      .single();
    if (nodeError) throw nodeError;
    threadIds.push(node.id);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        node_id: node.id,
        actor_id: actor.id,
        post_type: "post",
        body: thread.startingContextMarkdown,
        pinned: true,
        pinned_at: new Date().toISOString(),
        metadata: {
          import_job_id: plan.importJobId,
          import_cluster_id: thread.clusterId,
          source_refs: thread.sourceRefs,
          post_kind: "starting_context",
        },
      })
      .select("id")
      .single();
    if (postError) throw postError;

    for (const primitive of thread.memoryPrimitives) {
      const { error: primitiveError } = await supabase.from("memory_primitives").insert({
        instance_id: actor.instance_id,
        node_id: node.id,
        type: primitive.type,
        statement: primitive.statement,
        body: primitive.body,
        status: primitive.type === "assumption" ? "untested" : "active",
        conviction: primitive.conviction,
        metadata: primitive.metadata,
        source_post_id: post.id,
        source_label: "Imported AI conversation",
        external_episode_id: primitive.externalEpisodeId,
        created_by_actor_id: actor.id,
      });
      if (primitiveError) throw primitiveError;
    }
  }

  revalidateRootNodes();
  revalidateNode(workspace.id, null);
  revalidateNodeChildren(workspace.id);
  revalidatePath("/", "layout");
  revalidatePath(`/n/${workspace.id}`);
  return { workspaceId: workspace.id, threadIds };
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npx tsx apps/platform/src/lib/import-materialization.test.ts
npx tsx apps/platform/src/lib/import-preview.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript passes.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/actions/imports.ts apps/platform/src/lib/import-materialization.test.ts
git commit -m "feat(import): materialize imported AI context"
```

---

### Task 6: Add Minimal WorkOS Import UI

**Files:**
- Create: `apps/platform/src/app/import/page.tsx`
- Create: `apps/platform/src/components/import/import-workspace.tsx`
- Modify: `apps/platform/src/components/sidebar.tsx`

- [ ] **Step 1: Create import page**

Create `apps/platform/src/app/import/page.tsx`:

```tsx
import { ImportWorkspace } from "@/components/import/import-workspace";

export default function ImportPage() {
  return <ImportWorkspace />;
}
```

- [ ] **Step 2: Create minimal client component**

Create `apps/platform/src/components/import/import-workspace.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { materializeImportPreview } from "@/lib/actions/imports";
import {
  renderStartingContextMarkdown,
  validateImportPreview,
  type ImportPreview,
} from "@/lib/import-preview";

export function ImportWorkspace() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const includedCount = useMemo(
    () => preview?.clusters.filter((cluster) => cluster.include).length ?? 0,
    [preview]
  );

  function parsePreview() {
    try {
      setError(null);
      setPreview(validateImportPreview(JSON.parse(raw)));
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Invalid import preview JSON");
    }
  }

  function toggleCluster(clusterId: string) {
    setPreview((current) => {
      if (!current) return current;
      const clusters = current.clusters.map((cluster) =>
        cluster.id === clusterId ? { ...cluster, include: !cluster.include } : cluster
      );
      return {
        ...current,
        clusters,
        excluded_cluster_ids: clusters.filter((cluster) => !cluster.include).map((cluster) => cluster.id),
      };
    });
  }

  function submit() {
    if (!preview) return;
    startTransition(async () => {
      const result = await materializeImportPreview(preview);
      router.push(`/n/${result.workspaceId}`);
    });
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-bg-primary text-text-primary">
      <div className="border-b border-border px-6 py-4">
        <div className="section-label">Import</div>
        <h1 className="mt-1 text-xl font-semibold">Bring in AI history</h1>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_1fr] gap-0">
        <section className="border-r border-border p-5">
          <label className="block text-sm font-medium">BrainShare import preview JSON</label>
          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            className="mt-2 h-80 w-full resize-none rounded-md border border-border bg-bg-card p-3 font-mono text-xs text-text-primary outline-none focus:ring-2 focus:ring-accent"
            placeholder='Paste the /imports/ai-conversations/preview response here.'
          />
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={parsePreview}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!preview || includedCount === 0 || pending}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Importing..." : `Import ${includedCount}`}
            </button>
          </div>
        </section>

        <section className="min-h-0 overflow-auto p-5">
          {!preview ? (
            <div className="text-sm text-text-secondary">Paste a preview payload to review topic clusters.</div>
          ) : (
            <div className="space-y-3">
              {preview.clusters.map((cluster) => (
                <article key={cluster.id} className="rounded-md border border-border bg-bg-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold">{cluster.title}</h2>
                      <p className="mt-1 text-sm text-text-secondary">{cluster.summary}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={cluster.include}
                        onChange={() => toggleCluster(cluster.id)}
                      />
                      Include
                    </label>
                  </div>
                  <pre className="mt-3 max-h-72 overflow-auto rounded border border-border bg-bg-primary p-3 text-xs text-text-secondary">
                    {renderStartingContextMarkdown(cluster.starting_context)}
                  </pre>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add sidebar access**

In `apps/platform/src/components/sidebar.tsx`, add a simple `/import` navigation item near Settings or workspace actions. Use existing sidebar row patterns and the label `Import`.

- [ ] **Step 4: Run verification**

Run:

```bash
npx tsc --noEmit
npm --workspace apps/platform run lint -- --file src/app/import/page.tsx --file src/components/import/import-workspace.tsx
```

Expected: TypeScript passes; lint passes or reports only repo-existing warnings outside touched files.

- [ ] **Step 5: Browser smoke**

Run the dev server and open `/import`. Paste the preview JSON returned by Task 2's manual curl, click Preview, exclude one cluster, click Import, and verify redirect to `/n/<workspaceId>` with imported threads in the tree/board.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/app/import/page.tsx apps/platform/src/components/import/import-workspace.tsx apps/platform/src/components/sidebar.tsx
git commit -m "feat(import): add AI history import review UI"
```

---

### Task 7: End-To-End Founder Export Spike

**Files:**
- Modify only if needed after testing: files touched in Tasks 2-6
- Do not commit raw private exports.

- [ ] **Step 1: Normalize a real export locally**

Use the existing BrainShare CLI path:

```bash
cd apps/brainshare
./brainshare ingest-conversation /absolute/path/to/export.json --source-tool claude --title "Founder WorkOS export"
```

Expected: BrainShare returns a conversation id and stores Episodes. Do not add the export to git.

- [ ] **Step 2: Synthesize the conversation**

Run:

```bash
./brainshare synthesize-conversation "<conversation-id>" --provider dev-rule --json
```

Expected: response includes `conversation_brief`, `topics`, and `primitives`. If Claude provider key is configured and cost is acceptable, repeat with `--provider claude`.

- [ ] **Step 3: Build preview**

Run:

```bash
curl -s -X POST http://localhost:3100/imports/ai-conversations/preview \
  -H "Authorization: Bearer bs_team_abc123" \
  -H "Content-Type: application/json" \
  -d '{"conversation_ids":["<conversation-id>"],"default_include":true}' \
  > /tmp/workos-import-preview.json
```

Expected: `/tmp/workos-import-preview.json` contains clusters with Starting Context payloads.

- [ ] **Step 4: Import into WorkOS**

Open `/import`, paste `/tmp/workos-import-preview.json`, exclude one irrelevant cluster, and import.

Expected: WorkOS creates one workspace named `Imported AI Context`, one thread per included cluster, pinned Starting Context posts, and decision/assumption memory primitives where available.

- [ ] **Step 5: Verify imported context reaches an agent**

Open one imported thread and mention `@Claude` with:

```text
Based on the Starting Context in this thread, what should I do next?
```

Expected: the agent response uses the Starting Context without the user copy-pasting raw export content.

- [ ] **Step 6: Tune and commit fixes**

If the spike reveals small deterministic fixes, commit them with focused messages:

```bash
git add <changed-files>
git commit -m "fix(import): tune starting context preview"
```

If the spike reveals broad UX or model-quality issues, write them into a follow-up plan instead of expanding this slice.

---

## Self-Review

Spec coverage:

- Strategy docs reconciliation is covered in Task 1.
- BrainShare import preview contract is covered in Task 2.
- WorkOS preview validation and Starting Context rendering are covered in Task 3.
- WorkOS materialization planning and DB action are covered in Tasks 4-5.
- Minimal review UI is covered in Task 6.
- Real-export validation is covered in Task 7.

Known scope intentionally excluded:

- Direct browser upload and unzip parsing inside WorkOS.
- OAuth/direct connector history access.
- Beautiful onboarding choreography.
- Multi-conversation dedupe across clusters beyond simple preview grouping.
- Full Memory governance UI.
- Focus and Workflows surfaces.

Execution note:

- The current worktree has unrelated local changes in mobile/RLS files. Do not stage, revert, or modify them while executing this import plan unless the user explicitly asks.
