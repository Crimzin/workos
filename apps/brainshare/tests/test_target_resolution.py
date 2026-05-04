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


def test_target_resolution_does_not_label_one_token_overlap_as_semantic_match():
    response = post_resolution(
        {
            "primitive": {
                "type": "decision",
                "statement": "Decide provider posture for customer launch",
                "conviction": 0.8,
            },
            "candidates": [
                {
                    "node_id": "card_support",
                    "type": "card",
                    "title": "Customer support queue",
                    "body": "Triage inbound tickets and escalation paths.",
                    "updated_at": "2026-05-04T12:00:00Z",
                },
            ],
        }
    )

    assert response.status_code == 200
    data = response.json()
    scored_candidate = data["target"] or data["alternates"][0]
    assert scored_candidate["node_id"] == "card_support"
    assert "semantic_match" not in scored_candidate["reasons"]


def test_target_resolution_stopwords_do_not_count_toward_semantic_match():
    response = post_resolution(
        {
            "primitive": {
                "type": "decision",
                "statement": "Decide customer posture before launch",
                "conviction": 0.8,
            },
            "candidates": [
                {
                    "node_id": "card_support",
                    "type": "card",
                    "title": "Customer support before rollout",
                    "body": "Triage inbound tickets and escalation paths.",
                    "updated_at": "2026-05-04T12:00:00Z",
                },
            ],
        }
    )

    assert response.status_code == 200
    data = response.json()
    scored_candidate = data["target"] or data["alternates"][0]
    assert scored_candidate["node_id"] == "card_support"
    assert "semantic_match" not in scored_candidate["reasons"]


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


if __name__ == "__main__":
    test_target_resolution_prefers_semantically_matching_card()
    test_target_resolution_does_not_label_one_token_overlap_as_semantic_match()
    test_target_resolution_stopwords_do_not_count_toward_semantic_match()
    test_target_resolution_prefers_stack_for_strategic_primitive()
    test_target_resolution_marks_low_confidence_match_as_orphaned()
    test_target_resolution_requires_candidates()
