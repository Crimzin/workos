# BrainShare WorkOS Target Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build BrainShare `2.3.2` target resolution so a BrainShare primitive can be scored against candidate WorkOS cards/stacks and return an explainable best target, alternates, or orphan review result.

**Architecture:** Keep this slice inside the BrainShare service. WorkOS will supply target candidates later; for now BrainShare exposes a pure scoring endpoint that accepts a primitive plus candidate nodes and returns deterministic, explainable resolution output without writing to Supabase. The implementation should be small, testable, provider-neutral, and compatible with the existing JSON/Graphiti store model.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic, FastAPI `TestClient`, `uv run`.

---

## File Structure

- Modify `apps/brainshare/app/app.py`
  - Add request/response Pydantic models for WorkOS target resolution.
  - Add pure helper functions for tokenization, similarity scoring, scale matching, source-scope matching, and final ranking.
  - Add `POST /workos/target-resolution` endpoint.
- Create `apps/brainshare/tests/test_target_resolution.py`
  - Plain Python assertion tests using FastAPI `TestClient`, runnable without adding pytest.
  - Covers best-target selection, stack-vs-card scale choice, orphan behavior, and endpoint auth/shape.
- Modify `apps/brainshare/api-spec.md`
  - Document `POST /workos/target-resolution` request and response.
- Modify `ai-ecosystem-roadmap-v1.2.md`
  - Mark the target-resolution API item complete only after tests pass.

---

### Task 1: Add Failing Target-Resolution Tests

**Files:**
- Create: `apps/brainshare/tests/test_target_resolution.py`

- [ ] **Step 1: Write the failing test file**

Create `apps/brainshare/tests/test_target_resolution.py` with:

```python
import os
import sys
from pathlib import Path

os.environ.setdefault("BRAINSHARE_STORE_BACKEND", "json")
os.environ.setdefault("BRAINSHARE_STORE_FILE", "/private/tmp/brainshare-target-resolution-test.json")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

from fastapi.testclient import TestClient  # noqa: E402
from app import app  # noqa: E402


AUTH = {"Authorization": "Bearer bs_team_abc123"}


def post_resolution(payload: dict):
    return TestClient(app).post("/workos/target-resolution", headers=AUTH, json=payload)


def test_target_resolution_prefers_semantically_matching_card():
    response = post_resolution(
        {
            "primitive": {
                "type": "decision",
                "statement": "Use WorkOS AuthKit for customer authentication",
                "body": "AuthKit keeps auth in the WorkOS stack and avoids Clerk integration drift.",
                "conviction": 0.92,
                "metadata": {"scope": "authentication"},
            },
            "candidates": [
                {
                    "node_id": "card_auth",
                    "type": "card",
                    "title": "Customer authentication",
                    "body": "Pick provider for login, sessions, and signup.",
                    "fields": {"Status": "Planning", "Priority": "P1"},
                    "memory": ["Existing decision: keep identity simple."],
                    "linked_node_titles": ["Settings"],
                    "updated_at": "2026-05-03T12:00:00Z",
                },
                {
                    "node_id": "card_billing",
                    "type": "card",
                    "title": "Billing settings",
                    "body": "Stripe checkout and invoices.",
                    "fields": {"Status": "Backlog"},
                    "updated_at": "2026-05-04T12:00:00Z",
                },
            ],
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["orphaned"] is False
    assert data["target"]["node_id"] == "card_auth"
    assert data["target"]["confidence"] >= 0.35
    assert "semantic_match" in data["target"]["reasons"]
    assert data["alternates"][0]["node_id"] == "card_billing"


def test_target_resolution_prefers_stack_for_strategic_primitive():
    response = post_resolution(
        {
            "primitive": {
                "type": "decision",
                "statement": "Prioritize BrainShare writeback before expanding external connectors",
                "body": "This affects the sequence of several cards in Phase 2.3.",
                "conviction": 0.88,
                "metadata": {"scope": "roadmap", "scale": "stack"},
            },
            "candidates": [
                {
                    "node_id": "stack_phase_23",
                    "type": "stack",
                    "title": "BrainShare 2.3 WorkOS Writeback",
                    "body": "Target resolution, writeback, review, and Memory Browser.",
                    "fields": {"Lifecycle": "Prioritized"},
                    "updated_at": "2026-05-04T10:00:00Z",
                },
                {
                    "node_id": "card_target_resolution",
                    "type": "card",
                    "title": "Target resolution endpoint",
                    "body": "Score candidate cards and stacks.",
                    "fields": {"Status": "In Progress"},
                    "updated_at": "2026-05-04T11:00:00Z",
                },
            ],
        }
    )

    data = response.json()
    assert response.status_code == 200
    assert data["target"]["node_id"] == "stack_phase_23"
    assert "scale_match" in data["target"]["reasons"]


def test_target_resolution_marks_low_confidence_match_as_orphaned():
    response = post_resolution(
        {
            "min_confidence": 0.6,
            "primitive": {
                "type": "question",
                "statement": "Should we buy a new espresso machine?",
                "conviction": 0.52,
                "metadata": {"scope": "office"},
            },
            "candidates": [
                {
                    "node_id": "card_auth",
                    "type": "card",
                    "title": "Customer authentication",
                    "body": "Login and session work.",
                    "updated_at": "2026-05-04T12:00:00Z",
                }
            ],
        }
    )

    data = response.json()
    assert response.status_code == 200
    assert data["orphaned"] is True
    assert data["target"] is None
    assert data["review_reason"] == "no_candidate_above_min_confidence"
    assert data["alternates"][0]["node_id"] == "card_auth"


def test_target_resolution_requires_candidates():
    response = post_resolution(
        {
            "primitive": {
                "type": "decision",
                "statement": "Use FastAPI for BrainShare",
                "conviction": 0.9,
            },
            "candidates": [],
        }
    )

    assert response.status_code == 422
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: FAIL with a `404` assertion or route-not-found behavior for `/workos/target-resolution`, because the endpoint does not exist yet.

---

### Task 2: Add Target-Resolution Models and Scoring Helpers

**Files:**
- Modify: `apps/brainshare/app/app.py`

- [ ] **Step 1: Add model classes near the existing request models**

Add these classes after `class WorkOSMemoryPrimitiveIn(BaseModel):`:

```python
class WorkOSTargetCandidate(BaseModel):
    node_id: str
    type: Literal["workspace", "stack", "card"]
    title: str = Field(..., min_length=1)
    body: Optional[str] = None
    fields: dict[str, Any] = Field(default_factory=dict)
    memory: list[str] = Field(default_factory=list)
    linked_node_titles: list[str] = Field(default_factory=list)
    updated_at: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TargetResolutionRequest(BaseModel):
    primitive: PrimitiveCreate
    candidates: list[WorkOSTargetCandidate] = Field(..., min_length=1)
    min_confidence: float = Field(default=0.35, ge=0, le=1)
    max_alternates: int = Field(default=3, ge=0, le=10)


class TargetCandidateScore(BaseModel):
    node_id: str
    type: str
    title: str
    confidence: float
    score_breakdown: dict[str, float]
    reasons: list[str]


class TargetResolutionResponse(BaseModel):
    success: bool
    target: Optional[TargetCandidateScore]
    alternates: list[TargetCandidateScore] = Field(default_factory=list)
    orphaned: bool
    review_reason: Optional[str] = None
```

- [ ] **Step 2: Add scoring helpers after `body_to_text`**

Add:

```python
STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "before",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "this",
    "to",
    "use",
    "we",
    "with",
}


def text_tokens(value: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", value.lower())
    return {word for word in words if len(word) > 2 and word not in STOPWORDS}


def overlap_score(left: str, right: str) -> float:
    left_tokens = text_tokens(left)
    right_tokens = text_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = len(left_tokens & right_tokens)
    return round(overlap / max(1, min(len(left_tokens), len(right_tokens))), 3)


def primitive_resolution_text(primitive: PrimitiveCreate) -> str:
    metadata_text = " ".join(str(value) for value in primitive.metadata.values() if isinstance(value, str))
    return " ".join(part for part in [primitive.statement, primitive.body or "", metadata_text] if part)


def candidate_resolution_text(candidate: WorkOSTargetCandidate) -> str:
    field_text = " ".join(
        f"{key} {value}" for key, value in candidate.fields.items() if value is not None
    )
    memory_text = " ".join(candidate.memory)
    link_text = " ".join(candidate.linked_node_titles)
    metadata_text = " ".join(str(value) for value in candidate.metadata.values() if isinstance(value, str))
    return " ".join(
        part
        for part in [candidate.title, candidate.body or "", field_text, memory_text, link_text, metadata_text]
        if part
    )


def recency_score(updated_at: Optional[str]) -> float:
    if not updated_at:
        return 0.0
    updated = parse_reference_time(updated_at)
    age_days = max(0.0, (datetime.now(timezone.utc) - updated).total_seconds() / 86400)
    if age_days <= 7:
        return 1.0
    if age_days <= 30:
        return 0.6
    if age_days <= 90:
        return 0.3
    return 0.1


def primitive_wants_stack(primitive: PrimitiveCreate) -> bool:
    scale = str(primitive.metadata.get("scale") or "").lower()
    if scale in {"stack", "workspace", "strategic", "initiative"}:
        return True
    text = primitive_resolution_text(primitive).lower()
    markers = ["roadmap", "sequence", "several cards", "multiple cards", "strategy", "strategic", "initiative"]
    return any(marker in text for marker in markers)


def scale_match_score(primitive: PrimitiveCreate, candidate: WorkOSTargetCandidate) -> float:
    wants_stack = primitive_wants_stack(primitive)
    if wants_stack and candidate.type in {"stack", "workspace"}:
        return 1.0
    if not wants_stack and candidate.type == "card":
        return 1.0
    return 0.35


def scope_score(primitive: PrimitiveCreate, candidate: WorkOSTargetCandidate) -> float:
    scope = str(primitive.metadata.get("scope") or "").strip()
    if not scope:
        return 0.0
    return overlap_score(scope, candidate_resolution_text(candidate))


def score_workos_target_candidate(
    primitive: PrimitiveCreate,
    candidate: WorkOSTargetCandidate,
) -> TargetCandidateScore:
    semantic = overlap_score(primitive_resolution_text(primitive), candidate_resolution_text(candidate))
    scale = scale_match_score(primitive, candidate)
    scope = scope_score(primitive, candidate)
    recency = recency_score(candidate.updated_at)
    conviction = primitive.conviction
    confidence = round(
        min(
            1.0,
            semantic * 0.52
            + scale * 0.18
            + scope * 0.12
            + recency * 0.08
            + conviction * 0.10,
        ),
        3,
    )
    reasons = []
    if semantic >= 0.25:
        reasons.append("semantic_match")
    if scale >= 0.9:
        reasons.append("scale_match")
    if scope >= 0.25:
        reasons.append("scope_match")
    if recency >= 0.6:
        reasons.append("recent_activity")
    if conviction >= 0.8:
        reasons.append("high_conviction")
    if not reasons:
        reasons.append("weak_match")
    return TargetCandidateScore(
        node_id=candidate.node_id,
        type=candidate.type,
        title=candidate.title,
        confidence=confidence,
        score_breakdown={
            "semantic": semantic,
            "scale": scale,
            "scope": scope,
            "recency": recency,
            "conviction": round(conviction, 3),
        },
        reasons=reasons,
    )


def resolve_workos_target(payload: TargetResolutionRequest) -> TargetResolutionResponse:
    ranked = sorted(
        (
            score_workos_target_candidate(payload.primitive, candidate)
            for candidate in payload.candidates
        ),
        key=lambda item: item.confidence,
        reverse=True,
    )
    best = ranked[0]
    if best.confidence < payload.min_confidence:
        return TargetResolutionResponse(
            success=True,
            target=None,
            alternates=ranked[: payload.max_alternates],
            orphaned=True,
            review_reason="no_candidate_above_min_confidence",
        )
    return TargetResolutionResponse(
        success=True,
        target=best,
        alternates=ranked[1 : 1 + payload.max_alternates],
        orphaned=False,
    )
```

- [ ] **Step 3: Run tests and verify the original endpoint failure remains**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: still FAIL because the endpoint has not been wired yet.

---

### Task 3: Add the FastAPI Endpoint

**Files:**
- Modify: `apps/brainshare/app/app.py`

- [ ] **Step 1: Add the endpoint near existing WorkOS endpoints**

Add this immediately before `@app.post("/workos/memory-primitives", dependencies=[Depends(require_auth)])`:

```python
@app.post("/workos/target-resolution", dependencies=[Depends(require_auth)])
async def resolve_workos_target_endpoint(
    payload: TargetResolutionRequest,
) -> TargetResolutionResponse:
    return resolve_workos_target(payload)
```

- [ ] **Step 2: Run the tests and verify they pass**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: PASS with no output and exit code `0`.

- [ ] **Step 3: Run a syntax import check**

Run:

```bash
uv run --project apps/brainshare python -c "import sys; sys.path.insert(0, 'apps/brainshare/app'); import app; print('brainshare import ok')"
```

Expected:

```text
brainshare import ok
```

---

### Task 4: Document the API Contract

**Files:**
- Modify: `apps/brainshare/api-spec.md`

- [ ] **Step 1: Add endpoint docs after `POST /context/assemble`**

Insert:

```markdown
### POST /workos/target-resolution
Score a BrainShare primitive against candidate WorkOS nodes and return the best reviewable target. This endpoint does not write to WorkOS; it is the deterministic bridge before writeback.

**Request:**
```json
{
  "primitive": {
    "type": "decision",
    "statement": "Use WorkOS AuthKit for customer authentication",
    "body": "AuthKit keeps auth in the WorkOS stack.",
    "conviction": 0.92,
    "metadata": {"scope": "authentication"}
  },
  "candidates": [
    {
      "node_id": "card_auth",
      "type": "card",
      "title": "Customer authentication",
      "body": "Pick provider for login, sessions, and signup.",
      "fields": {"Status": "Planning"},
      "memory": ["Existing decision: keep identity simple."],
      "linked_node_titles": ["Settings"],
      "updated_at": "2026-05-03T12:00:00Z"
    }
  ],
  "min_confidence": 0.35,
  "max_alternates": 3
}
```

**Response:**
```json
{
  "success": true,
  "target": {
    "node_id": "card_auth",
    "type": "card",
    "title": "Customer authentication",
    "confidence": 0.71,
    "score_breakdown": {
      "semantic": 0.75,
      "scale": 1.0,
      "scope": 0.5,
      "recency": 1.0,
      "conviction": 0.92
    },
    "reasons": ["semantic_match", "scale_match", "scope_match", "recent_activity", "high_conviction"]
  },
  "alternates": [],
  "orphaned": false,
  "review_reason": null
}
```

If no candidate clears `min_confidence`, `target` is `null`, `orphaned` is `true`, and `review_reason` is `no_candidate_above_min_confidence`.
```

- [ ] **Step 2: Verify Markdown diff only touches the new endpoint section**

Run:

```bash
git diff -- apps/brainshare/api-spec.md
```

Expected: the diff adds the target-resolution section without changing existing endpoint contracts.

---

### Task 5: Update Roadmap Progress

**Files:**
- Modify: `ai-ecosystem-roadmap-v1.2.md`

- [ ] **Step 1: Mark the target-resolution payload item complete**

In `2.3.2 Target resolution: BrainShare primitive → WorkOS node`, change:

```markdown
- [ ] Return an explainable target-resolution payload: best target, alternates, confidence, "why this target", and "why not create a new node"
```

to:

```markdown
- [x] Return an explainable target-resolution payload: best target, alternates, confidence, "why this target", and "why not create a new node" — first BrainShare API slice complete via `/workos/target-resolution`; WorkOS candidate search still remains open
```

- [ ] **Step 2: Keep candidate search and scoring open unless they pull real WorkOS data**

Leave these items unchecked:

```markdown
- [ ] Build target-candidate search across WorkOS cards and stacks using title, posts, fields, existing memory primitives, linked nodes, owner/status/priority/lifecycle, and graph proximity
- [ ] Score candidate targets by semantic relevance, graph distance, recency, conviction, source scope, node lifecycle, and whether the primitive is card-scale or stack-scale
```

The scoring API accepts candidate data and does deterministic scoring, but the WorkOS-side candidate fetcher and graph-distance scoring are not finished in this slice.

---

### Task 6: Final Verification

**Files:**
- Read: `apps/brainshare/tests/test_target_resolution.py`
- Read: `apps/brainshare/app/app.py`
- Read: `apps/brainshare/api-spec.md`
- Read: `ai-ecosystem-roadmap-v1.2.md`

- [ ] **Step 1: Run the target-resolution tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: exit code `0`.

- [ ] **Step 2: Run the BrainShare import check**

Run:

```bash
uv run --project apps/brainshare python -c "import sys; sys.path.insert(0, 'apps/brainshare/app'); import app; print('brainshare import ok')"
```

Expected:

```text
brainshare import ok
```

- [ ] **Step 3: Run diff whitespace validation**

Run:

```bash
git diff --check -- apps/brainshare/app/app.py apps/brainshare/tests/test_target_resolution.py apps/brainshare/api-spec.md ai-ecosystem-roadmap-v1.2.md
```

Expected: exit code `0` and no output.

- [ ] **Step 4: Review touched files**

Run:

```bash
git diff --stat
git diff -- apps/brainshare/app/app.py apps/brainshare/tests/test_target_resolution.py apps/brainshare/api-spec.md ai-ecosystem-roadmap-v1.2.md
```

Expected: only the planned files contain target-resolution changes.

---

## Self-Review

- Spec coverage: The plan covers `2.3.2` target resolution payload, explainability, alternates, confidence, and orphan review. It intentionally does not implement WorkOS candidate fetching or BrainShare-to-WorkOS writes; those remain separate roadmap items.
- Scope: The endpoint is pure and accepts candidates as input, avoiding a cross-app integration before the scoring contract is proven.
- Type consistency: `TargetResolutionRequest`, `WorkOSTargetCandidate`, `TargetCandidateScore`, and `TargetResolutionResponse` are defined before endpoint use.
- Test discipline: The first task writes failing tests before production changes, then each implementation task runs the same tests.
