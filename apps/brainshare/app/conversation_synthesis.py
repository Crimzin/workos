from __future__ import annotations

import json
import re
from typing import Any


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def text_has(text: str, *needles: str) -> bool:
    lowered = text.lower()
    return any(needle.lower() in lowered for needle in needles)


def supporting_span_for_terms(
    episodes: list[dict[str, Any]],
    *terms: str,
) -> dict[str, Any]:
    for episode in episodes:
        for message in episode.get("metadata", {}).get("supporting_messages", []):
            content = str(message.get("content") or "")
            if text_has(content, *terms):
                return {
                    "episode_id": episode["id"],
                    "message_index": message.get("index"),
                    "source_message_index": message.get("source_message_index"),
                    "source_span": message.get("source_span", {}),
                    "speaker_role": message.get("speaker_role"),
                    "timestamp": message.get("timestamp"),
                    "content_preview": normalize_text(content)[:240],
                }
    first = episodes[0] if episodes else {}
    return {
        "episode_id": first.get("id"),
        "message_index": None,
        "source_span": {},
        "content_preview": "",
    }


def provenance_for_episodes(episodes: list[dict[str, Any]]) -> dict[str, Any]:
    if not episodes:
        return {}
    first_metadata = episodes[0].get("metadata", {})
    first_provenance = first_metadata.get("provenance", {})
    return {
        "source_tool": episodes[0].get("source_tool"),
        "source_kind": first_metadata.get("source_kind"),
        "conversation_id": first_metadata.get("conversation_id"),
        "source_url": first_metadata.get("source_url"),
        "source_locations": [episode.get("source_location") for episode in episodes],
        "content_hashes": [
            episode.get("metadata", {}).get("provenance", {}).get("content_hash")
            for episode in episodes
            if episode.get("metadata", {}).get("provenance", {}).get("content_hash")
        ],
        "actor_ids": first_provenance.get("actor_ids", []),
        "participant_ids": first_provenance.get("participant_ids", []),
    }


def topic(
    *,
    name: str,
    summary: str,
    narrative: str,
    status: str,
    spans: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "name": name,
        "summary": summary,
        "narrative": narrative,
        "status": status,
        "source_spans": spans,
    }


def primitive(
    *,
    primitive_type: str,
    statement: str,
    rationale: str,
    human_signal: str,
    conviction: float,
    topic_name: str,
    citations: list[dict[str, Any]],
    relationships: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "type": primitive_type,
        "statement": statement,
        "rationale": rationale,
        "human_signal": human_signal,
        "conviction": conviction,
        "topic": topic_name,
        "relationships": relationships or [],
        "citations": citations,
    }


def deterministic_conversation_synthesis(
    *,
    conversation_id: str,
    title: str,
    episodes: list[dict[str, Any]],
) -> dict[str, Any]:
    transcript = "\n".join(episode.get("raw_content", "") for episode in episodes)
    source_episode_ids = [episode["id"] for episode in episodes]
    source_provenance = provenance_for_episodes(episodes)

    anthropic_span = supporting_span_for_terms(episodes, "Anthropic", "education product")
    pm_span = supporting_span_for_terms(episodes, "~1.5 years", "formal PM", "product guy")
    titan_span = supporting_span_for_terms(episodes, "Titan", "GTM", "ops")
    runway_span = supporting_span_for_terms(episodes, "Financial runway", "consulting revenue")
    build_span = supporting_span_for_terms(episodes, "BrainShare", "Swarm", "WorkOS")

    topics = []
    primitives = []
    why_chains = []

    if text_has(transcript, "Anthropic"):
        topics.append(
            topic(
                name="Anthropic career path",
                summary="Anthropic remains the primary high-fit career path.",
                narrative=(
                    "Will is orienting around Anthropic as the highest-fit path because it combines "
                    "AI, education, product, and human performance. The durable strategy is to use "
                    "warm referrals, tell a coherent nontraditional product story, and build a small "
                    "AI-native education prototype that demonstrates fit."
                ),
                status="active",
                spans=[anthropic_span, pm_span],
            )
        )
        primitives.extend(
            [
                primitive(
                    primitive_type="goal",
                    statement="Will is prioritizing Anthropic as the primary high-fit path.",
                    rationale=(
                        "The role category matches Will's strongest through-line: AI, education, "
                        "product thinking, learning science, and human performance."
                    ),
                    human_signal="explicit human priority and agreement with the AI framing",
                    conviction=0.94,
                    topic_name="Anthropic career path",
                    citations=[anthropic_span],
                    relationships=[{"type": "requires", "target": "warm referral path"}],
                ),
                primitive(
                    primitive_type="context_update",
                    statement=(
                        "Will has ~1.5 years formal PM title experience, but broader product-adjacent "
                        "experience through consulting, L&D, GTM, CoS, and building."
                    ),
                    rationale=(
                        "This is the hard-to-vary career narrative: the formal title gap is real, "
                        "but the adjacent work explains why product roles still fit."
                    ),
                    human_signal="explicit human correction",
                    conviction=0.97,
                    topic_name="Anthropic career path",
                    citations=[pm_span],
                ),
            ]
        )
        why_chains.append(
            {
                "name": "Anthropic career path why-chain",
                "topic": "Anthropic career path",
                "nodes": [
                    {
                        "type": "goal",
                        "statement": "find high-fit AI/product work.",
                    },
                    {
                        "type": "assumption",
                        "statement": "Anthropic education/product roles align with Will's background.",
                    },
                    {
                        "type": "risk",
                        "statement": "The formal PM title gap may screen Will out before the story is understood.",
                    },
                    {
                        "type": "action",
                        "statement": "Pursue warm referrals and build/demo an AI-native education prototype.",
                    },
                ],
                "edges": [
                    {"from": 0, "to": 1, "type": "supported_by"},
                    {"from": 1, "to": 2, "type": "threatened_by"},
                    {"from": 2, "to": 3, "type": "mitigated_by"},
                ],
                "source_spans": [anthropic_span, pm_span],
            }
        )

    if text_has(transcript, "Titan"):
        topics.append(
            topic(
                name="Titan opportunity",
                summary="Titan is useful as an option, but likely lower fit than Anthropic.",
                narrative=(
                    "Titan can stay warm as a networking or safety-net path, but the likely work shape "
                    "is GTM/ops. That creates a fit risk because it could pull Will back toward work he "
                    "is trying to leave."
                ),
                status="watch",
                spans=[titan_span],
            )
        )
        primitives.append(
            primitive(
                primitive_type="assumption",
                statement=(
                    "Titan is useful as an option and relationship path, but it risks pulling Will "
                    "back into GTM/ops work he is trying to leave."
                ),
                rationale=(
                    "The opportunity has relationship value, but the discussed role shape conflicts "
                    "with Will's desired move toward AI/product/learning work."
                ),
                human_signal="human accepted the fit-risk framing",
                conviction=0.86,
                topic_name="Titan opportunity",
                citations=[titan_span],
            )
        )

    if text_has(transcript, "Financial runway", "consulting revenue", "finance"):
        topics.append(
            topic(
                name="Financial runway",
                summary="Runway and consulting revenue matter, but should not displace the main path.",
                narrative=(
                    "Financial runway is part of the strategy because consulting revenue can buy time. "
                    "The important constraint is that revenue work should support, not crowd out, the "
                    "Anthropic path and the WorkOS/BrainShare/Swarm build."
                ),
                status="active",
                spans=[runway_span],
            )
        )

    if text_has(transcript, "WorkOS", "BrainShare", "Swarm"):
        topics.append(
            topic(
                name="WorkOS / BrainShare / Swarm build",
                summary="WorkOS, BrainShare, and Swarm are one integrated build, not side projects.",
                narrative=(
                    "Will sees WorkOS, BrainShare, and Swarm as one integrated system and expects he "
                    "would regret not pursuing it even if the Anthropic path works out. The build is "
                    "part of both his product vision and his career strategy."
                ),
                status="active",
                spans=[build_span],
            )
        )
        primitives.append(
            primitive(
                primitive_type="decision",
                statement=(
                    "WorkOS, BrainShare, and Swarm are one integrated build that Will expects to "
                    "regret not pursuing."
                ),
                rationale=(
                    "The build is not merely a productivity side quest; it is the infrastructure Will "
                    "believes will let him operate at full speed and demonstrate his AI/product thesis."
                ),
                human_signal="explicit human statement",
                conviction=0.95,
                topic_name="WorkOS / BrainShare / Swarm build",
                citations=[build_span],
            )
        )

    if not topics:
        topics.append(
            topic(
                name="General conversation context",
                summary="BrainShare synthesized a general conversation briefing.",
                narrative=normalize_text(transcript)[:700],
                status="needs_review",
                spans=[supporting_span_for_terms(episodes)],
            )
        )

    brief_summary = (
        "Will is prioritizing Anthropic as the primary high-fit career path while preserving "
        "enough financial runway to keep building. The central explanation is that his best-fit "
        "work sits at the intersection of AI, education, product, and human performance. The main "
        "risk is that his formal PM title history understates his broader product-adjacent experience. "
        "Titan can remain warm as an option, but should not pull him back into GTM/ops work. WorkOS, "
        "BrainShare, and Swarm are one integrated build Will expects to regret not pursuing."
    )

    return {
        "conversation_id": conversation_id,
        "title": title,
        "source_episode_ids": source_episode_ids,
        "source_provenance": source_provenance,
        "conversation_brief": {
            "summary": brief_summary,
            "status": "needs_review",
            "audience": "future_ai_session",
        },
        "topics": topics,
        "why_chains": why_chains,
        "primitives": primitives,
        "metadata": {
            "synthesis_version": "ai_conversation_synthesis_v0",
            "provider": "dev-rule",
            "quality_note": "Deterministic v0 synthesis; inspect before storing derived primitives.",
        },
    }


def validate_synthesis_shape(value: dict[str, Any]) -> dict[str, Any]:
    required = ["conversation_id", "title", "conversation_brief", "topics", "why_chains", "primitives"]
    missing = [key for key in required if key not in value]
    if missing:
        raise ValueError(f"missing synthesis keys: {', '.join(missing)}")
    if not isinstance(value["conversation_brief"], dict) or not value["conversation_brief"].get("summary"):
        raise ValueError("conversation_brief.summary is required")
    if not isinstance(value["topics"], list):
        raise ValueError("topics must be a list")
    if not isinstance(value["why_chains"], list):
        raise ValueError("why_chains must be a list")
    if not isinstance(value["primitives"], list):
        raise ValueError("primitives must be a list")
    return value


STARTING_CONTEXT_MEMO_INSTRUCTIONS = """Starting Context memo rules:
- Each topic must include starting_context_memo_markdown.
- Write it as a simple memo that could be sent to a thoughtful person or AI agent to get them ready to engage.
- Choose the memo structure freely based on the subject matter. Use the smallest set of headings that makes the context clear.
- Do not expose BrainShare extraction categories as visible headings unless they are genuinely natural for the subject.
- Do not force project-management sections onto non-project material.
- Suitable structures may look very different for product strategy, recipes, emotional reflection, creative writing, research, personal planning, or technical debugging.
- The memo should explain what this is about, why it matters, what is already established, what is still alive or unresolved, and how to engage next.
- Use citations and source spans as background evidence, not as the main visible payload unless provenance is directly useful to the reader."""


def claude_synthesis_prompt(conversation_id: str, title: str, episodes: list[dict[str, Any]]) -> str:
    transcript = "\n\n".join(
        f"EPISODE {episode['id']} ({episode.get('source_location')}):\n{episode.get('raw_content', '')}"
        for episode in episodes
    )
    return f"""You are BrainShare's AI conversation synthesis engine.

Your job is to turn a long AI conversation into a coherent BrainShare memory map, not a list of snippets.

Return ONLY valid JSON with this exact top-level shape:
{{
  "conversation_id": "{conversation_id}",
  "title": "{title}",
  "source_episode_ids": ["..."],
  "source_provenance": {{}},
  "conversation_brief": {{"summary": "...", "status": "needs_review", "audience": "future_ai_session"}},
  "topics": [{{"name": "...", "summary": "...", "narrative": "...", "status": "active|watch|needs_review", "source_spans": [], "starting_context_memo_markdown": "# ..."}}],
  "why_chains": [{{"name": "...", "topic": "...", "nodes": [{{"type": "goal|assumption|risk|decision|action", "statement": "..."}}], "edges": [], "source_spans": []}}],
  "primitives": [{{"type": "decision|assumption|action|question|context_update|goal|signal", "statement": "...", "rationale": "...", "human_signal": "...", "conviction": 0.0, "topic": "...", "relationships": [], "citations": []}}],
  "metadata": {{"synthesis_version": "ai_conversation_synthesis_v0", "provider": "claude"}}
}}

Rules:
- Prefer a coherent narrative and causal map over many memories.
- Conviction traces to human signal, not AI generation.
- Capture hard-to-vary rationales: specific reasons that would break if swapped out.
- Include citations/source spans as drill-down metadata, not the main cognitive payload.
- Do not store approval fragments like "I agree" as memories.

{STARTING_CONTEXT_MEMO_INSTRUCTIONS}

Conversation:
{transcript}
"""
