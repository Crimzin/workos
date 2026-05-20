import importlib.util
import io
import json
import tempfile
from importlib.machinery import SourceFileLoader
from argparse import Namespace
from contextlib import redirect_stdout
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLI_PATH = ROOT / "brainshare"
TEMP_DIRS = []

loader = SourceFileLoader("brainshare_cli", str(CLI_PATH))
spec = importlib.util.spec_from_loader("brainshare_cli", loader)
assert spec is not None and spec.loader is not None
brainshare_cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brainshare_cli)


def write_export(payload: dict) -> Path:
    directory = tempfile.TemporaryDirectory()
    TEMP_DIRS.append(directory)
    path = Path(directory.name) / "conversation-export.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_cli_normalizes_chatgpt_mapping_export_to_ai_conversation_payload():
    path = write_export(
        {
            "id": "chatgpt-conv-123",
            "title": "AI session continuity",
            "mapping": {
                "node-1": {
                    "message": {
                        "id": "msg-user",
                        "author": {"role": "user", "name": "Will"},
                        "content": {"parts": ["BrainShare should bridge Claude and Codex."]},
                        "create_time": "2026-05-04T10:00:00Z",
                    }
                },
                "node-2": {
                    "message": {
                        "id": "msg-assistant",
                        "author": {"role": "assistant"},
                        "content": {"parts": ["Use provider-neutral Episodes with provenance."]},
                        "create_time": "2026-05-04T10:01:00Z",
                    }
                },
            },
        }
    )

    payload = brainshare_cli.load_conversation_payload(
        Namespace(
            file=str(path),
            source_tool="chatgpt",
            conversation_id=None,
            title=None,
            project_name=None,
        )
    )

    assert payload["source_tool"] == "chatgpt"
    assert payload["conversation_id"] == "chatgpt-conv-123"
    assert payload["title"] == "AI session continuity"
    assert [message["role"] for message in payload["messages"]] == ["human", "ai"]
    assert payload["messages"][0]["id"] == "msg-user"
    assert payload["messages"][0]["author_name"] == "Will"
    assert payload["messages"][1]["content"] == "Use provider-neutral Episodes with provenance."


def test_cli_normalizes_claude_exporter_role_time_say_payload():
    path = write_export(
        {
            "metadata": {
                "title": "Career and Finance Strategy",
                "link": "https://claude.ai/chat/1e00e1f4-862f-4674-a2f7-61ad2b93adc1",
            },
            "messages": [
                {
                    "role": "Prompt",
                    "time": "2/23/2026, 10:45:48 PM",
                    "say": "We decided BrainShare should preserve source provenance.",
                },
                {
                    "role": "Response",
                    "time": "2/23/2026, 10:46:00 PM",
                    "say": "Future AI sessions should retrieve cited memory.",
                },
            ],
        }
    )

    payload = brainshare_cli.load_conversation_payload(
        Namespace(
            file=str(path),
            source_tool="claude",
            conversation_id=None,
            title=None,
            project_name=None,
        )
    )

    assert payload["title"] == "Career and Finance Strategy"
    assert payload["source_url"] == "https://claude.ai/chat/1e00e1f4-862f-4674-a2f7-61ad2b93adc1"
    assert [message["role"] for message in payload["messages"]] == ["human", "ai"]
    assert payload["messages"][0]["timestamp"] == "2/23/2026, 10:45:48 PM"
    assert payload["messages"][0]["content"] == "We decided BrainShare should preserve source provenance."


def test_context_command_can_print_ai_session_payload_json():
    observed = {}

    def fake_request_json(method, path, token, body=None, query=None, api=None):
        observed.update({"method": method, "path": path, "body": body})
        return {
            "context_summary": "## BrainShare Context",
            "ai_session_payload": {
                "consumer_tool": "brainshare-cli",
                "consumer_kind": "ai_session",
                "items": [{"id": "prim_1", "statement": "Use provenance."}],
            },
        }

    brainshare_cli.request_json = fake_request_json
    output = io.StringIO()
    with redirect_stdout(output):
        brainshare_cli.cmd_context(
            Namespace(
                query="provenance",
                max_items=5,
                include_low_conviction=False,
                json=False,
                ai_session_json=True,
                token="token",
                api="http://brainshare.test",
            )
        )

    printed = json.loads(output.getvalue())
    assert observed["path"] == "/context/assemble"
    assert observed["body"]["metadata"]["consumer_kind"] == "ai_session"
    assert printed["items"][0]["statement"] == "Use provenance."


def test_ingest_conversation_parser_accepts_tool_agnostic_source_names():
    parser = brainshare_cli.build_parser()
    args = parser.parse_args(
        [
            "ingest-conversation",
            "conversation-export.json",
            "--source-tool",
            "codex",
        ]
    )
    assert args.source_tool == "codex"


def test_synthesize_conversation_command_posts_to_synthesis_endpoint():
    observed = {}

    def fake_request_json(method, path, token, body=None, query=None, api=None):
        observed.update({"method": method, "path": path, "body": body})
        return {
            "synthesis": {
                "conversation_brief": {"summary": "Will is prioritizing Anthropic."},
                "topics": [{"name": "Anthropic career path", "summary": "Primary path."}],
            }
        }

    brainshare_cli.request_json = fake_request_json
    output = io.StringIO()
    with redirect_stdout(output):
        brainshare_cli.cmd_synthesize_conversation(
            Namespace(
                conversation_id="claude:career-finance-test",
                provider="dev-rule",
                no_store_synthesis=False,
                store_primitives=False,
                json=False,
                token="token",
                api="http://brainshare.test",
            )
        )

    assert observed["method"] == "POST"
    assert observed["path"] == "/conversations/claude:career-finance-test/synthesize"
    assert observed["body"] == {
        "provider": "dev-rule",
        "store_synthesis": True,
        "store_primitives": False,
    }
    assert "Anthropic career path" in output.getvalue()


if __name__ == "__main__":
    test_cli_normalizes_chatgpt_mapping_export_to_ai_conversation_payload()
    test_cli_normalizes_claude_exporter_role_time_say_payload()
    test_context_command_can_print_ai_session_payload_json()
    test_ingest_conversation_parser_accepts_tool_agnostic_source_names()
    test_synthesize_conversation_command_posts_to_synthesis_endpoint()
