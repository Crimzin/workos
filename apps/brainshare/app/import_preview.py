from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4


@dataclass(frozen=True)
class ImportPreviewRequestData:
    conversation_ids: list[str]
    default_include: bool = True


def _safe_title(value: Any, fallback: str) -> str:
    title = str(value or "").strip()
    return title if title else fallback


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _dedupe_texts(values: list[Any], limit: int) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = _clean_text(value)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
        if len(result) >= limit:
            break
    return result


def _trim_text(value: Any, limit: int = 420) -> str:
    text = _clean_text(value)
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _why_chain_nodes_for_topic(
    synthesis: dict[str, Any],
    topic_name: str | None,
) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for chain in synthesis.get("why_chains", []):
        if chain.get("topic") != topic_name:
            continue
        for node in chain.get("nodes", []):
            if isinstance(node, dict):
                nodes.append(node)
    return nodes


def _topic_summary(topic: dict[str, Any], synthesis: dict[str, Any]) -> str:
    summary = str(topic.get("summary") or "").strip()
    if summary:
        return summary
    return str(synthesis.get("conversation_brief", {}).get("summary") or "").strip()


def starting_context_for_topic(
    topic: dict[str, Any],
    synthesis: dict[str, Any],
) -> dict[str, Any]:
    topic_name = _safe_title(topic.get("name"), "Imported conversation")
    topic_key = topic.get("name")
    primitives = [
        primitive
        for primitive in synthesis.get("primitives", [])
        if primitive.get("topic") == topic_key
    ]
    why_nodes = _why_chain_nodes_for_topic(synthesis, topic_key)
    decisions = _dedupe_texts([
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "decision" and primitive.get("statement")
    ], 6)
    open_questions = _dedupe_texts([
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "question" and primitive.get("statement")
    ] + [
        node.get("statement")
        for node in why_nodes
        if node.get("type") == "question" and node.get("statement")
    ], 6)
    assumptions = _dedupe_texts([
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "assumption" and primitive.get("statement")
    ] + [
        node.get("statement")
        for node in why_nodes
        if node.get("type") in {"assumption", "constraint", "risk"}
        and node.get("statement")
    ], 6)
    actions = _dedupe_texts([
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "action" and primitive.get("statement")
    ] + [
        node.get("statement")
        for node in why_nodes
        if node.get("type") == "action" and node.get("statement")
    ], 3)

    summary = _topic_summary(topic, synthesis) or f"Imported context about {topic_name}."
    memo_markdown = str(topic.get("starting_context_memo_markdown") or "").strip()
    narrative = _clean_text(topic.get("narrative"))
    overview = _dedupe_texts(
        [narrative if narrative and narrative.lower() != summary.lower() else ""],
        3,
    )
    detail_notes = _dedupe_texts(
        [primitive.get("rationale") for primitive in primitives]
        + [node.get("statement") for node in why_nodes if node.get("type") == "goal"],
        6,
    )
    evidence_notes = _dedupe_texts(
        [
            _trim_text(span.get("content_preview"))
            for span in topic.get("source_spans", [])
            if isinstance(span, dict)
        ]
        + [primitive.get("human_signal") for primitive in primitives],
        6,
    )
    reflection_source = (
        detail_notes[0]
        if detail_notes
        else (overview[0] if overview else summary)
    )
    pick_up_here = (
        actions[0]
        if actions
        else (
            f"Resolve: {open_questions[0]}"
            if open_questions
            else (
                "Review this imported context, confirm or correct the durable "
                "decisions and assumptions, then choose the next concrete task."
            )
        )
    )
    context = {
        "summary": summary,
        "overview": overview,
        "key_decisions": decisions,
        "open_questions": open_questions,
        "assumptions_or_constraints": assumptions,
        "detail_notes": detail_notes,
        "reflection": f"Why this matters: {reflection_source}",
        "evidence_notes": evidence_notes,
        "pick_up_here": pick_up_here,
    }
    if memo_markdown:
        context["memo_markdown"] = memo_markdown
    return context


def build_import_preview(
    syntheses: list[dict[str, Any]],
    request: ImportPreviewRequestData,
) -> dict[str, Any]:
    clusters: list[dict[str, Any]] = []
    for synthesis in syntheses:
        conversation_id = synthesis.get("conversation_id")
        topics = synthesis.get("topics") or [
            {
                "name": synthesis.get("title") or conversation_id or "Imported conversation",
                "summary": synthesis.get("conversation_brief", {}).get("summary", ""),
            }
        ]

        for topic in topics:
            title = _safe_title(topic.get("name"), f"Imported thread {len(clusters) + 1}")
            summary = _topic_summary(topic, synthesis)
            source_episode_ids = synthesis.get("source_episode_ids", [])
            clusters.append(
                {
                    "id": f"cluster_{len(clusters) + 1}",
                    "title": title,
                    "summary": summary,
                    "include": request.default_include,
                    "proposed_thread": {
                        "title": title,
                        "description": summary,
                        "parent_cluster_id": None,
                    },
                    "starting_context": starting_context_for_topic(topic, synthesis),
                    "candidate_primitives": [
                        primitive
                        for primitive in synthesis.get("primitives", [])
                        if primitive.get("topic") == topic.get("name")
                    ],
                    "source_refs": [
                        {
                            "conversation_id": conversation_id,
                            "synthesis_id": synthesis.get("id"),
                            "source_episode_ids": source_episode_ids,
                            "source_provenance": synthesis.get("source_provenance", {}),
                        }
                    ],
                }
            )

    return {
        "success": True,
        "import_job_id": f"import_{uuid4().hex}",
        "clusters": clusters,
        "excluded_cluster_ids": [
            cluster["id"] for cluster in clusters if not cluster["include"]
        ],
        "metadata": {"preview_version": "workos_import_preview_v0"},
    }
