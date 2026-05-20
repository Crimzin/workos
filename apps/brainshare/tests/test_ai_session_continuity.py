import hashlib
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


def ingest_ai_conversation() -> dict:
    response = client().post(
        "/sources/ai/conversations",
        headers=AUTH,
        json={
            "source_tool": "claude",
            "conversation_id": "claude_conv_123",
            "title": "Provider-neutral BrainShare architecture",
            "project_name": "WorkOS",
            "source_url": "https://claude.ai/chat/claude_conv_123",
            "messages": [
                {
                    "id": "m1",
                    "role": "human",
                    "author_name": "Will",
                    "content": "BrainShare memory must be provider-neutral.",
                    "timestamp": "2026-05-04T10:00:00Z",
                    "attachments": [{"name": "roadmap.md", "content_type": "text/markdown"}],
                },
                {
                    "id": "m2",
                    "role": "assistant",
                    "content": "Agreed. Source adapters should feed generic Episodes.",
                    "timestamp": "2026-05-04T10:01:00Z",
                },
            ],
            "metadata": {
                "permission_scope": "private_dev",
                "attention_scope": "workos",
            },
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def ingest_extractable_ai_conversation() -> dict:
    response = client().post(
        "/sources/ai/conversations",
        headers=AUTH,
        json={
            "source_tool": "claude",
            "conversation_id": "claude_conv_extractable_123",
            "title": "Provider-neutral BrainShare architecture",
            "project_name": "WorkOS",
            "source_url": "https://claude.ai/chat/claude_conv_extractable_123",
            "messages": [
                {
                    "id": "m1",
                    "role": "human",
                    "author_name": "Will",
                    "content": "We should use provider-neutral BrainShare memory.",
                    "timestamp": "2026-05-04T10:00:00Z",
                },
                {
                    "id": "m2",
                    "role": "assistant",
                    "content": "Agreed. Source adapters should feed generic Episodes.",
                    "timestamp": "2026-05-04T10:01:00Z",
                },
            ],
            "metadata": {
                "permission_scope": "private_dev",
                "attention_scope": "workos",
            },
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def ingest_human_validated_ai_artifact_conversation() -> dict:
    response = client().post(
        "/sources/ai/conversations",
        headers=AUTH,
        json={
            "source_tool": "claude",
            "conversation_id": "claude_conv_career_strategy_123",
            "title": "Career strategy",
            "messages": [
                {
                    "id": "m1",
                    "role": "assistant",
                    "content": (
                        "This Anthropic education product role is a strong fit. "
                        "The honest read is that you have been doing product management work "
                        "for most of your career, even when the title did not match. "
                        "The risk is that a recruiter screens you out before a human reads your story. "
                        "Use a warm referral and directly explain the nontraditional PM path."
                    ),
                    "timestamp": "2026-04-16T20:18:12Z",
                },
                {
                    "id": "m2",
                    "role": "human",
                    "author_name": "Will",
                    "content": (
                        "I agree. some context though: I only did PM at Vega for ~1.5 years, "
                        "then shifted into consulting, exec coaching, L&D, keynotes, GTM, "
                        "and CoS type work. I've always felt like a product guy at heart."
                    ),
                    "timestamp": "2026-04-16T20:17:53Z",
                },
            ],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_ai_conversation_episode_preserves_generic_provenance():
    data = ingest_ai_conversation()

    episode = data["episodes"][0]
    metadata = episode["metadata"]
    provenance = metadata["provenance"]

    assert episode["source_tool"] == "claude"
    assert episode["source_location"] == "claude_conv_123"
    assert metadata["source_kind"] == "ai_conversation"
    assert metadata["conversation_id"] == "claude_conv_123"
    assert metadata["title"] == "Provider-neutral BrainShare architecture"
    assert metadata["project_name"] == "WorkOS"
    assert metadata["source_url"] == "https://claude.ai/chat/claude_conv_123"
    assert metadata["permission_scope"] == "private_dev"
    assert metadata["attention_scope"] == "workos"

    assert provenance["source_tool"] == "claude"
    assert provenance["source_kind"] == "ai_conversation"
    assert provenance["source_location"] == "claude_conv_123"
    expected_raw = (
        "[1] Will: BrainShare memory must be provider-neutral.\n"
        "[2] AI: Agreed. Source adapters should feed generic Episodes."
    )
    expected_hash = hashlib.sha256(expected_raw.encode("utf-8")).hexdigest()
    assert provenance["content_hash"] == f"sha256:{expected_hash}"
    assert provenance["message_count"] == 2
    assert provenance["actor_ids"] == ["Will"]
    assert provenance["timestamp_start"] == "2026-05-04T10:00:00Z"
    assert provenance["timestamp_end"] == "2026-05-04T10:01:00Z"


def test_ai_conversation_supporting_messages_have_source_spans():
    data = ingest_ai_conversation()
    supporting = data["episodes"][0]["metadata"]["supporting_messages"]

    assert len(supporting) == 2

    assert supporting[0]["index"] == 1
    assert supporting[0]["source_message_index"] == 1
    assert supporting[0]["message_id"] == "m1"
    assert supporting[0]["speaker_role"] == "human"
    assert supporting[0]["author_name"] == "Will"
    assert supporting[0]["source_span"]["kind"] == "message"
    assert supporting[0]["source_span"]["message_id"] == "m1"
    assert supporting[0]["source_span"]["turn_index"] == 1
    assert supporting[0]["source_span"]["source_message_index"] == 1
    assert supporting[0]["attachments"] == [{"name": "roadmap.md", "content_type": "text/markdown"}]

    assert supporting[1]["index"] == 2
    assert supporting[1]["source_message_index"] == 2
    assert supporting[1]["message_id"] == "m2"
    assert supporting[1]["speaker_role"] == "ai"
    assert supporting[1]["author_name"] == "AI"
    assert supporting[1]["source_span"]["kind"] == "message"
    assert supporting[1]["source_span"]["message_id"] == "m2"
    assert supporting[1]["source_span"]["turn_index"] == 2
    assert supporting[1]["source_span"]["source_message_index"] == 2


def test_ai_conversation_episode_tracks_all_participants_without_making_ai_authoritative():
    data = ingest_ai_conversation()
    episode = data["episodes"][0]
    metadata = episode["metadata"]

    assert episode["actors"] == ["Will"]
    assert metadata["participants"] == [
        {"id": "Will", "role": "human", "author_name": "Will"},
        {"id": "claude:AI", "role": "ai", "author_name": "AI", "source_tool": "claude"},
    ]
    assert metadata["provenance"]["participant_ids"] == ["Will", "claude:AI"]


def test_extracted_primitives_preserve_source_spans_and_provenance():
    data = ingest_extractable_ai_conversation()
    episode_id = data["episodes"][0]["id"]

    response = client().post(
        f"/episodes/{episode_id}/extract",
        headers=AUTH,
        json={
            "provider": "dev-rule",
            "store_primitives": True,
            "actor_context": {
                "Will": {
                    "name": "Will",
                    "authority": "Founder",
                    "authority_weight": 1.0,
                }
            },
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    stored = payload["stored_primitives"]
    assert stored
    primitive = next(
        (
            item
            for item in stored
            if item["type"] == "decision"
            and "provider-neutral" in item["statement"]
        ),
        None,
    )
    assert primitive is not None, [
        {"type": item.get("type"), "statement": item.get("statement")}
        for item in stored
    ]
    citations = primitive["metadata"]["source_citations"]
    assert citations
    assert citations[0]["source_span"]["kind"] == "message"
    assert citations[0]["source_span"]["message_id"] == "m1"
    assert primitive["metadata"]["source_provenance"]["source_tool"] == "claude"
    assert primitive["metadata"]["source_provenance"]["content_hash"].startswith("sha256:")


def test_human_validated_ai_artifact_extracts_durable_statement_not_approval_fragment():
    data = ingest_human_validated_ai_artifact_conversation()
    episode_id = data["episodes"][0]["id"]

    response = client().post(
        f"/episodes/{episode_id}/extract",
        headers=AUTH,
        json={
            "provider": "dev-rule",
            "store_primitives": True,
            "actor_context": {
                "Will": {
                    "name": "Will",
                    "authority": "Founder",
                    "authority_weight": 1.0,
                }
            },
        },
    )

    assert response.status_code == 200, response.text
    statements = [item["statement"] for item in response.json()["stored_primitives"]]
    assert not any(statement.startswith("Human-approved AI artifact:") for statement in statements)
    assert any(
        "~1.5 years formal PM experience" in statement
        and "consulting, exec coaching, L&D, keynotes, GTM, and CoS" in statement
        for statement in statements
    ), statements


def seed_decision_for_context(
    statement: str = "AI session continuity must work across Claude, ChatGPT, Codex, and local agents.",
    body: str = "Any tool can provide access, but BrainShare owns canonical memory and provenance.",
) -> str:
    response = client().post(
        "/primitives",
        headers=AUTH,
        json={
            "type": "decision",
            "statement": statement,
            "body": body,
            "conviction": 0.94,
            "source_episode_ids": ["ep_manual"],
            "supporting_messages": [1],
            "metadata": {
                "source_citations": [
                    {
                        "index": 1,
                        "speaker_role": "human",
                        "author_name": "Will",
                        "source_span": {
                            "kind": "message",
                            "source_tool": "claude",
                            "source_location": "claude_conv_123",
                            "message_id": "m1",
                            "turn_index": 1,
                        },
                    }
                ],
                "source_provenance": {
                    "source_tool": "claude",
                    "source_kind": "ai_conversation",
                    "source_location": "claude_conv_123",
                    "content_hash": "sha256:test",
                },
            },
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["primitive"], data
    return data["primitive"]["id"]


def test_context_assemble_returns_ai_session_payload_with_traceability():
    primitive_id = seed_decision_for_context()

    response = client().post(
        "/context/assemble",
        headers=AUTH,
        json={
            "query": "AI session continuity across Claude ChatGPT Codex local agents",
            "source_tool": "codex",
            "metadata": {
                "consumer_kind": "ai_session",
                "current_workspace": "WorkOS",
            },
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["context_summary"].startswith("## BrainShare Context")
    assert payload["ai_session_payload"]["consumer_tool"] == "codex"
    assert payload["ai_session_payload"]["consumer_kind"] == "ai_session"
    item = next(
        (
            context_item
            for context_item in payload["ai_session_payload"]["items"]
            if context_item["id"] == primitive_id
        ),
        None,
    )
    assert item is not None, payload["ai_session_payload"]["items"]
    assert item["statement"] == "AI session continuity must work across Claude, ChatGPT, Codex, and local agents."
    assert item["citations"][0]["source_span"]["source_tool"] == "claude"
    assert item["why_included"]


def test_context_why_included_uses_meaningful_matched_terms():
    seed_decision_for_context(
        statement="Career finance strategy should focus on runway, job search, and WorkOS momentum.",
        body="This memory exists to test meaningful retrieval explanations.",
    )

    response = client().post(
        "/context/assemble",
        headers=AUTH,
        json={
            "query": "What should a new AI session know about career and finance strategy?",
            "source_tool": "codex",
            "metadata": {"consumer_kind": "ai_session"},
        },
    )

    assert response.status_code == 200, response.text
    items = response.json()["ai_session_payload"]["items"]
    assert items
    why = items[0]["why_included"]
    assert "matched terms:" in why
    assert " a," not in why
    assert "about" not in why
    assert "and" not in why


if __name__ == "__main__":
    test_ai_conversation_episode_preserves_generic_provenance()
    test_ai_conversation_supporting_messages_have_source_spans()
    test_ai_conversation_episode_tracks_all_participants_without_making_ai_authoritative()
    test_extracted_primitives_preserve_source_spans_and_provenance()
    test_human_validated_ai_artifact_extracts_durable_statement_not_approval_fragment()
    test_context_assemble_returns_ai_session_payload_with_traceability()
    test_context_why_included_uses_meaningful_matched_terms()
