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
from conversation_synthesis import claude_synthesis_prompt  # noqa: E402


AUTH = {"Authorization": "Bearer bs_team_abc123"}


def client() -> TestClient:
    return TestClient(app)


def ingest_career_finance_conversation() -> str:
    response = client().post(
        "/sources/ai/conversations",
        headers=AUTH,
        json={
            "source_tool": "claude",
            "conversation_id": "claude:career-finance-test",
            "title": "Career and Finance Strategy",
            "source_url": "https://claude.ai/chat/career-finance-test",
            "messages": [
                {
                    "id": "m1",
                    "role": "human",
                    "author_name": "Will",
                    "content": (
                        "I want Anthropic to remain the primary path. I am looking at roles "
                        "at the intersection of AI, education, product, and human performance."
                    ),
                    "timestamp": "2026-04-16T20:00:00Z",
                },
                {
                    "id": "m2",
                    "role": "assistant",
                    "content": (
                        "The Anthropic education product role is a strong fit. The main risk "
                        "is the formal PM title gap, so you should use warm referrals and build "
                        "an AI-native education prototype."
                    ),
                    "timestamp": "2026-04-16T20:01:00Z",
                },
                {
                    "id": "m3",
                    "role": "human",
                    "author_name": "Will",
                    "content": (
                        "I agree. I only did PM at Vega for ~1.5 years, then shifted into "
                        "consulting, exec coaching, L&D, keynotes, GTM, and CoS work. "
                        "I've always felt like a product guy at heart."
                    ),
                    "timestamp": "2026-04-16T20:02:00Z",
                },
                {
                    "id": "m4",
                    "role": "assistant",
                    "content": (
                        "Titan could be useful as an option, but the likely shape is GTM and ops. "
                        "That risks pulling you back into work you are trying to leave."
                    ),
                    "timestamp": "2026-04-20T13:33:00Z",
                },
                {
                    "id": "m5",
                    "role": "human",
                    "author_name": "Will",
                    "content": (
                        "Makes sense. I will keep Titan warm but I do not want it to distract "
                        "from Anthropic."
                    ),
                    "timestamp": "2026-04-20T13:35:00Z",
                },
                {
                    "id": "m6",
                    "role": "human",
                    "author_name": "Will",
                    "content": (
                        "Financial runway matters here. I need consulting revenue, but I also "
                        "need to build WorkOS, BrainShare, and Swarm."
                    ),
                    "timestamp": "2026-04-21T00:20:00Z",
                },
                {
                    "id": "m7",
                    "role": "human",
                    "author_name": "Will",
                    "content": (
                        "Even if I get the Anthropic offer by September, I will regret it if "
                        "I do not work on BrainShare, Swarm, and WorkOS. It is all one thing."
                    ),
                    "timestamp": "2026-04-21T00:35:00Z",
                },
            ],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["conversation_id"]


def synthesize_career_conversation() -> dict:
    conversation_id = ingest_career_finance_conversation()
    response = client().post(
        f"/conversations/{conversation_id}/synthesize",
        headers=AUTH,
        json={
            "provider": "dev-rule",
            "store_synthesis": True,
            "store_primitives": False,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_conversation_synthesis_returns_topic_map_brief_and_why_chain():
    payload = synthesize_career_conversation()

    synthesis = payload["synthesis"]
    assert synthesis["conversation_id"] == "claude:career-finance-test"
    assert "Anthropic" in synthesis["conversation_brief"]["summary"]
    assert "raw snippet" not in synthesis["conversation_brief"]["summary"].lower()

    topic_names = {topic["name"] for topic in synthesis["topics"]}
    assert {
        "Anthropic career path",
        "Titan opportunity",
        "Financial runway",
        "WorkOS / BrainShare / Swarm build",
    }.issubset(topic_names)

    statements = [primitive["statement"] for primitive in synthesis["primitives"]]
    assert any("prioritizing Anthropic as the primary high-fit path" in statement for statement in statements)
    assert any("~1.5 years formal PM title experience" in statement for statement in statements)
    assert any("Titan is useful as an option" in statement for statement in statements)
    assert any("WorkOS, BrainShare, and Swarm" in statement for statement in statements)
    assert not any(statement.startswith("Human-approved AI artifact:") for statement in statements)

    chain_nodes = synthesis["why_chains"][0]["nodes"]
    assert [node["type"] for node in chain_nodes] == ["goal", "assumption", "risk", "action"]
    assert "find high-fit AI/product work" in chain_nodes[0]["statement"]
    assert "formal PM title gap" in chain_nodes[2]["statement"]


def test_context_assembly_prefers_synthesis_briefing_over_primitive_blob():
    synthesize_career_conversation()

    response = client().post(
        "/context/assemble",
        headers=AUTH,
        json={
            "query": "What should a new AI session know about my career and finance strategy?",
            "source_tool": "codex",
            "metadata": {"consumer_kind": "ai_session"},
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()["ai_session_payload"]
    assert payload["briefing"]["summary"].startswith("Will is prioritizing Anthropic")
    assert [topic["name"] for topic in payload["topics"][:2]]
    assert payload["why_chains"]
    assert payload["items"]
    assert "citations" in payload["items"][0]
    assert "source_provenance" in payload["items"][0]


def test_claude_synthesis_prompt_requests_freeform_starting_context_memo():
    prompt = claude_synthesis_prompt(
        "claude:recipes-and-feelings",
        "Recipes and feelings",
        [
            {
                "id": "ep_1",
                "source_location": "conversation#chunk-1",
                "raw_content": "Will: I am testing pasta sauces and also noticing I cook when anxious.",
            }
        ],
    )

    assert "starting_context_memo_markdown" in prompt
    assert "Choose the memo structure freely" in prompt
    assert "Do not expose BrainShare extraction categories" in prompt
    assert "recipes" in prompt
    assert "emotional reflection" in prompt
    assert "creative writing" in prompt


if __name__ == "__main__":
    test_conversation_synthesis_returns_topic_map_brief_and_why_chain()
    test_context_assembly_prefers_synthesis_briefing_over_primitive_blob()
    test_claude_synthesis_prompt_requests_freeform_starting_context_memo()
