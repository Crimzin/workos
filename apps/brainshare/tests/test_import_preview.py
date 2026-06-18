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


if __name__ == "__main__":
    test_import_preview_groups_synthesized_topics_into_workos_threads()
