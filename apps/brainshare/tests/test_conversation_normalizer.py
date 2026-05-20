import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

from conversation_normalizer import normalize_conversation_file  # noqa: E402


TEMP_DIRS = []


def write_file(name: str, content: str) -> Path:
    directory = tempfile.TemporaryDirectory()
    TEMP_DIRS.append(directory)
    path = Path(directory.name) / name
    path.write_text(content, encoding="utf-8")
    return path


def test_json_normalizer_finds_nested_turns_without_known_top_level_shape():
    path = write_file(
        "nested-export.json",
        """
        {
          "export": {
            "conversation": {
              "name": "Nested conversation",
              "permalink": "https://example.test/conversation/123",
              "turns": [
                {"speaker": "Me", "body": "BrainShare should normalize arbitrary exports.", "created": "2026-05-05T10:00:00Z"},
                {"speaker": "Assistant", "body": "Use a scored recursive turn detector.", "created": "2026-05-05T10:01:00Z"}
              ]
            }
          }
        }
        """,
    )

    payload = normalize_conversation_file(path, source_tool="unknown_ai")

    assert payload["title"] == "Nested conversation"
    assert payload["source_url"] == "https://example.test/conversation/123"
    assert [message["role"] for message in payload["messages"]] == ["human", "ai"]
    assert payload["messages"][0]["content"] == "BrainShare should normalize arbitrary exports."
    assert payload["metadata"]["normalizer"]["confidence"] >= 0.6


def test_json_normalizer_derives_conversation_id_from_source_url():
    path = write_file(
        "claude-export.json",
        """
        {
          "metadata": {
            "title": "Career and Finance Strategy",
            "link": "https://claude.ai/chat/1e00e1f4-862f-4674-a2f7-61ad2b93adc1"
          },
          "messages": [
            {"role": "Prompt", "time": "2026-05-05T10:00:00Z", "say": "Use BrainShare for continuity."},
            {"role": "Response", "time": "2026-05-05T10:01:00Z", "say": "Preserve the conversation id across chunks."}
          ]
        }
        """,
    )

    payload = normalize_conversation_file(path, source_tool="claude")

    assert payload["conversation_id"] == "claude:1e00e1f4-862f-4674-a2f7-61ad2b93adc1"


def test_markdown_normalizer_extracts_role_labeled_transcript():
    path = write_file(
        "transcript.md",
        """
        # Roadmap handoff

        Human: BrainShare should ingest Claude and ChatGPT conversations first.

        Assistant: Agreed. Discord should be second.
        """,
    )

    payload = normalize_conversation_file(path, source_tool="claude")

    assert payload["title"] == "Roadmap handoff"
    assert [message["role"] for message in payload["messages"]] == ["human", "ai"]
    assert "Claude and ChatGPT" in payload["messages"][0]["content"]


def test_html_normalizer_extracts_role_labeled_transcript_text():
    path = write_file(
        "transcript.html",
        """
        <html>
          <head><title>Context bridge</title></head>
          <body>
            <div><strong>User:</strong> Pass context from Claude to Codex.</div>
            <div><strong>Claude:</strong> Preserve citations and provenance.</div>
          </body>
        </html>
        """,
    )

    payload = normalize_conversation_file(path, source_tool="claude")

    assert payload["title"] == "Context bridge"
    assert [message["role"] for message in payload["messages"]] == ["human", "ai"]
    assert payload["messages"][1]["content"] == "Preserve citations and provenance."


def test_normalizer_explains_unsupported_content():
    path = write_file("notes.txt", "This is just a note without speakers.")

    try:
        normalize_conversation_file(path, source_tool="other_ai")
    except SystemExit as exc:
        assert "No recognizable conversation turns" in str(exc)
    else:
        raise AssertionError("Expected unsupported content to raise SystemExit")


if __name__ == "__main__":
    test_json_normalizer_finds_nested_turns_without_known_top_level_shape()
    test_json_normalizer_derives_conversation_id_from_source_url()
    test_markdown_normalizer_extracts_role_labeled_transcript()
    test_html_normalizer_extracts_role_labeled_transcript_text()
    test_normalizer_explains_unsupported_content()
