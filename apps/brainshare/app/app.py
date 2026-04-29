from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4
import json
import os
import re

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field


APP_DIR = Path(__file__).resolve().parent
STORE_FILE = Path(os.getenv("BRAINSHARE_STORE_FILE", APP_DIR / "brainshare-dev-store.json"))
VALID_TOKEN = os.getenv("BRAINSHARE_DEV_TOKEN", "bs_team_abc123")

PrimitiveType = Literal[
    "decision",
    "assumption",
    "action",
    "question",
    "context_update",
    "actor",
    "goal",
    "work_item",
    "standard",
    "signal",
]

ExtractionPrimitiveType = Literal[
    "DECISION",
    "ASSUMPTION",
    "ACTION",
    "QUESTION",
    "CONTEXT_UPDATE",
]

EXTRACTION_SYSTEM_PROMPT = """You are BrainShare's extraction engine. Read a team conversation and extract only structured context primitives that are actually supported by the messages.

Extract these types:
- DECISION: explicit or implicit agreement to do something, use something, or go in a particular direction.
- ASSUMPTION: a belief the team is operating on that could be wrong.
- ACTION: a commitment by a specific person to do a specific thing.
- QUESTION: an unresolved question that was raised but not answered.
- CONTEXT_UPDATE: a factual update about the state of work worth recording.

Rules:
1. Only extract what is actually in the conversation.
2. For implicit decisions, cite messages that demonstrate convergence.
3. Every extraction must reference supporting message indices.
4. Return an empty extraction for social or off-topic conversations.
5. Prefer fewer, higher-quality extractions.
6. Decision rationale must capture the actual reasons discussed.
7. Hidden assumptions often appear after since, because, assuming, as long as, or given that.
8. Approval reactions from authority-weighted actors count as approval.

Return only valid JSON with this shape:
{"primitives":[{"type":"DECISION|ASSUMPTION|ACTION|QUESTION|CONTEXT_UPDATE","content":{},"supporting_messages":[1],"confidence":0.0}],"no_extractable_context":false}
"""


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def require_auth(authorization: Optional[str] = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="invalid_auth")
    if authorization.removeprefix("Bearer ").strip() != VALID_TOKEN:
        raise HTTPException(status_code=401, detail="invalid_auth")


class EpisodeCreate(BaseModel):
    source_tool: str = Field(..., min_length=1)
    source_location: str = Field(..., min_length=1)
    raw_content: str = Field(..., min_length=1)
    timestamp_start: Optional[str] = None
    timestamp_end: Optional[str] = None
    actors: list[str] = Field(default_factory=list)
    message_count: Optional[int] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Episode(EpisodeCreate):
    id: str
    created_at: str


class PrimitiveCreate(BaseModel):
    type: PrimitiveType
    statement: str = Field(..., min_length=1)
    body: Optional[str] = None
    status: Optional[str] = None
    conviction: float = Field(default=0.5, ge=0, le=1)
    source_episode_ids: list[str] = Field(default_factory=list)
    supporting_messages: list[int] = Field(default_factory=list)
    actors: list[str] = Field(default_factory=list)
    related_node_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Primitive(PrimitiveCreate):
    id: str
    created_at: str
    updated_at: str


class PushRequest(BaseModel):
    content: str = Field(..., min_length=1)
    category: str = "knowledge"
    source_llm: Optional[str] = None
    user_id: Optional[str] = None


class AnalyzeRequest(BaseModel):
    conversation_chunk: str = Field(..., min_length=1)
    trigger_type: str = "manual"
    source_llm: Optional[str] = None


class EpisodeExtractionRequest(BaseModel):
    provider: Literal["dev-rule", "claude"] = "dev-rule"
    foundation_context: str = ""
    actor_context: dict[str, Any] = Field(default_factory=dict)
    store_primitives: bool = True


class ExtractedPrimitive(BaseModel):
    type: ExtractionPrimitiveType
    content: dict[str, Any]
    supporting_messages: list[int] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class ExtractionResult(BaseModel):
    primitives: list[ExtractedPrimitive] = Field(default_factory=list)
    no_extractable_context: bool = True


class ConvictionResult(BaseModel):
    conviction: float
    factors: list[str] = Field(default_factory=list)


class WorkOSMemoryPrimitiveIn(BaseModel):
    id: str
    instance_id: str
    node_id: str
    type: Literal["rationale", "assumption", "decision"]
    statement: str = ""
    body: Optional[Any] = None
    status: Optional[str] = None
    conviction: float = Field(default=0.5, ge=0, le=1)
    source_post_id: Optional[str] = None
    source_label: Optional[str] = None
    external_episode_id: Optional[str] = None
    created_by_actor_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DiscordMessageIn(BaseModel):
    id: str
    channel_id: str
    channel_name: str
    author_id: str
    author_name: str
    content: str
    timestamp: str
    thread_id: Optional[str] = None
    thread_name: Optional[str] = None
    reply_to_message_id: Optional[str] = None
    reactions: list[dict[str, Any]] = Field(default_factory=list)


class DiscordMessagesIn(BaseModel):
    guild_id: str
    guild_name: Optional[str] = None
    messages: list[DiscordMessageIn] = Field(..., min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


def parse_reference_time(value: Optional[str]) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def body_to_text(body: Optional[Any]) -> str:
    if body is None:
        return ""
    if isinstance(body, str):
        return body
    return json.dumps(body, sort_keys=True)


def graphiti_primitive_type(workos_type: str) -> PrimitiveType:
    if workos_type == "rationale":
        return "work_item"
    if workos_type == "assumption":
        return "assumption"
    return "decision"


def map_workos_memory_primitive(
    payload: WorkOSMemoryPrimitiveIn,
) -> tuple[EpisodeCreate, PrimitiveCreate]:
    """Map WorkOS memory rows into BrainShare's graph vocabulary.

    WorkOS keeps rationale/assumption/decision as a node-local Memory tab
    surface. BrainShare keeps typed graph primitives. Rationale maps to the
    WorkItem context for the WorkOS node; assumptions and decisions map
    directly.
    """

    statement = payload.statement.strip()
    if not statement:
        statement = f"{payload.type.title()} for WorkOS node {payload.node_id}"

    mapped_type = graphiti_primitive_type(payload.type)
    body_text = body_to_text(payload.body)
    graph_body = {
        "source": "workos.memory_primitives",
        "mapping": {
            "workos_type": payload.type,
            "brainshare_type": mapped_type,
            "rationale_maps_to": "work_item_context",
        },
        "memory_primitive": payload.model_dump(),
    }

    episode = EpisodeCreate(
        source_tool="workos",
        source_location=f"memory_primitives:{payload.node_id}",
        raw_content=json.dumps(graph_body, sort_keys=True),
        timestamp_start=payload.created_at,
        timestamp_end=payload.updated_at or payload.created_at,
        actors=[payload.created_by_actor_id] if payload.created_by_actor_id else [],
        message_count=None,
        metadata={
            "episode_type": "json",
            "instance_id": payload.instance_id,
            "node_id": payload.node_id,
            "memory_primitive_id": payload.id,
            "memory_primitive_type": payload.type,
            "source_post_id": payload.source_post_id,
            "source_label": payload.source_label,
            "external_episode_id": payload.external_episode_id,
        },
    )

    source_episode_ids = [payload.external_episode_id] if payload.external_episode_id else []
    primitive = PrimitiveCreate(
        type=mapped_type,
        statement=statement,
        body=body_text or None,
        status=payload.status,
        conviction=payload.conviction,
        source_episode_ids=source_episode_ids,
        actors=[payload.created_by_actor_id] if payload.created_by_actor_id else [],
        related_node_id=payload.node_id,
        metadata={
            "source": "workos.memory_primitives",
            "workos_memory_primitive_id": payload.id,
            "workos_memory_primitive_type": payload.type,
            "workos_instance_id": payload.instance_id,
            "workos_node_id": payload.node_id,
            "source_post_id": payload.source_post_id,
            "source_label": payload.source_label,
            "external_episode_id": payload.external_episode_id,
            "body_json": payload.body if not isinstance(payload.body, str) else None,
            **payload.metadata,
        },
    )

    return episode, primitive


def discord_message_sort_key(message: DiscordMessageIn) -> datetime:
    return parse_reference_time(message.timestamp)


def discord_group_key(message: DiscordMessageIn) -> str:
    if message.thread_id:
        return f"thread:{message.thread_id}"
    return f"channel:{message.channel_id}"


def format_discord_messages(messages: list[DiscordMessageIn]) -> str:
    lines = []
    for index, message in enumerate(messages, start=1):
        content = message.content.replace("\n", " ").strip()
        lines.append(f"[{index}] {message.author_name}: {content}")
    return "\n".join(lines)


def chunk_discord_messages(
    messages: list[DiscordMessageIn],
    max_messages: int = 50,
    gap_minutes: int = 15,
) -> list[list[DiscordMessageIn]]:
    grouped: dict[str, list[DiscordMessageIn]] = {}
    for message in messages:
        grouped.setdefault(discord_group_key(message), []).append(message)

    chunks: list[list[DiscordMessageIn]] = []
    for group_messages in grouped.values():
        current: list[DiscordMessageIn] = []
        previous_at: Optional[datetime] = None

        for message in sorted(group_messages, key=discord_message_sort_key):
            message_at = parse_reference_time(message.timestamp)
            gap_exceeded = (
                previous_at is not None
                and message_at - previous_at > timedelta(minutes=gap_minutes)
            )
            size_exceeded = len(current) >= max_messages

            if current and (gap_exceeded or size_exceeded):
                chunks.append(current)
                current = []

            current.append(message)
            previous_at = message_at

        if current:
            chunks.append(current)

    return sorted(chunks, key=lambda chunk: discord_message_sort_key(chunk[0]))


def discord_chunk_to_episode(
    payload: DiscordMessagesIn,
    chunk: list[DiscordMessageIn],
    chunk_index: int,
) -> EpisodeCreate:
    first = chunk[0]
    last = chunk[-1]
    source_location = first.thread_id or first.channel_id
    source_label = first.thread_name or first.channel_name
    actors = sorted({message.author_id for message in chunk})

    return EpisodeCreate(
        source_tool="discord",
        source_location=source_location,
        raw_content=format_discord_messages(chunk),
        timestamp_start=first.timestamp,
        timestamp_end=last.timestamp,
        actors=actors,
        message_count=len(chunk),
        metadata={
            "episode_type": "message",
            "guild_id": payload.guild_id,
            "guild_name": payload.guild_name,
            "channel_id": first.channel_id,
            "channel_name": first.channel_name,
            "thread_id": first.thread_id,
            "thread_name": first.thread_name,
            "source_label": source_label,
            "chunk_index": chunk_index,
            "message_ids": [message.id for message in chunk],
            "supporting_messages": [
                {
                    "index": index,
                    "message_id": message.id,
                    "author_id": message.author_id,
                    "timestamp": message.timestamp,
                    "reply_to_message_id": message.reply_to_message_id,
                    "reactions": message.reactions,
                }
                for index, message in enumerate(chunk, start=1)
            ],
            **payload.metadata,
        },
    )


def primitive_type_from_extraction(extraction_type: ExtractionPrimitiveType) -> PrimitiveType:
    return extraction_type.lower()  # type: ignore[return-value]


def parse_indexed_messages(raw_content: str) -> list[dict[str, Any]]:
    messages = []
    for line in raw_content.splitlines():
        match = re.match(r"^\[(\d+)\]\s+([^:]+):\s*(.*)$", line.strip())
        if not match:
            continue
        messages.append(
            {
                "index": int(match.group(1)),
                "author": match.group(2).strip(),
                "content": match.group(3).strip(),
            }
        )
    return messages


def statement_from_extraction(extracted: ExtractedPrimitive) -> str:
    content = extracted.content
    statement = str(content.get("statement") or "").strip()
    if statement:
        return statement
    return f"{extracted.type.replace('_', ' ').title()} extracted from source conversation"


def source_citations_for_episode(
    episode: dict[str, Any],
    supporting_messages: list[int],
) -> list[dict[str, Any]]:
    supporting_by_index = {
        item.get("index"): item
        for item in episode.get("metadata", {}).get("supporting_messages", [])
    }
    citations = []
    for index in supporting_messages:
        source = supporting_by_index.get(index, {})
        citations.append(
            {
                "episode_id": episode["id"],
                "message_index": index,
                "message_id": source.get("message_id"),
                "author_id": source.get("author_id"),
                "timestamp": source.get("timestamp"),
                "reply_to_message_id": source.get("reply_to_message_id"),
                "reactions": source.get("reactions", []),
            }
        )
    return citations


def actor_label(actor_id: str, actor_context: dict[str, Any]) -> str:
    actor = actor_context.get(actor_id, {})
    if isinstance(actor, dict):
        return str(actor.get("name") or actor_id)
    return actor_id


def actor_authority_weight(actor_id: str, actor_context: dict[str, Any]) -> float:
    actor = actor_context.get(actor_id, {})
    if not isinstance(actor, dict):
        return 0.5
    if "authority_weight" in actor:
        try:
            return float(actor["authority_weight"])
        except (TypeError, ValueError):
            return 0.5
    authority = str(actor.get("authority", "")).lower()
    if any(marker in authority for marker in ["founder", "owner", "lead", "approval"]):
        return 0.85
    if authority:
        return 0.65
    return 0.5


def approval_actors_from_reactions(
    episode: dict[str, Any],
    supporting_messages: list[int],
    actor_context: dict[str, Any],
) -> list[str]:
    approval_emojis = {"thumbsup", "+1", "👍", "white_check_mark", "✅", "check"}
    approvals = set()
    for citation in source_citations_for_episode(episode, supporting_messages):
        for reaction in citation.get("reactions", []):
            emoji = str(reaction.get("emoji") or "").lower()
            actor_id = str(reaction.get("actor_id") or reaction.get("user_id") or "")
            if not actor_id or emoji not in approval_emojis:
                continue
            if actor_authority_weight(actor_id, actor_context) >= 0.65:
                approvals.add(actor_label(actor_id, actor_context))
    return sorted(approvals)


def calculate_conviction(
    extracted: ExtractedPrimitive,
    episode: dict[str, Any],
    actor_context: dict[str, Any],
) -> ConvictionResult:
    score = extracted.confidence
    factors = [f"llm_or_extractor_confidence={extracted.confidence:.2f}"]

    if extracted.type == "DECISION" and extracted.content.get("type") == "explicit":
        score += 0.08
        factors.append("explicit_decision")
    if len(extracted.supporting_messages) >= 2:
        score += 0.05
        factors.append("multiple_supporting_messages")

    rationale = str(extracted.content.get("rationale") or "")
    if rationale and "dev extractor" not in rationale.lower() and len(rationale) >= 80:
        score += 0.05
        factors.append("specific_rationale")

    authority_approvals = approval_actors_from_reactions(
        episode,
        extracted.supporting_messages,
        actor_context,
    )
    if authority_approvals:
        score += 0.1
        factors.append(f"authority_reaction_approval={','.join(authority_approvals)}")

    if extracted.type == "QUESTION":
        score = min(score, 0.8)
        factors.append("questions_capped_below_assert_threshold")

    return ConvictionResult(conviction=max(0, min(round(score, 2), 1)), factors=factors)


def extracted_to_primitive_create(
    episode: dict[str, Any],
    extracted: ExtractedPrimitive,
    actor_context: Optional[dict[str, Any]] = None,
) -> PrimitiveCreate:
    actor_context = actor_context or {}
    conviction = calculate_conviction(extracted, episode, actor_context)
    citations = source_citations_for_episode(episode, extracted.supporting_messages)
    content = extracted.content
    approved_by = content.get("approved_by") or []
    actor_values = [
        content.get("proposed_by"),
        content.get("owner"),
        content.get("raised_by"),
        content.get("actor"),
        *approved_by,
    ]
    actors = sorted({str(actor) for actor in actor_values if actor})
    status = content.get("status")
    if not status and extracted.type == "DECISION":
        status = "active"
    if not status and extracted.type == "ACTION":
        status = "open"

    return PrimitiveCreate(
        type=primitive_type_from_extraction(extracted.type),
        statement=statement_from_extraction(extracted),
        body=json.dumps(content, sort_keys=True),
        status=status,
        conviction=conviction.conviction,
        source_episode_ids=[episode["id"]],
        supporting_messages=extracted.supporting_messages,
        actors=actors,
        metadata={
            "source": "brainshare.extraction",
            "extractor": "dev-rule",
            "extraction_type": extracted.type,
            "source_tool": episode.get("source_tool"),
            "source_location": episode.get("source_location"),
            "extractor_confidence": extracted.confidence,
            "conviction_factors": conviction.factors,
            "source_citations": citations,
        },
    )


def build_extraction_user_prompt(
    episode: dict[str, Any],
    request: EpisodeExtractionRequest,
) -> str:
    actor_context = request.actor_context or {}
    actor_lines = []
    for actor_id in episode.get("actors", []):
        detail = actor_context.get(actor_id, {})
        if isinstance(detail, dict):
            label = detail.get("name") or actor_id
            role = detail.get("role")
            authority = detail.get("authority")
            suffix = ", ".join(str(x) for x in [role, authority] if x)
            actor_lines.append(f"- {label}{f' ({suffix})' if suffix else ''}")
        else:
            actor_lines.append(f"- {actor_id}")

    return "\n".join(
        [
            "TEAM CONTEXT:",
            request.foundation_context or "No foundation context provided.",
            "",
            "ACTORS IN THIS CONVERSATION:",
            "\n".join(actor_lines) or "Unknown actors.",
            "",
            "CONVERSATION:",
            episode["raw_content"],
            "",
            "Extract all context primitives from this conversation. For each primitive, cite the specific message indices that support it. Return ONLY valid JSON.",
        ]
    )


def looks_like_question(content: str) -> bool:
    lower = content.lower()
    return "?" in content or lower.startswith(("what ", "why ", "how ", "when ", "who ", "should "))


def question_was_answered(
    question: dict[str, Any],
    following_messages: list[dict[str, Any]],
) -> bool:
    if not following_messages:
        return False
    question_terms = {
        token
        for token in re.findall(r"[a-z0-9]+", question["content"].lower())
        if len(token) > 3
    }
    for message in following_messages[:3]:
        content = message["content"].lower()
        if any(marker in content for marker in ["yes", "no", "handles", "because", "we can", "it does"]):
            return True
        message_terms = set(re.findall(r"[a-z0-9]+", content))
        if question_terms and len(question_terms & message_terms) >= 2:
            return True
    return False


def extract_episode_with_dev_rules(
    episode: dict[str, Any],
    actor_context: Optional[dict[str, Any]] = None,
) -> ExtractionResult:
    actor_context = actor_context or {}
    messages = parse_indexed_messages(episode.get("raw_content", ""))
    extractions: list[ExtractedPrimitive] = []
    decision_indices: list[int] = []
    decision_statement: Optional[str] = None

    for message in messages:
        content = message["content"]
        lower = content.lower()
        decision_match = re.search(
            r"(?:let'?s|we should|should just|going with|go with|use|choose|decided to)\s+(.+)",
            lower,
        )
        if decision_match:
            decision_indices = [message["index"]]
            decision_text = content[decision_match.start():].strip()
            decision_statement = decision_text[0].upper() + decision_text[1:]
            approved_by = []
            next_messages = [
                item
                for item in messages
                if message["index"] < item["index"] <= message["index"] + 3
            ]
            for next_message in next_messages:
                next_lower = next_message["content"].lower()
                if any(marker in next_lower for marker in ["agreed", "makes sense", "ok", "sounds good", "yes"]):
                    approved_by.append(next_message["author"])
                    decision_indices.append(next_message["index"])

            for citation in episode.get("metadata", {}).get("supporting_messages", []):
                if citation.get("reactions") and citation.get("index") == message["index"]:
                    decision_indices.append(citation["index"])

            supporting_messages = sorted(set(decision_indices))
            approved_by = sorted(
                {
                    *approved_by,
                    *approval_actors_from_reactions(
                        episode,
                        supporting_messages,
                        actor_context,
                    ),
                }
            )
            extractions.append(
                ExtractedPrimitive(
                    type="DECISION",
                    content={
                        "statement": decision_statement,
                        "rationale": "Rationale should be strengthened by the Claude extractor; dev extractor identified a decision trigger in the cited messages.",
                        "proposed_by": message["author"],
                        "approved_by": approved_by,
                        "type": "explicit",
                    },
                    supporting_messages=supporting_messages,
                    confidence=0.72,
                )
            )
            break

    for message in messages:
        content = message["content"]
        lower = content.lower()
        assumption_match = re.search(
            r"\b(?:because|since|assuming|as long as|given that)\b\s+(.+)",
            content,
            flags=re.IGNORECASE,
        )
        if assumption_match:
            extractions.append(
                ExtractedPrimitive(
                    type="ASSUMPTION",
                    content={
                        "statement": assumption_match.group(1).strip().rstrip("."),
                        "basis": content,
                        "status": "untested",
                        "linked_decision": decision_statement,
                    },
                    supporting_messages=[message["index"]],
                    confidence=0.68,
                )
            )
        if "free up to" in lower or "more than we need" in lower:
            extractions.append(
                ExtractedPrimitive(
                    type="ASSUMPTION",
                    content={
                        "statement": "The cited capacity or limit is sufficient for the team's near-term needs",
                        "basis": content,
                        "status": "untested",
                        "linked_decision": decision_statement,
                    },
                    supporting_messages=[message["index"]],
                    confidence=0.7,
                )
            )

    for message in messages:
        content = message["content"]
        lower = content.lower()
        owner_match = re.search(r"@?([A-Z][A-Za-z0-9_-]+).*?\b(can you|please|will do|i'?ll|i will)\b", content)
        if owner_match or any(marker in lower for marker in ["will do", "i'll", "i will", "todo", "by tomorrow"]):
            owner = owner_match.group(1) if owner_match else message["author"]
            deadline = "tomorrow" if "tomorrow" in lower else None
            extractions.append(
                ExtractedPrimitive(
                    type="ACTION",
                    content={
                        "statement": content.rstrip("."),
                        "owner": owner,
                        "deadline": deadline,
                        "linked_decision": decision_statement,
                    },
                    supporting_messages=[message["index"]],
                    confidence=0.78,
                )
            )

    for position, message in enumerate(messages):
        if looks_like_question(message["content"]):
            following = messages[position + 1:]
            if not question_was_answered(message, following):
                extractions.append(
                    ExtractedPrimitive(
                        type="QUESTION",
                        content={
                            "statement": message["content"].rstrip("?") + "?",
                            "raised_by": message["author"],
                            "context": "Raised in the cited conversation and not clearly resolved in the chunk.",
                            "status": "open",
                        },
                        supporting_messages=[message["index"]],
                        confidence=0.74,
                    )
                )

    for message in messages:
        lower = message["content"].lower()
        if any(marker in lower for marker in ["shipped", "merged", "finished", "blocked", "ready", "done"]):
            extractions.append(
                ExtractedPrimitive(
                    type="CONTEXT_UPDATE",
                    content={
                        "statement": message["content"].rstrip("."),
                        "actor": message["author"],
                        "relates_to": episode.get("metadata", {}).get("source_label"),
                    },
                    supporting_messages=[message["index"]],
                    confidence=0.66,
                )
            )

    unique: list[ExtractedPrimitive] = []
    seen = set()
    for extraction in extractions:
        key = (
            extraction.type,
            statement_from_extraction(extraction).lower(),
            tuple(extraction.supporting_messages),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(extraction)

    return ExtractionResult(
        primitives=unique,
        no_extractable_context=len(unique) == 0,
    )


class DevStore:
    """Small JSON-backed store until the Graphiti adapter is wired in."""

    backend_name = "json-dev"
    graph_status = "metadata-only"

    def __init__(self, path: Path):
        self.path = path

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {
                "team_name": "Demo Team",
                "episodes": [],
                "primitives": [],
                "legacy_context": [],
            }
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        tmp.replace(self.path)

    async def add_episode(self, payload: EpisodeCreate) -> Episode:
        data = self.load()
        episode = Episode(
            id=f"ep_{uuid4().hex}",
            created_at=now_iso(),
            timestamp_start=payload.timestamp_start or now_iso(),
            timestamp_end=payload.timestamp_end or payload.timestamp_start or now_iso(),
            **payload.model_dump(exclude={"timestamp_start", "timestamp_end"}),
        )
        data["episodes"].append(episode.model_dump())
        self.save(data)
        return episode

    async def add_primitive(self, payload: PrimitiveCreate) -> Primitive:
        data = self.load()
        primitive = Primitive(
            id=f"prim_{uuid4().hex}",
            created_at=now_iso(),
            updated_at=now_iso(),
            **payload.model_dump(),
        )
        data["primitives"].append(primitive.model_dump())
        self.save(data)
        return primitive

    async def add_legacy_context(self, payload: PushRequest) -> dict[str, Any]:
        data = self.load()
        item = {
            "content": payload.content,
            "category": payload.category,
            "compression_level": "none",
            "timestamp": now_iso(),
            "manual": True,
            "source_llm": payload.source_llm,
            "user_id": payload.user_id,
        }
        data["legacy_context"].append(item)
        self.save(data)
        return item


class GraphitiStore(DevStore):
    """Graphiti write-through store with JSON metadata for dev/API listing."""

    backend_name = "graphiti"
    graph_status = "neo4j-write-through"

    def __init__(self, path: Path):
        super().__init__(path)
        try:
            from graphiti_core import Graphiti
            from graphiti_core.nodes import EpisodeType
        except ImportError as exc:
            raise RuntimeError(
                "BRAINSHARE_STORE_BACKEND=graphiti requires graphiti-core and Python 3.10+"
            ) from exc

        self.EpisodeType = EpisodeType
        self.group_id = os.getenv("BRAINSHARE_GRAPHITI_GROUP_ID", "workos-dev")
        self.graphiti = Graphiti(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            os.getenv("NEO4J_USER", "neo4j"),
            os.getenv("NEO4J_PASSWORD", "brainshare-dev"),
        )

    async def add_episode(self, payload: EpisodeCreate) -> Episode:
        episode = await super().add_episode(payload)
        await self._add_episode_to_graphiti(payload, episode.id)
        return episode

    async def add_primitive(self, payload: PrimitiveCreate) -> Primitive:
        primitive = await super().add_primitive(payload)
        await self._add_primitive_to_graphiti(primitive)
        return primitive

    async def _add_episode_to_graphiti(
        self,
        payload: EpisodeCreate,
        episode_id: str,
    ) -> None:
        source = self._episode_type(payload)
        body: Any = payload.raw_content
        if source == self.EpisodeType.json:
            try:
                body = json.loads(payload.raw_content)
            except json.JSONDecodeError:
                body = {"raw_content": payload.raw_content}

        await self.graphiti.add_episode(
            name=episode_id,
            episode_body=body,
            source=source,
            source_description=f"{payload.source_tool}:{payload.source_location}",
            reference_time=parse_reference_time(payload.timestamp_start),
            group_id=self.group_id,
        )

    async def _add_primitive_to_graphiti(self, primitive: Primitive) -> None:
        await self.graphiti.add_episode(
            name=f"primitive:{primitive.id}",
            episode_body=primitive.model_dump(),
            source=self.EpisodeType.json,
            source_description=f"BrainShare typed primitive: {primitive.type}",
            reference_time=parse_reference_time(primitive.created_at),
            group_id=self.group_id,
        )

    def _episode_type(self, payload: EpisodeCreate) -> Any:
        requested = str(payload.metadata.get("episode_type", "")).lower()
        if requested == "json":
            return self.EpisodeType.json
        if requested == "message":
            return self.EpisodeType.message
        if requested == "text":
            return self.EpisodeType.text
        if payload.source_tool in {"discord", "slack"}:
            return self.EpisodeType.message
        if payload.source_tool == "workos":
            return self.EpisodeType.json
        return self.EpisodeType.text


def build_store() -> DevStore:
    backend = os.getenv("BRAINSHARE_STORE_BACKEND", "json").lower()
    if backend == "graphiti":
        return GraphitiStore(STORE_FILE)
    return DevStore(STORE_FILE)


store = build_store()
app = FastAPI(
    title="BrainShare API",
    version="0.2.0",
    description="BrainShare context engine API: episodes, typed primitives, and legacy MCP shims.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "healthy",
        "version": "0.2.0",
        "store": store.backend_name,
        "graph": store.graph_status,
    }


@app.post("/episodes", dependencies=[Depends(require_auth)])
async def create_episode(payload: EpisodeCreate) -> dict[str, Any]:
    episode = await store.add_episode(payload)
    return {"success": True, "episode": episode.model_dump()}


@app.get("/episodes", dependencies=[Depends(require_auth)])
def list_episodes(limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
    data = store.load()
    return {"success": True, "episodes": data["episodes"][-limit:]}


@app.get("/extraction/prompt", dependencies=[Depends(require_auth)])
def get_extraction_prompt() -> dict[str, Any]:
    return {
        "success": True,
        "system_prompt": EXTRACTION_SYSTEM_PROMPT,
        "response_schema": {
            "primitives": [
                {
                    "type": "DECISION|ASSUMPTION|ACTION|QUESTION|CONTEXT_UPDATE",
                    "content": {},
                    "supporting_messages": [1],
                    "confidence": 0.0,
                }
            ],
            "no_extractable_context": False,
        },
    }


@app.post("/episodes/{episode_id}/extract", dependencies=[Depends(require_auth)])
async def extract_episode(
    episode_id: str,
    payload: EpisodeExtractionRequest,
) -> dict[str, Any]:
    data = store.load()
    episode = next((item for item in data["episodes"] if item["id"] == episode_id), None)
    if not episode:
        raise HTTPException(status_code=404, detail="episode_not_found")
    if payload.provider == "claude":
        raise HTTPException(
            status_code=501,
            detail="claude_extraction_not_configured_yet",
        )

    result = extract_episode_with_dev_rules(episode, payload.actor_context)
    stored_primitives: list[Primitive] = []
    if payload.store_primitives:
        for extracted in result.primitives:
            stored_primitives.append(
                await store.add_primitive(
                    extracted_to_primitive_create(
                        episode,
                        extracted,
                        payload.actor_context,
                    )
                )
            )

    return {
        "success": True,
        "episode_id": episode_id,
        "provider": payload.provider,
        "prompt": {
            "system": EXTRACTION_SYSTEM_PROMPT,
            "user": build_extraction_user_prompt(episode, payload),
        },
        "extraction": result.model_dump(),
        "stored_primitives": [primitive.model_dump() for primitive in stored_primitives],
    }


@app.post("/sources/discord/messages", dependencies=[Depends(require_auth)])
async def ingest_discord_messages(payload: DiscordMessagesIn) -> dict[str, Any]:
    chunks = chunk_discord_messages(payload.messages)
    episodes = [
        await store.add_episode(discord_chunk_to_episode(payload, chunk, index))
        for index, chunk in enumerate(chunks)
    ]
    return {
        "success": True,
        "episode_count": len(episodes),
        "episodes": [episode.model_dump() for episode in episodes],
    }


@app.post("/primitives", dependencies=[Depends(require_auth)])
async def create_primitive(payload: PrimitiveCreate) -> dict[str, Any]:
    primitive = await store.add_primitive(payload)
    return {"success": True, "primitive": primitive.model_dump()}


@app.get("/primitives", dependencies=[Depends(require_auth)])
def list_primitives(
    query: str = "",
    type: Optional[PrimitiveType] = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    primitives = store.load()["primitives"]
    if type:
        primitives = [p for p in primitives if p["type"] == type]
    if query:
        q = query.lower()
        primitives = [
            p for p in primitives
            if q in p["statement"].lower() or q in (p.get("body") or "").lower()
        ]
    return {"success": True, "primitives": primitives[-limit:]}


@app.post("/analyze", dependencies=[Depends(require_auth)])
async def analyze(payload: AnalyzeRequest) -> dict[str, Any]:
    episode = await store.add_episode(
        EpisodeCreate(
            source_tool=payload.source_llm or "manual",
            source_location=f"analysis:{payload.trigger_type}",
            raw_content=payload.conversation_chunk,
            message_count=1,
            metadata={"trigger_type": payload.trigger_type},
        )
    )

    extracted: list[Primitive] = []
    lower_chunk = payload.conversation_chunk.lower()
    decision_triggers = [
        "decided",
        "choose",
        "going with",
        "we should",
        "lets go with",
        "let's go with",
        "agreed on",
        "conclusion",
        "final decision",
    ]
    if any(trigger in lower_chunk for trigger in decision_triggers):
        extracted.append(
            await store.add_primitive(
                PrimitiveCreate(
                    type="decision",
                    statement=f"Extracted decision from conversation: {payload.conversation_chunk[:120]}",
                    conviction=0.65,
                    source_episode_ids=[episode.id],
                    metadata={"auto_extracted": True, "extractor": "keyword-dev"},
                )
            )
        )

    return {
        "success": True,
        "episode": episode.model_dump(),
        "extracted_primitives": [p.model_dump() for p in extracted],
        "extracted_context": [
            {
                "content": p.statement,
                "category": p.type,
                "confidence": p.conviction,
                "auto_added": True,
            }
            for p in extracted
        ],
        "timestamp": now_iso(),
    }


@app.post("/push", dependencies=[Depends(require_auth)])
async def push(payload: PushRequest) -> dict[str, Any]:
    item = await store.add_legacy_context(payload)
    primitive_type: PrimitiveType = "context_update"
    if payload.category in {"decision", "assumption", "question"}:
        primitive_type = payload.category  # type: ignore[assignment]
    primitive = await store.add_primitive(
        PrimitiveCreate(
            type=primitive_type,
            statement=payload.content,
            status="manual",
            conviction=1.0,
            metadata={"legacy_category": payload.category, "source_llm": payload.source_llm},
        )
    )
    return {
        "success": True,
        "message": "Added to team context",
        "category": payload.category,
        "primitive_id": primitive.id,
        "timestamp": item["timestamp"],
    }


@app.post("/workos/memory-primitives", dependencies=[Depends(require_auth)])
async def ingest_workos_memory_primitive(
    payload: WorkOSMemoryPrimitiveIn,
) -> dict[str, Any]:
    episode_payload, primitive_payload = map_workos_memory_primitive(payload)
    episode = await store.add_episode(episode_payload)
    primitive_payload.source_episode_ids = [
        episode.id,
        *primitive_payload.source_episode_ids,
    ]
    primitive = await store.add_primitive(primitive_payload)
    return {
        "success": True,
        "episode": episode.model_dump(),
        "primitive": primitive.model_dump(),
        "mapping": {
            "workos_type": payload.type,
            "brainshare_type": primitive.type,
        },
    }


@app.get("/pull", dependencies=[Depends(require_auth)])
def pull(query: str = "", max_tokens: int = 4000) -> dict[str, Any]:
    del max_tokens
    data = store.load()
    q = query.lower()
    context_items = []
    for item in data["legacy_context"]:
        content = item["content"]
        if not q or q in content.lower() or any(word in content.lower() for word in q.split()):
            context_items.append({
                "content": content,
                "category": item["category"],
                "fidelity": item.get("compression_level", "none"),
                "relevance": 0.95,
                "timestamp": item["timestamp"],
            })
    for primitive in data["primitives"]:
        haystack = f"{primitive['statement']} {primitive.get('body') or ''}".lower()
        if not q or q in haystack or any(word in haystack for word in q.split()):
            context_items.append({
                "content": primitive["statement"],
                "category": primitive["type"],
                "fidelity": "structured",
                "relevance": 0.9,
                "timestamp": primitive["created_at"],
            })
    return {
        "success": True,
        "context": context_items,
        "total_tokens": int(sum(len(item["content"].split()) * 1.3 for item in context_items)),
        "compression_level": "light",
        "original_size": f"{len(context_items)} matching items",
    }


@app.get("/context", dependencies=[Depends(require_auth)])
def context() -> dict[str, Any]:
    data = store.load()
    recent = data["primitives"][-10:]
    summary = "## Team Context\n"
    for item in recent:
        summary += f"- {item['statement']} ({item['type']}, {item['created_at'][:10]})\n"
    return {
        "success": True,
        "context_summary": summary,
        "categories": sorted({item["type"] for item in recent}),
        "tokens_used": len(summary) // 4,
        "compression_level": "heavy",
        "original_size": f"{len(data['primitives'])} primitives compressed",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=os.getenv("BRAINSHARE_HOST", "0.0.0.0"),
        port=int(os.getenv("BRAINSHARE_PORT", "3100")),
        reload=os.getenv("BRAINSHARE_RELOAD", "true").lower() == "true",
    )
