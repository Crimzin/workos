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
    primitives = [
        primitive
        for primitive in synthesis.get("primitives", [])
        if primitive.get("topic") == topic.get("name")
    ]
    decisions = [
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "decision" and primitive.get("statement")
    ]
    open_questions = [
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "question" and primitive.get("statement")
    ]
    assumptions = [
        primitive.get("statement")
        for primitive in primitives
        if primitive.get("type") == "assumption" and primitive.get("statement")
    ]

    summary = _topic_summary(topic, synthesis) or f"Imported context about {topic_name}."
    return {
        "summary": summary,
        "key_decisions": decisions[:6],
        "open_questions": open_questions[:6],
        "assumptions_or_constraints": assumptions[:6],
        "pick_up_here": f"Continue from the latest useful thread of work on {topic_name}.",
    }


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
