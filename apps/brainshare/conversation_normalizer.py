from __future__ import annotations

import json
import re
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


SUPPORTED_SUFFIXES = {".json", ".md", ".markdown", ".txt", ".html", ".htm"}
ROLE_ALIASES = {
    "human": "human",
    "user": "human",
    "prompt": "human",
    "me": "human",
    "will": "human",
    "assistant": "ai",
    "ai": "ai",
    "response": "ai",
    "claude": "ai",
    "chatgpt": "ai",
    "gpt": "ai",
    "codex": "ai",
    "system": "system",
    "tool": "tool",
}
ROLE_KEYS = ("role", "speaker", "sender", "author", "from", "name", "author_name")
CONTENT_KEYS = ("content", "text", "body", "say", "message", "value", "markdown")
TIMESTAMP_KEYS = ("timestamp", "time", "created", "created_at", "create_time", "date")
TITLE_KEYS = ("title", "name", "conversation_title", "subject")
URL_KEYS = ("source_url", "url", "link", "permalink", "href")


def normalize_role(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("role") or value.get("name") or value.get("display_name")
    role = str(value or "").strip().lower()
    return ROLE_ALIASES.get(role, "human")


def first_string(mapping: dict[str, Any], keys: tuple[str, ...]) -> Optional[str]:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    return None


def content_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(content_to_text(item) for item in value if content_to_text(item)).strip()
    if isinstance(value, dict):
        parts = value.get("parts")
        if isinstance(parts, list):
            return content_to_text(parts)
        text = first_string(value, CONTENT_KEYS)
        if text:
            return text
    return ""


def message_from_dict(item: dict[str, Any], index: int, source_file: Path) -> Optional[dict[str, Any]]:
    if isinstance(item.get("message"), dict):
        item = item["message"]

    content = ""
    for key in CONTENT_KEYS:
        content = content_to_text(item.get(key))
        if content:
            break
    if not content:
        return None

    role_value = None
    for key in ROLE_KEYS:
        if key in item:
            role_value = item.get(key)
            break
    author = item.get("author") if isinstance(item.get("author"), dict) else {}

    return {
        "id": str(item.get("id") or item.get("uuid") or index),
        "role": normalize_role(role_value),
        "content": content,
        "author_name": first_string(item, ("author_name", "name")) or first_string(author, ("name", "display_name")),
        "timestamp": first_string(item, TIMESTAMP_KEYS),
        "metadata": {
            "source_index": index,
            "source_file": str(source_file),
        },
    }


def candidate_score(messages: list[dict[str, Any]]) -> float:
    if len(messages) < 2:
        return 0.0
    roles = [message["role"] for message in messages]
    text_chars = sum(len(message["content"]) for message in messages)
    alternations = sum(1 for left, right in zip(roles, roles[1:]) if left != right)
    score = 0.3
    score += min(0.25, len(messages) / 20)
    score += min(0.2, text_chars / 5000)
    if "human" in roles and "ai" in roles:
        score += 0.2
    score += min(0.15, alternations / max(1, len(messages) - 1) * 0.15)
    return round(min(score, 1.0), 3)


def find_message_candidates(value: Any, source_file: Path) -> list[tuple[list[dict[str, Any]], str]]:
    candidates: list[tuple[list[dict[str, Any]], str]] = []

    def visit(node: Any, path: str) -> None:
        if isinstance(node, dict):
            mapped_messages = [
                message
                for index, item in enumerate(node.values(), start=1)
                if isinstance(item, dict)
                for message in [message_from_dict(item, index, source_file)]
                if message is not None
            ]
            if len(mapped_messages) >= 2:
                candidates.append((mapped_messages, path))
            if isinstance(node.get("message"), dict):
                message = message_from_dict(node, 1, source_file)
                if message:
                    candidates.append(([message], f"{path}.message"))
            for key in ("messages", "turns", "mapping", "items", "children", "conversation"):
                child = node.get(key)
                if child is not None:
                    visit(child, f"{path}.{key}")
            for key, child in node.items():
                if key not in {"messages", "turns", "mapping", "items", "children", "conversation"}:
                    visit(child, f"{path}.{key}")
            return

        if isinstance(node, list):
            messages = [
                message
                for index, item in enumerate(node, start=1)
                if isinstance(item, dict)
                for message in [message_from_dict(item, index, source_file)]
                if message is not None
            ]
            if messages:
                candidates.append((messages, path))
            for index, item in enumerate(node, start=1):
                visit(item, f"{path}[{index}]")

    visit(value, "$")
    return candidates


def metadata_from_json(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
    merged = {**metadata, **{key: item for key, item in value.items() if key != "metadata"}}
    result = {}
    title = find_first_nested_string(merged, TITLE_KEYS)
    url = find_first_nested_string(merged, URL_KEYS)
    conversation_id = find_first_nested_string(merged, ("conversation_id", "id", "uuid"))
    if title:
        result["title"] = title
    if url:
        result["source_url"] = url
    if conversation_id:
        result["conversation_id"] = conversation_id
    result["raw_metadata"] = metadata
    return result


def find_first_nested_string(value: Any, keys: tuple[str, ...]) -> Optional[str]:
    if isinstance(value, dict):
        for key in keys:
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()
            if isinstance(item, (int, float)):
                return str(item)
        for item in value.values():
            found = find_first_nested_string(item, keys)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = find_first_nested_string(item, keys)
            if found:
                return found
    return None


def derive_conversation_id(
    *,
    source_tool: str,
    source_url: Optional[str],
    source_file: Path,
) -> str:
    if source_url:
        parsed = urlparse(source_url)
        path_parts = [part for part in parsed.path.split("/") if part]
        if path_parts:
            return f"{source_tool}:{path_parts[-1]}"
        return f"{source_tool}:{sha256(source_url.encode('utf-8')).hexdigest()[:16]}"
    return f"{source_tool}:{sha256(str(source_file.resolve()).encode('utf-8')).hexdigest()[:16]}"


ROLE_LINE_RE = re.compile(
    r"^\s*(human|user|me|prompt|assistant|ai|response|claude|chatgpt|codex|system|tool)\s*:\s*(.*)$",
    re.IGNORECASE,
)


def parse_role_labeled_text(text: str, source_file: Path) -> list[dict[str, Any]]:
    messages = []
    current: Optional[dict[str, Any]] = None
    for line in text.splitlines():
        match = ROLE_LINE_RE.match(line)
        if match:
            if current and current["content"].strip():
                messages.append(current)
            current = {
                "id": str(len(messages) + 1),
                "role": normalize_role(match.group(1)),
                "content": match.group(2).strip(),
                "author_name": match.group(1).strip(),
                "timestamp": None,
                "metadata": {
                    "source_index": len(messages) + 1,
                    "source_file": str(source_file),
                },
            }
            continue
        if current is not None:
            current["content"] = f"{current['content']}\n{line.strip()}".strip()
    if current and current["content"].strip():
        messages.append(current)
    return messages


class ConversationHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title_parts: list[str] = []
        self.body_parts: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag.lower() == "title":
            self.in_title = True
        if tag.lower() in {"div", "p", "li", "br"}:
            self.body_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False
        if tag.lower() in {"div", "p", "li"}:
            self.body_parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        self.body_parts.append(data)

    @property
    def title(self) -> Optional[str]:
        title = " ".join(part.strip() for part in self.title_parts if part.strip()).strip()
        return title or None

    @property
    def text(self) -> str:
        return re.sub(r"\n{3,}", "\n\n", "".join(self.body_parts))


def normalize_conversation_file(
    path: Path | str,
    *,
    source_tool: str,
    conversation_id: Optional[str] = None,
    title: Optional[str] = None,
    project_name: Optional[str] = None,
) -> dict[str, Any]:
    source_file = Path(path)
    suffix = source_file.suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise SystemExit(
            f"Unsupported conversation export type '{suffix}'. Supported: {', '.join(sorted(SUPPORTED_SUFFIXES))}."
        )

    raw_text = source_file.read_text(encoding="utf-8")
    metadata: dict[str, Any] = {}
    warnings: list[str] = []
    messages: list[dict[str, Any]] = []
    detected_path = None
    confidence = 0.0

    if suffix == ".json":
        raw = json.loads(raw_text)
        metadata = metadata_from_json(raw)
        candidates = find_message_candidates(raw, source_file)
        if candidates:
            messages, detected_path = max(candidates, key=lambda candidate: candidate_score(candidate[0]))
            confidence = candidate_score(messages)
    else:
        text = raw_text
        if suffix in {".html", ".htm"}:
            parser = ConversationHTMLParser()
            parser.feed(raw_text)
            text = parser.text
            if parser.title:
                metadata["title"] = parser.title
        else:
            heading = next(
                (
                    line.strip().lstrip("#").strip()
                    for line in raw_text.splitlines()
                    if line.strip().startswith("#")
                ),
                None,
            )
            if heading:
                metadata["title"] = heading
        messages = parse_role_labeled_text(text, source_file)
        detected_path = "role_labeled_text"
        confidence = candidate_score(messages)

    if not messages:
        raise SystemExit(
            "No recognizable conversation turns found. Supported files need repeated role/content turns "
            "(for example role+content JSON fields, ChatGPT mapping nodes, Claude role/time/say exports, "
            "or Human:/Assistant: transcript text)."
        )

    if confidence < 0.6:
        warnings.append("Low confidence conversation normalization; review extracted messages before trusting ingestion.")

    return {
        "source_tool": source_tool,
        "conversation_id": conversation_id
        or metadata.get("conversation_id")
        or derive_conversation_id(
            source_tool=source_tool,
            source_url=metadata.get("source_url"),
            source_file=source_file,
        ),
        "title": title or metadata.get("title") or source_file.stem,
        "project_name": project_name,
        "source_url": metadata.get("source_url"),
        "messages": messages,
        "metadata": {
            "ingested_by": "brainshare-cli",
            "source_file": str(source_file),
            "normalizer": {
                "version": "conversation_normalizer_v0",
                "file_type": suffix.lstrip("."),
                "detected_path": detected_path,
                "confidence": confidence,
                "message_count": len(messages),
                "warnings": warnings,
            },
            "export_metadata": metadata.get("raw_metadata", {}),
        },
    }
