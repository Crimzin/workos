# AI Session Continuity v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove BrainShare's first simple usable loop: context from one AI session can be retrieved by another AI session through a source-preserving, tool-agnostic Episode and context payload contract.

**Architecture:** Keep BrainShare provider-neutral. Source adapters normalize Claude/ChatGPT/Codex-style transcripts into generic Episodes with strong provenance; extraction stores primitives with citations; context assembly returns compact AI-session payloads consumable by MCP, CLI, REST, or future connectors. WorkOS UI/writeback stays out of this implementation except for roadmap documentation.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic, direct-run Python tests with FastAPI `TestClient`, existing BrainShare CLI, existing MCP server, `uv run`.

---

## File Structure

- Modify `apps/brainshare/app/app.py`
  - Add provider-neutral source/provenance helpers.
  - Harden AI conversation Episode metadata with content hash, source spans, permissions/scope metadata, and stable source pointers.
  - Add an AI-session context response shape on `/context/assemble`.
- Modify `apps/brainshare/brainshare`
  - Improve `ingest-conversation` JSON normalization for Claude/ChatGPT/Codex-style exports.
  - Add `context --format ai-session` output for compact AI-session preambles.
- Modify `apps/brainshare/mcp/mcp-brainshare-server.py`
  - Add `brainshare_get_context` tool backed by `/context/assemble`.
  - Keep existing tools for backward compatibility.
- Modify `apps/brainshare/api-spec.md`
  - Document provenance-preserving Episodes and `brainshare_get_context`.
- Modify `ai-ecosystem-roadmap-v1.2.md`
  - Mark completed `2.2.5` items only after verification passes.
- Create `apps/brainshare/tests/test_ai_session_continuity.py`
  - Direct-run tests for provenance, transcript normalization, context payload, and MCP/CLI-compatible output.

---

### Task 1: Add Failing Tests for Source-Preserving AI Conversation Episodes

**Files:**
- Create: `apps/brainshare/tests/test_ai_session_continuity.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/brainshare/tests/test_ai_session_continuity.py` with:

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
    assert provenance["content_hash"].startswith("sha256:")
    assert provenance["message_count"] == 2
    assert provenance["actor_ids"] == ["Will"]
    assert provenance["timestamp_start"] == "2026-05-04T10:00:00Z"
    assert provenance["timestamp_end"] == "2026-05-04T10:01:00Z"


def test_ai_conversation_supporting_messages_have_source_spans():
    data = ingest_ai_conversation()
    supporting = data["episodes"][0]["metadata"]["supporting_messages"]

    assert supporting[0]["index"] == 1
    assert supporting[0]["source_message_index"] == 1
    assert supporting[0]["message_id"] == "m1"
    assert supporting[0]["speaker_role"] == "human"
    assert supporting[0]["author_name"] == "Will"
    assert supporting[0]["source_span"]["kind"] == "message"
    assert supporting[0]["source_span"]["message_id"] == "m1"
    assert supporting[0]["source_span"]["turn_index"] == 1
    assert supporting[0]["attachments"] == [{"name": "roadmap.md", "content_type": "text/markdown"}]


if __name__ == "__main__":
    test_ai_conversation_episode_preserves_generic_provenance()
    test_ai_conversation_supporting_messages_have_source_spans()
```

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
```

Expected: FAIL because `metadata.provenance` and `source_span` are not fully present yet.

---

### Task 2: Implement Generic Provenance Helpers for AI Conversation Episodes

**Files:**
- Modify: `apps/brainshare/app/app.py`

- [ ] **Step 1: Add provenance helpers after `body_to_text`**

Add:

```python
def content_hash(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def compact_metadata_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [compact_metadata_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): compact_metadata_value(item) for key, item in value.items()}
    return str(value)


def source_provenance(
    *,
    source_tool: str,
    source_kind: str,
    source_location: str,
    raw_content: str,
    actor_ids: list[str],
    timestamp_start: Optional[str],
    timestamp_end: Optional[str],
    message_count: Optional[int],
    permission_scope: Optional[str] = None,
    attention_scope: Optional[str] = None,
    source_url: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "source_tool": source_tool,
        "source_kind": source_kind,
        "source_location": source_location,
        "source_url": source_url,
        "content_hash": content_hash(raw_content),
        "actor_ids": actor_ids,
        "timestamp_start": timestamp_start,
        "timestamp_end": timestamp_end,
        "message_count": message_count,
        "permission_scope": permission_scope,
        "attention_scope": attention_scope,
    }
```

- [ ] **Step 2: Update `ai_conversation_chunk_to_episode`**

Replace the direct `raw_content=format_ai_conversation_messages(chunk_messages)` call with local variables:

```python
    raw_content = format_ai_conversation_messages(chunk_messages)
    permission_scope = payload.metadata.get("permission_scope")
    attention_scope = payload.metadata.get("attention_scope")
```

Then use `raw_content=raw_content` in `EpisodeCreate`.

In `metadata`, add:

```python
            "permission_scope": permission_scope,
            "attention_scope": attention_scope,
            "provenance": source_provenance(
                source_tool=payload.source_tool,
                source_kind="ai_conversation",
                source_location=source_location,
                raw_content=raw_content,
                actor_ids=actors,
                timestamp_start=timestamps[0] if timestamps else None,
                timestamp_end=timestamps[-1] if timestamps else None,
                message_count=len(chunk_messages),
                permission_scope=permission_scope,
                attention_scope=attention_scope,
                source_url=payload.source_url,
            ),
```

Inside each supporting message dict, add:

```python
                    "source_span": {
                        "kind": "message",
                        "source_tool": payload.source_tool,
                        "source_location": source_location,
                        "message_id": message.id or f"turn_{original_index}",
                        "turn_index": chunk_indexed,
                        "source_message_index": original_index,
                    },
```

- [ ] **Step 3: Verify tests pass**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
```

Expected: PASS.

- [ ] **Step 4: Run existing target-resolution tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: PASS.

---

### Task 3: Add Failing Tests for Source-Generic Primitive Citations

**Files:**
- Modify: `apps/brainshare/tests/test_ai_session_continuity.py`

- [ ] **Step 1: Add primitive extraction citation test**

Append:

```python
def test_extracted_primitives_preserve_source_spans_and_provenance():
    data = ingest_ai_conversation()
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
    primitive = stored[0]
    citations = primitive["metadata"]["source_citations"]
    assert citations
    assert citations[0]["source_span"]["kind"] == "message"
    assert citations[0]["source_span"]["message_id"] == "m1"
    assert primitive["metadata"]["source_provenance"]["source_tool"] == "claude"
    assert primitive["metadata"]["source_provenance"]["content_hash"].startswith("sha256:")
```

Add the function to the `__main__` runner.

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
```

Expected: FAIL because primitive metadata does not yet include `source_provenance`.

---

### Task 4: Preserve Episode Provenance on Stored Primitives

**Files:**
- Modify: `apps/brainshare/app/app.py`

- [ ] **Step 1: Update `source_citations_for_episode`**

Ensure each citation carries source span and provenance by returning source message records with existing fields intact:

```python
def source_citations_for_episode(
    episode: dict[str, Any],
    supporting_messages: list[int],
) -> list[dict[str, Any]]:
    by_index = {
        int(item.get("index")): item
        for item in episode.get("metadata", {}).get("supporting_messages", [])
        if item.get("index") is not None
    }
    citations = []
    for index in supporting_messages:
        source = by_index.get(index)
        if source:
            citations.append(source)
        else:
            citations.append({"index": index})
    return citations
```

- [ ] **Step 2: Update `extracted_to_primitive_create` metadata**

In the metadata dict, add:

```python
            "source_provenance": episode.get("metadata", {}).get("provenance", {}),
```

- [ ] **Step 3: Verify tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: both PASS.

---

### Task 5: Add Failing Tests for AI-Session Context Payload Shape

**Files:**
- Modify: `apps/brainshare/tests/test_ai_session_continuity.py`

- [ ] **Step 1: Add context assembly test**

Append:

```python
def seed_decision_for_context() -> None:
    response = client().post(
        "/primitives",
        headers=AUTH,
        json={
            "type": "decision",
            "statement": "BrainShare memory must be provider-neutral.",
            "body": "Any tool can provide access, but BrainShare owns canonical memory.",
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


def test_context_assemble_returns_ai_session_payload_with_traceability():
    seed_decision_for_context()

    response = client().post(
        "/context/assemble",
        headers=AUTH,
        json={
            "query": "provider-neutral memory",
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
    assert payload["ai_session_payload"]["items"][0]["statement"] == "BrainShare memory must be provider-neutral."
    assert payload["ai_session_payload"]["items"][0]["citations"][0]["source_span"]["source_tool"] == "claude"
    assert payload["ai_session_payload"]["items"][0]["why_included"]
```

Add the function to `__main__`.

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
```

Expected: FAIL because `/context/assemble` does not include `ai_session_payload`.

---

### Task 6: Add AI-Session Payload to Context Assembly

**Files:**
- Modify: `apps/brainshare/app/app.py`

- [ ] **Step 1: Add helper after `assemble_context_payload` support helpers**

Add before `assemble_context_payload`:

```python
def why_included_for_context_item(
    primitive: dict[str, Any],
    query: str,
    relevance: float,
) -> list[str]:
    reasons = []
    if query and primitive_matches_query(primitive, query):
        reasons.append("query_match")
    if float(primitive.get("conviction") or 0) >= 0.8:
        reasons.append("high_conviction")
    if relevance >= 0.8:
        reasons.append("high_relevance")
    if not reasons:
        reasons.append("available_context")
    return reasons
```

- [ ] **Step 2: Update context item construction**

In `assemble_context_payload`, after `metadata = primitive.get("metadata") or {}`, compute:

```python
        relevance = primitive_relevance_score(primitive, payload.query)
```

Use `relevance` for the existing `"relevance"` field.

- [ ] **Step 3: Add `ai_session_payload` to the return object**

Before the final return, build:

```python
    ai_session_items = [
        {
            "id": item["id"],
            "type": item["type"],
            "statement": item["statement"],
            "status": item["status"],
            "conviction": item["conviction"],
            "threshold": item["threshold"],
            "citations": item["source_citations"],
            "source_episode_ids": item["source_episode_ids"],
            "why_included": item["why_included"],
            "created_at": item["created_at"],
        }
        for item in context_items
    ]
```

Add to each `context_items.append` dict:

```python
                "source_provenance": metadata.get("source_provenance", {}),
                "why_included": why_included_for_context_item(
                    primitive,
                    payload.query,
                    relevance,
                ),
```

Add to the returned dict:

```python
        "ai_session_payload": {
            "consumer_tool": payload.source_tool,
            "consumer_kind": payload.metadata.get("consumer_kind", "ai_session"),
            "query": payload.query,
            "items": ai_session_items,
            "instructions": "Use this BrainShare context as durable memory. Preserve citations when relying on a decision, assumption, or standard.",
        },
```

- [ ] **Step 4: Verify tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: both PASS.

---

### Task 7: Add Failing CLI Tests for Transcript Normalization and AI-Session Output

**Files:**
- Modify: `apps/brainshare/tests/test_ai_session_continuity.py`
- Modify: `apps/brainshare/brainshare`

- [ ] **Step 1: Add import path for CLI module in test file**

In `apps/brainshare/tests/test_ai_session_continuity.py`, before importing `app`, add:

```python
import importlib.util

CLI_PATH = ROOT / "brainshare"
spec = importlib.util.spec_from_file_location("brainshare_cli", CLI_PATH)
brainshare_cli = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(brainshare_cli)
```

- [ ] **Step 2: Add CLI normalization tests**

Append:

```python
class Args:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def test_cli_normalizes_chatgpt_mapping_export(tmp_path: Path):
    export = {
        "id": "chatgpt_conv",
        "title": "BrainShare continuity",
        "mapping": {
            "node1": {
                "id": "node1",
                "message": {
                    "id": "msg_user",
                    "author": {"role": "user", "name": "Will"},
                    "content": {"parts": ["Use provider-neutral Episodes."]},
                    "create_time": 1777900000,
                },
            },
            "node2": {
                "id": "node2",
                "message": {
                    "id": "msg_assistant",
                    "author": {"role": "assistant"},
                    "content": {"parts": ["That keeps BrainShare tool-agnostic."]},
                    "create_time": 1777900060,
                },
            },
        },
    }
    path = tmp_path / "chatgpt-export.json"
    path.write_text(json.dumps(export), encoding="utf-8")

    payload = brainshare_cli.load_conversation_payload(
        Args(
            file=str(path),
            source_tool="chatgpt",
            conversation_id=None,
            title=None,
            project_name="WorkOS",
        )
    )

    assert payload["source_tool"] == "chatgpt"
    assert payload["conversation_id"] == "chatgpt_conv"
    assert payload["title"] == "BrainShare continuity"
    assert payload["messages"][0]["role"] == "human"
    assert payload["messages"][0]["content"] == "Use provider-neutral Episodes."
    assert payload["messages"][1]["role"] == "ai"
    assert payload["metadata"]["source_format"] == "chatgpt_mapping"
```

Add the function to `__main__`.

- [ ] **Step 3: Add CLI context formatting test**

Append:

```python
def test_cli_formats_ai_session_payload():
    result = {
        "context_summary": "## BrainShare Context\n- Decision here",
        "ai_session_payload": {
            "items": [
                {
                    "type": "decision",
                    "statement": "BrainShare memory must be provider-neutral.",
                    "conviction": 0.94,
                    "threshold": {"label": "high_confidence"},
                    "citations": [
                        {
                            "source_span": {
                                "source_tool": "claude",
                                "source_location": "claude_conv_123",
                                "message_id": "m1",
                            }
                        }
                    ],
                    "why_included": ["query_match", "high_conviction"],
                }
            ]
        },
    }

    text = brainshare_cli.format_ai_session_context(result)
    assert "BrainShare Context for AI Session" in text
    assert "BrainShare memory must be provider-neutral." in text
    assert "Source: claude claude_conv_123 m1" in text
```

Add the function to `__main__`.

- [ ] **Step 4: Run tests to verify red**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
```

Expected: FAIL because `json` may need import in test, ChatGPT mapping normalization may not work, `source_format` is missing, and `format_ai_session_context` is missing.

---

### Task 8: Improve CLI Conversation Ingestion and AI-Session Context Output

**Files:**
- Modify: `apps/brainshare/brainshare`
- Modify: `apps/brainshare/tests/test_ai_session_continuity.py` if only test imports need correction

- [ ] **Step 1: Add helper imports**

Ensure the test file imports `json` if not already present:

```python
import json
```

- [ ] **Step 2: Add CLI helpers after `print_json`**

In `apps/brainshare/brainshare`, add:

```python
def format_timestamp(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        from datetime import datetime, timezone

        return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def message_from_chatgpt_mapping_node(node: dict[str, Any]) -> Optional[dict[str, Any]]:
    message = node.get("message")
    if not isinstance(message, dict):
        return None
    author = message.get("author") or {}
    content = message.get("content")
    if isinstance(content, dict):
        parts = content.get("parts")
        if isinstance(parts, list):
            content = "\n".join(str(part) for part in parts if part)
    if not content:
        return None
    return {
        "id": message.get("id") or node.get("id"),
        "role": author.get("role") or "user",
        "author_name": author.get("name"),
        "content": content,
        "timestamp": message.get("create_time"),
        "metadata": {"mapping_node_id": node.get("id")},
    }


def format_ai_session_context(result: dict[str, Any]) -> str:
    payload = result.get("ai_session_payload") or {}
    items = payload.get("items") or []
    lines = ["# BrainShare Context for AI Session", ""]
    if result.get("context_summary"):
        lines.append(result["context_summary"])
        lines.append("")
    for item in items:
        threshold = (item.get("threshold") or {}).get("label", "unknown")
        lines.append(
            f"- {item.get('statement')} "
            f"({item.get('type')}, {threshold}, conviction {item.get('conviction')})"
        )
        for citation in item.get("citations") or []:
            span = citation.get("source_span") or {}
            source_bits = [
                str(span.get("source_tool") or "").strip(),
                str(span.get("source_location") or "").strip(),
                str(span.get("message_id") or "").strip(),
            ]
            source = " ".join(bit for bit in source_bits if bit)
            if source:
                lines.append(f"  Source: {source}")
        why = item.get("why_included") or []
        if why:
            lines.append(f"  Why included: {', '.join(why)}")
    return "\n".join(lines).strip()
```

- [ ] **Step 3: Update `load_conversation_payload`**

Replace the `messages = (...)` block with logic:

```python
        source_format = "generic_json"
        if isinstance(raw.get("mapping"), dict):
            source_format = "chatgpt_mapping"
            messages = [
                message
                for node in raw["mapping"].values()
                if isinstance(node, dict)
                for message in [message_from_chatgpt_mapping_node(node)]
                if message
            ]
        else:
            messages = raw.get("messages") or raw.get("turns") or []
```

Ensure the returned metadata includes:

```python
            "source_format": source_format,
```

When building normalized messages, use:

```python
        timestamp = format_timestamp(message.get("timestamp") or message.get("create_time"))
```

- [ ] **Step 4: Update `cmd_context`**

If `args.format == "ai-session"`, print `format_ai_session_context(result)`.

Add parser argument:

```python
    context.add_argument("--format", choices=["summary", "ai-session"], default="summary")
```

- [ ] **Step 5: Verify tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: both PASS.

---

### Task 9: Add Failing MCP Tool Tests for `brainshare_get_context`

**Files:**
- Modify: `apps/brainshare/tests/test_ai_session_continuity.py`
- Modify: `apps/brainshare/mcp/mcp-brainshare-server.py`

- [ ] **Step 1: Add import path for MCP module**

In test file:

```python
MCP_PATH = ROOT / "mcp" / "mcp-brainshare-server.py"
mcp_spec = importlib.util.spec_from_file_location("brainshare_mcp", MCP_PATH)
brainshare_mcp = importlib.util.module_from_spec(mcp_spec)
assert mcp_spec.loader is not None
mcp_spec.loader.exec_module(brainshare_mcp)
```

- [ ] **Step 2: Add MCP tool definition test**

Append:

```python
def test_mcp_lists_brainshare_get_context_tool():
    import asyncio

    tools = asyncio.run(brainshare_mcp.handle_list_tools())
    names = {tool.name for tool in tools}
    assert "brainshare_get_context" in names
    tool = next(tool for tool in tools if tool.name == "brainshare_get_context")
    assert "query" in tool.inputSchema["properties"]
    assert "source_tool" in tool.inputSchema["properties"]
```

Add function to `__main__`.

- [ ] **Step 3: Run tests to verify red**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
```

Expected: FAIL because MCP tool is not listed yet.

---

### Task 10: Implement MCP `brainshare_get_context`

**Files:**
- Modify: `apps/brainshare/mcp/mcp-brainshare-server.py`

- [ ] **Step 1: Add tool definition**

In `handle_list_tools`, add:

```python
        Tool(
            name="brainshare_get_context",
            description="Get BrainShare context for the current AI session, with citations and conviction labels",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The current task, question, or topic needing durable context",
                    },
                    "source_tool": {
                        "type": "string",
                        "description": "The consuming tool, such as claude, codex, chatgpt, or ide_agent",
                        "default": "mcp",
                    },
                    "max_items": {
                        "type": "number",
                        "description": "Maximum context items to return",
                        "default": 10,
                    },
                    "include_low_conviction": {
                        "type": "boolean",
                        "description": "Whether to include low-conviction items",
                        "default": False,
                    },
                },
                "required": ["query"],
            },
        ),
```

- [ ] **Step 2: Add formatter helper**

Before `handle_call_tool`, add:

```python
def format_context_tool_response(result: dict[str, Any]) -> str:
    payload = result.get("ai_session_payload") or {}
    lines = ["BrainShare Context"]
    for item in payload.get("items") or result.get("context_items") or []:
        threshold = (item.get("threshold") or {}).get("label", "unknown")
        lines.append(
            f"- {item.get('statement')} "
            f"({item.get('type')}, {threshold}, conviction {item.get('conviction')})"
        )
        citations = item.get("citations") or item.get("source_citations") or []
        for citation in citations[:2]:
            span = citation.get("source_span") or {}
            source = " ".join(
                str(part)
                for part in [
                    span.get("source_tool"),
                    span.get("source_location"),
                    span.get("message_id"),
                ]
                if part
            )
            if source:
                lines.append(f"  Source: {source}")
    return "\n".join(lines)
```

- [ ] **Step 3: Add call handler**

Before the existing `brainshare_analyze` branch:

```python
            if name == "brainshare_get_context":
                response = await client.post(
                    f"{BRAINSHARE_API}/context/assemble",
                    headers=headers,
                    json={
                        "query": arguments["query"],
                        "max_items": arguments.get("max_items", 10),
                        "include_low_conviction": arguments.get("include_low_conviction", False),
                        "source_tool": arguments.get("source_tool", "mcp"),
                        "metadata": {"consumer_kind": "ai_session"},
                    },
                )
                result = response.json()
                if result.get("success"):
                    return [TextContent(type="text", text=format_context_tool_response(result))]
                return [TextContent(type="text", text=f"Error: {result.get('error', 'Unknown error')}")]
```

Change the following `if name == "brainshare_analyze":` to `elif name == "brainshare_analyze":`.

- [ ] **Step 4: Verify tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: both PASS.

---

### Task 11: Update API Docs and Roadmap

**Files:**
- Modify: `apps/brainshare/api-spec.md`
- Modify: `ai-ecosystem-roadmap-v1.2.md`

- [ ] **Step 1: Document provenance-preserving Episode contract**

In `apps/brainshare/api-spec.md`, under the `POST /sources/ai/conversations` section, add:

```markdown
Episodes are source-generic but provenance-preserving. `metadata.provenance` includes `source_tool`, `source_kind`, `source_location`, `source_url`, `content_hash`, `actor_ids`, timestamps, message count, permission scope, and attention scope. Each supporting message includes a `source_span` that can trace a primitive back to an exact turn/message.
```

- [ ] **Step 2: Document `ai_session_payload`**

Under `POST /context/assemble`, add:

```markdown
Responses also include `ai_session_payload`, a tool-agnostic context object designed for MCP/CLI/API consumers. It contains compact items with statement, type, conviction, threshold, citations, source episode ids, and `why_included` reasons.
```

- [ ] **Step 3: Document MCP `brainshare_get_context`**

In the MCP function definitions section, add:

```markdown
### brainshare_get_context
Returns BrainShare context for the current AI session with citations and conviction labels.

```json
{
  "name": "brainshare_get_context",
  "description": "Get BrainShare context for the current AI session, with citations and conviction labels",
  "parameters": {
    "query": {"type": "string", "description": "The current task, question, or topic"},
    "source_tool": {"type": "string", "description": "Consuming tool name"},
    "max_items": {"type": "number", "default": 10},
    "include_low_conviction": {"type": "boolean", "default": false}
  }
}
```
```

- [ ] **Step 4: Mark roadmap items**

In `2.2.5`, mark complete only:

```markdown
- [x] Preserve provenance on every Episode and primitive...
- [x] Build robust manual AI conversation ingestion for Claude/ChatGPT/Codex-style transcripts through CLI/API: JSON first...
- [x] Upgrade context assembly from primitive-relevance v0 toward a tool-agnostic AI-session payload...
- [x] Expose traceability mode 1 through MCP/tool response...
```

Leave unchecked:
- generic Episode contract hardening across all adapters
- Markdown/HTML/export variants if not implemented
- dogfood cross-session continuity
- WorkOS UI contract

- [ ] **Step 5: Verify docs diff**

Run:

```bash
git diff -- apps/brainshare/api-spec.md ai-ecosystem-roadmap-v1.2.md
```

Expected: only the documented sections changed.

---

### Task 12: Final Verification

**Files:**
- Read/verify all touched files.

- [ ] **Step 1: Run AI session continuity tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_ai_session_continuity.py
```

Expected: exit code `0`.

- [ ] **Step 2: Run target-resolution regression tests**

Run:

```bash
uv run --project apps/brainshare python apps/brainshare/tests/test_target_resolution.py
```

Expected: exit code `0`.

- [ ] **Step 3: Run JSON-backend import smoke**

Run:

```bash
/bin/zsh -lc 'BRAINSHARE_STORE_BACKEND=json uv run --project apps/brainshare python -c "import sys; sys.path.insert(0, '\''apps/brainshare/app'\''); import app; print('\''brainshare import ok'\'')"'
```

Expected:

```text
brainshare import ok
```

- [ ] **Step 4: Run diff whitespace validation**

Run:

```bash
git diff --check -- apps/brainshare/app/app.py apps/brainshare/brainshare apps/brainshare/mcp/mcp-brainshare-server.py apps/brainshare/tests/test_ai_session_continuity.py apps/brainshare/tests/test_target_resolution.py apps/brainshare/api-spec.md ai-ecosystem-roadmap-v1.2.md docs/superpowers/plans/2026-05-04-ai-session-continuity-v0.md
```

Expected: exit code `0` and no output.

- [ ] **Step 5: Review scoped diff**

Run:

```bash
git diff --stat -- apps/brainshare/app/app.py apps/brainshare/brainshare apps/brainshare/mcp/mcp-brainshare-server.py apps/brainshare/tests/test_ai_session_continuity.py apps/brainshare/tests/test_target_resolution.py apps/brainshare/api-spec.md ai-ecosystem-roadmap-v1.2.md docs/superpowers/plans/2026-05-04-ai-session-continuity-v0.md
git diff -- apps/brainshare/app/app.py apps/brainshare/brainshare apps/brainshare/mcp/mcp-brainshare-server.py apps/brainshare/tests/test_ai_session_continuity.py apps/brainshare/api-spec.md ai-ecosystem-roadmap-v1.2.md
```

Expected: only the AI Session Continuity v0 files contain intentional changes. Existing unrelated platform/migration dirty work remains untouched.

---

## Self-Review

- Spec coverage: This plan implements the next simple usable BrainShare loop: source-preserving AI conversation Episodes, primitive provenance, tool-agnostic context assembly, CLI AI-session output, and MCP/tool response traceability mode 1.
- Intentional deferrals: Native Claude/ChatGPT data access, Markdown/HTML parsing, browser extensions, proactive warnings, full WorkOS UI, and WorkOS writeback remain separate follow-up work.
- Type consistency: The plan reuses existing `EpisodeCreate`, `PrimitiveCreate`, `ContextAssemblyRequest`, `AIConversationIn`, and current CLI/MCP file shapes instead of introducing a parallel subsystem.
- TDD coverage: Each behavior-changing task starts with a failing direct-run test and then implements only enough code to pass.
