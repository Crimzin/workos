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
from import_preview import ImportPreviewRequestData, build_import_preview  # noqa: E402


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


def test_import_preview_preserves_rich_starting_context_fields():
    synthesis = {
        "id": "synth_1",
        "conversation_id": "claude:workos-suite",
        "title": "WorkOS suite thinking",
        "source_episode_ids": ["ep_1"],
        "source_provenance": {"source_tool": "claude"},
        "conversation_brief": {
            "summary": "WorkOS, BrainShare, and Swarm are converging into one suite.",
            "status": "needs_review",
            "audience": "future_ai_session",
        },
        "topics": [
            {
                "name": "WorkOS unified product direction",
                "summary": "WorkOS is the user-facing product; BrainShare and Swarm are internal layers.",
                "narrative": (
                    "The conversation frames WorkOS as the visible operating surface, "
                    "BrainShare as durable context/memory, and Swarm as orchestration. "
                    "The important product move is a unified workflow rather than three "
                    "separate applications."
                ),
                "status": "active",
                "source_spans": [
                    {
                        "episode_id": "ep_1",
                        "content_preview": (
                            "I do not want three apps. WorkOS should be the surface, "
                            "BrainShare should carry context, and Swarm should coordinate agents."
                        ),
                    }
                ],
            }
        ],
        "why_chains": [
            {
                "topic": "WorkOS unified product direction",
                "nodes": [
                    {
                        "type": "assumption",
                        "statement": "Users will not manually maintain the structure BrainShare needs.",
                    },
                    {
                        "type": "risk",
                        "statement": "A separate BrainShare UI could distract from the WorkOS wedge.",
                    },
                    {
                        "type": "question",
                        "statement": "What is the smallest import review loop that proves the wedge?",
                    },
                    {
                        "type": "action",
                        "statement": "Build an import review that creates a rich Starting Context thread.",
                    },
                ],
            }
        ],
        "primitives": [
            {
                "type": "decision",
                "statement": "Treat WorkOS, BrainShare, and Swarm as one product system.",
                "rationale": (
                    "The durable insight is that context and orchestration should be "
                    "experienced through the same collaboration surface."
                ),
                "human_signal": "explicit human statement",
                "conviction": 0.95,
                "topic": "WorkOS unified product direction",
                "citations": [],
            }
        ],
    }

    preview = build_import_preview(
        [synthesis],
        ImportPreviewRequestData(
            conversation_ids=["claude:workos-suite"],
            default_include=True,
        ),
    )

    context = preview["clusters"][0]["starting_context"]
    assert context["overview"]
    assert context["detail_notes"]
    assert context["reflection"]
    assert context["evidence_notes"]
    assert context["key_decisions"] == [
        "Treat WorkOS, BrainShare, and Swarm as one product system."
    ]
    assert context["open_questions"] == [
        "What is the smallest import review loop that proves the wedge?"
    ]
    assert (
        "Users will not manually maintain the structure BrainShare needs."
        in context["assumptions_or_constraints"]
    )
    assert "separate BrainShare UI" in context["assumptions_or_constraints"][1]
    assert context["pick_up_here"] == (
        "Build an import review that creates a rich Starting Context thread."
    )


if __name__ == "__main__":
    test_import_preview_groups_synthesized_topics_into_workos_threads()
    test_import_preview_preserves_rich_starting_context_fields()
