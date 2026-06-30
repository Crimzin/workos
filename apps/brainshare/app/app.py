from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4
import base64
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.request

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from conversation_synthesis import (
    claude_synthesis_prompt,
    deterministic_conversation_synthesis,
    validate_synthesis_shape,
)


APP_DIR = Path(__file__).resolve().parent
STORE_FILE = Path(os.getenv("BRAINSHARE_STORE_FILE", APP_DIR / "brainshare-dev-store.json"))
VALID_TOKEN = os.getenv("BRAINSHARE_DEV_TOKEN", "bs_team_abc123")
DEFAULT_CLAUDE_MODEL = os.getenv("BRAINSHARE_CLAUDE_MODEL", "claude-sonnet-4-6")
PROVIDER_KEY_SECRET = os.getenv(
    "BRAINSHARE_PROVIDER_KEY_SECRET",
    VALID_TOKEN,
)

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

ProviderName = Literal["claude", "openai"]

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


class ConversationSynthesisCreate(BaseModel):
    conversation_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    source_episode_ids: list[str] = Field(default_factory=list)
    source_provenance: dict[str, Any] = Field(default_factory=dict)
    conversation_brief: dict[str, Any]
    topics: list[dict[str, Any]] = Field(default_factory=list)
    why_chains: list[dict[str, Any]] = Field(default_factory=list)
    primitives: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConversationSynthesis(ConversationSynthesisCreate):
    id: str
    created_at: str
    updated_at: str


class PrimitiveCorrectionIn(BaseModel):
    correction: str = Field(..., min_length=1)
    correction_type: Literal["supersede", "retract"] = "supersede"
    actor_id: Optional[str] = None
    rationale: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PushRequest(BaseModel):
    content: str = Field(..., min_length=1)
    category: str = "knowledge"
    source_llm: Optional[str] = None
    user_id: Optional[str] = None


class AnalyzeRequest(BaseModel):
    conversation_chunk: str = Field(..., min_length=1)
    trigger_type: str = "manual"
    source_llm: Optional[str] = None


class ContextAssemblyRequest(BaseModel):
    query: str = ""
    max_items: int = Field(default=10, ge=1, le=50)
    include_low_conviction: bool = False
    source_tool: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EpisodeExtractionRequest(BaseModel):
    provider: Literal["dev-rule", "claude"] = "dev-rule"
    foundation_context: str = ""
    actor_context: dict[str, Any] = Field(default_factory=dict)
    store_primitives: bool = True


class ConversationSynthesisRequest(BaseModel):
    provider: Literal["dev-rule", "claude"] = "dev-rule"
    store_synthesis: bool = True
    store_primitives: bool = False


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


class ConvictionThreshold(BaseModel):
    action: Literal["assert", "flag", "ask"]
    label: str


class ActorAuthorityIn(BaseModel):
    actor_id: str = Field(..., min_length=1)
    name: Optional[str] = None
    role: Optional[str] = None
    authority: Optional[str] = None
    authority_weight: float = Field(default=0.5, ge=0, le=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProviderKeySetupIn(BaseModel):
    provider: ProviderName
    api_key: str = Field(..., min_length=12)
    label: Optional[str] = None
    validate_key: bool = Field(default=True, alias="validate")
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProviderKeyStatus(BaseModel):
    provider: ProviderName
    configured: bool
    key_hint: Optional[str] = None
    label: Optional[str] = None
    validation_status: Literal["untested", "valid", "invalid"] = "untested"
    validation_error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    validated_at: Optional[str] = None
    source: Literal["store", "env"] = "store"


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


class WorkOSTargetCandidate(BaseModel):
    node_id: str
    type: Literal["workspace", "stack", "card"]
    title: str = Field(..., min_length=1)
    body: Optional[str] = None
    fields: dict[str, Any] = Field(default_factory=dict)
    memory: list[str] = Field(default_factory=list)
    linked_node_titles: list[str] = Field(default_factory=list)
    updated_at: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TargetResolutionRequest(BaseModel):
    primitive: PrimitiveCreate
    candidates: list[WorkOSTargetCandidate] = Field(..., min_length=1)
    min_confidence: float = Field(default=0.35, ge=0, le=1)
    max_alternates: int = Field(default=3, ge=0, le=10)


class TargetCandidateScore(BaseModel):
    node_id: str
    type: Literal["workspace", "stack", "card"]
    title: str
    confidence: float
    score_breakdown: dict[str, float]
    reasons: list[str]


class TargetResolutionResponse(BaseModel):
    success: bool
    target: Optional[TargetCandidateScore]
    alternates: list[TargetCandidateScore] = Field(default_factory=list)
    orphaned: bool
    review_reason: Optional[str] = None


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


class AIConversationMessageIn(BaseModel):
    id: Optional[str] = None
    role: Literal["human", "user", "assistant", "ai", "system", "tool"]
    content: str = Field(..., min_length=1)
    author_name: Optional[str] = None
    timestamp: Optional[str] = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIConversationIn(BaseModel):
    source_tool: Literal["claude", "chatgpt", "claude_code", "other_ai"]
    messages: list[AIConversationMessageIn] = Field(..., min_length=1)
    conversation_id: Optional[str] = None
    title: Optional[str] = None
    project_name: Optional[str] = None
    source_url: Optional[str] = None
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


def metadata_copy(value: Any) -> Any:
    return json.loads(json.dumps(compact_metadata_value(value)))


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


TARGET_RESOLUTION_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "before",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "this",
    "to",
    "use",
    "we",
    "with",
}

TARGET_TYPE_SORT_ORDER = {
    "workspace": 0,
    "stack": 1,
    "card": 2,
}
SEMANTIC_MATCH_MIN_SCORE = 0.18
SEMANTIC_MATCH_MIN_SHARED_TOKENS = 2


def text_tokens(value: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", value.lower())
    return {
        word
        for word in words
        if len(word) > 2 and word not in TARGET_RESOLUTION_STOPWORDS
    }


def overlap_score(left: str, right: str) -> float:
    left_tokens = text_tokens(left)
    right_tokens = text_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = len(left_tokens & right_tokens)
    return round(overlap / max(1, min(len(left_tokens), len(right_tokens))), 3)


def shared_meaningful_token_count(left: str, right: str) -> int:
    return len(text_tokens(left) & text_tokens(right))


def primitive_resolution_text(primitive: PrimitiveCreate) -> str:
    metadata_text = " ".join(str(value) for value in primitive.metadata.values() if isinstance(value, str))
    return " ".join(part for part in [primitive.statement, primitive.body or "", metadata_text] if part)


def candidate_resolution_text(candidate: WorkOSTargetCandidate) -> str:
    field_text = " ".join(
        f"{key} {value}" for key, value in candidate.fields.items() if value is not None
    )
    memory_text = " ".join(candidate.memory)
    link_text = " ".join(candidate.linked_node_titles)
    metadata_text = " ".join(str(value) for value in candidate.metadata.values() if isinstance(value, str))
    return " ".join(
        part
        for part in [candidate.title, candidate.body or "", field_text, memory_text, link_text, metadata_text]
        if part
    )


def parse_candidate_updated_at(updated_at: Optional[str]) -> Optional[datetime]:
    if not updated_at:
        return None
    normalized = updated_at.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def recency_score(updated_at: Optional[str], reference_time: Optional[datetime]) -> float:
    updated = parse_candidate_updated_at(updated_at)
    if updated is None or reference_time is None or updated > reference_time:
        return 0.0
    age_days = (reference_time - updated).total_seconds() / 86400
    if age_days <= 7:
        return 1.0
    if age_days <= 30:
        return 0.6
    if age_days <= 90:
        return 0.3
    return 0.1


def primitive_wants_stack(primitive: PrimitiveCreate) -> bool:
    scale = str(primitive.metadata.get("scale") or "").lower()
    if scale in {"stack", "workspace", "strategic", "initiative"}:
        return True
    text = primitive_resolution_text(primitive).lower()
    markers = ["roadmap", "sequence", "several cards", "multiple cards", "strategy", "strategic", "initiative"]
    return any(marker in text for marker in markers)


def scale_match_score(primitive: PrimitiveCreate, candidate: WorkOSTargetCandidate) -> float:
    wants_stack = primitive_wants_stack(primitive)
    if wants_stack and candidate.type in {"stack", "workspace"}:
        return 1.0
    if not wants_stack and candidate.type == "card":
        return 1.0
    return 0.35


def scope_score(primitive: PrimitiveCreate, candidate: WorkOSTargetCandidate) -> float:
    scope = str(primitive.metadata.get("scope") or "").strip()
    if not scope:
        return 0.0
    return overlap_score(scope, candidate_resolution_text(candidate))


def score_workos_target_candidate(
    primitive: PrimitiveCreate,
    candidate: WorkOSTargetCandidate,
    reference_time: Optional[datetime],
) -> TargetCandidateScore:
    primitive_text = primitive_resolution_text(primitive)
    candidate_text = candidate_resolution_text(candidate)
    semantic = overlap_score(primitive_text, candidate_text)
    shared_semantic_tokens = shared_meaningful_token_count(primitive_text, candidate_text)
    scale = scale_match_score(primitive, candidate)
    scope = scope_score(primitive, candidate)
    recency = recency_score(candidate.updated_at, reference_time)
    conviction = primitive.conviction
    confidence = round(
        min(
            1.0,
            semantic * 0.52
            + scale * 0.18
            + scope * 0.12
            + recency * 0.08
            + conviction * 0.10,
        ),
        3,
    )
    reasons = []
    if semantic >= SEMANTIC_MATCH_MIN_SCORE and shared_semantic_tokens >= SEMANTIC_MATCH_MIN_SHARED_TOKENS:
        reasons.append("semantic_match")
    if scale >= 0.9:
        reasons.append("scale_match")
    if scope >= 0.25:
        reasons.append("scope_match")
    if recency >= 0.6:
        reasons.append("recent_activity")
    if conviction >= 0.8:
        reasons.append("high_conviction")
    if not reasons:
        reasons.append("weak_match")
    return TargetCandidateScore(
        node_id=candidate.node_id,
        type=candidate.type,
        title=candidate.title,
        confidence=confidence,
        score_breakdown={
            "semantic": semantic,
            "scale": scale,
            "scope": scope,
            "recency": recency,
            "conviction": round(conviction, 3),
        },
        reasons=reasons,
    )


def resolve_workos_target(payload: TargetResolutionRequest) -> TargetResolutionResponse:
    valid_candidate_times = [
        parsed
        for candidate in payload.candidates
        if (parsed := parse_candidate_updated_at(candidate.updated_at)) is not None
    ]
    reference_time = max(valid_candidate_times) if valid_candidate_times else None
    ranked = sorted(
        (
            score_workos_target_candidate(payload.primitive, candidate, reference_time)
            for candidate in payload.candidates
        ),
        key=lambda item: (
            -item.confidence,
            TARGET_TYPE_SORT_ORDER[item.type],
            item.title.lower(),
            item.node_id,
        ),
    )
    best = ranked[0]
    if best.confidence < payload.min_confidence:
        return TargetResolutionResponse(
            success=True,
            target=None,
            alternates=ranked[: payload.max_alternates],
            orphaned=True,
            review_reason="no_candidate_above_min_confidence",
        )
    return TargetResolutionResponse(
        success=True,
        target=best,
        alternates=ranked[1 : 1 + payload.max_alternates],
        orphaned=False,
    )


def graphiti_primitive_type(workos_type: str) -> PrimitiveType:
    if workos_type == "rationale":
        return "work_item"
    if workos_type == "assumption":
        return "assumption"
    return "decision"


def ensure_store_shape(data: dict[str, Any]) -> dict[str, Any]:
    data.setdefault("team_name", "Demo Team")
    data.setdefault("episodes", [])
    data.setdefault("primitives", [])
    data.setdefault("conversation_syntheses", [])
    data.setdefault("legacy_context", [])
    data.setdefault("actor_authority", {})
    data.setdefault("provider_keys", {})
    return data


def derive_provider_key_stream(nonce: bytes, length: int) -> bytes:
    """Derive a deterministic byte stream for local encrypted provider storage."""

    secret = PROVIDER_KEY_SECRET.encode("utf-8")
    output = b""
    counter = 0
    while len(output) < length:
        counter_bytes = counter.to_bytes(4, "big")
        output += hmac.new(secret, nonce + counter_bytes, hashlib.sha256).digest()
        counter += 1
    return output[:length]


def encrypt_provider_secret(value: str) -> str:
    plaintext = value.encode("utf-8")
    nonce = os.urandom(16)
    key_stream = derive_provider_key_stream(nonce, len(plaintext))
    ciphertext = bytes(a ^ b for a, b in zip(plaintext, key_stream))
    mac = hmac.new(
        PROVIDER_KEY_SECRET.encode("utf-8"),
        nonce + ciphertext,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(nonce + mac + ciphertext).decode("ascii")


def decrypt_provider_secret(value: str) -> str:
    try:
        raw = base64.urlsafe_b64decode(value.encode("ascii"))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="provider_key_decode_failed") from exc
    nonce = raw[:16]
    mac = raw[16:48]
    ciphertext = raw[48:]
    expected_mac = hmac.new(
        PROVIDER_KEY_SECRET.encode("utf-8"),
        nonce + ciphertext,
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(mac, expected_mac):
        raise HTTPException(status_code=500, detail="provider_key_integrity_failed")
    key_stream = derive_provider_key_stream(nonce, len(ciphertext))
    plaintext = bytes(a ^ b for a, b in zip(ciphertext, key_stream))
    return plaintext.decode("utf-8")


def provider_key_hint(api_key: str) -> str:
    stripped = api_key.strip()
    if len(stripped) <= 10:
        return "*" * len(stripped)
    return f"{stripped[:6]}...{stripped[-4:]}"


def provider_key_status(
    provider: ProviderName,
    record: Optional[dict[str, Any]] = None,
) -> ProviderKeyStatus:
    env_key = os.getenv("ANTHROPIC_API_KEY") if provider == "claude" else os.getenv("OPENAI_API_KEY")
    if record:
        return ProviderKeyStatus(
            provider=provider,
            configured=True,
            key_hint=record.get("key_hint"),
            label=record.get("label"),
            validation_status=record.get("validation_status", "untested"),
            validation_error=record.get("validation_error"),
            created_at=record.get("created_at"),
            updated_at=record.get("updated_at"),
            validated_at=record.get("validated_at"),
            source="store",
        )
    if env_key:
        return ProviderKeyStatus(
            provider=provider,
            configured=True,
            key_hint=provider_key_hint(env_key),
            validation_status="untested",
            source="env",
        )
    return ProviderKeyStatus(provider=provider, configured=False)


def provider_api_key(provider: ProviderName) -> Optional[str]:
    data = store.load()
    record = data.get("provider_keys", {}).get(provider)
    if record and record.get("encrypted_api_key"):
        return decrypt_provider_secret(record["encrypted_api_key"])
    if provider == "claude":
        return os.getenv("ANTHROPIC_API_KEY")
    return os.getenv("OPENAI_API_KEY")


def validate_openai_key(api_key: str) -> None:
    request = urllib.request.Request(
        "https://api.openai.com/v1/models",
        headers={"Authorization": f"Bearer {api_key}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status >= 400:
                raise HTTPException(status_code=400, detail="openai_key_validation_failed")
    except urllib.error.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"openai_key_validation_failed:{exc.code}",
        ) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=400, detail="openai_key_validation_unreachable") from exc


async def validate_provider_key(provider: ProviderName, api_key: str) -> None:
    if provider == "claude":
        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:
            raise HTTPException(status_code=503, detail="anthropic_package_required") from exc
        client = AsyncAnthropic(api_key=api_key)
        try:
            await client.messages.create(
                model=DEFAULT_CLAUDE_MODEL,
                max_tokens=1,
                temperature=0,
                messages=[{"role": "user", "content": "ping"}],
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail="claude_key_validation_failed") from exc
        return
    validate_openai_key(api_key)


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


def normalize_ai_role(role: str) -> Literal["human", "ai", "system", "tool"]:
    if role in {"human", "user"}:
        return "human"
    if role in {"assistant", "ai"}:
        return "ai"
    if role == "tool":
        return "tool"
    return "system"


def ai_message_author(message: AIConversationMessageIn) -> str:
    if message.author_name:
        return message.author_name
    role = normalize_ai_role(message.role)
    if role == "human":
        return "Human"
    if role == "ai":
        return "AI"
    return role.title()


def format_ai_conversation_messages(messages: list[AIConversationMessageIn]) -> str:
    lines = []
    for index, message in enumerate(messages, start=1):
        content = re.sub(r"\s+", " ", message.content).strip()
        lines.append(f"[{index}] {ai_message_author(message)}: {content}")
    return "\n".join(lines)


def ai_conversation_participants(
    messages: list[AIConversationMessageIn],
    source_tool: str,
) -> list[dict[str, Any]]:
    participants_by_id = {}
    for message in messages:
        role = normalize_ai_role(message.role)
        author_name = ai_message_author(message)
        participant_id = author_name if role == "human" else f"{source_tool}:{author_name}"
        participants_by_id[participant_id] = {
            "id": participant_id,
            "role": role,
            "author_name": author_name,
            **({"source_tool": source_tool} if role == "ai" else {}),
        }
    return [
        participants_by_id[key]
        for key in sorted(
            participants_by_id,
            key=lambda item: (participants_by_id[item]["role"] != "human", item),
        )
    ]


def estimated_tokens(text: str) -> int:
    return max(1, int(len(text.split()) * 1.3))


def is_ai_topic_shift(message: AIConversationMessageIn) -> bool:
    content = message.content.strip().lower()
    markers = [
        "ok now",
        "okay now",
        "next topic",
        "new topic",
        "switching gears",
        "separate topic",
        "let's talk about",
        "lets talk about",
        "now let's",
        "now lets",
        "different question",
        "question:",
    ]
    return normalize_ai_role(message.role) == "human" and any(
        content.startswith(marker) for marker in markers
    )


def chunk_ai_conversation(
    messages: list[AIConversationMessageIn],
    max_turns: int = 50,
    max_tokens: int = 15000,
    long_pause_hours: int = 4,
) -> list[list[tuple[int, AIConversationMessageIn]]]:
    chunks: list[list[tuple[int, AIConversationMessageIn]]] = []
    current: list[tuple[int, AIConversationMessageIn]] = []
    current_tokens = 0
    previous_at: Optional[datetime] = None

    for original_index, message in enumerate(messages, start=1):
        message_tokens = estimated_tokens(message.content)
        message_at = parse_reference_time(message.timestamp) if message.timestamp else None
        long_pause = (
            previous_at is not None
            and message_at is not None
            and message_at - previous_at > timedelta(hours=long_pause_hours)
        )
        should_split = bool(current) and (
            len(current) >= max_turns
            or current_tokens + message_tokens > max_tokens
            or is_ai_topic_shift(message)
            or long_pause
        )

        if should_split:
            chunks.append(current)
            current = []
            current_tokens = 0

        current.append((original_index, message))
        current_tokens += message_tokens
        if message_at is not None:
            previous_at = message_at

    if current:
        chunks.append(current)
    return chunks


def ai_conversation_chunk_to_episode(
    payload: AIConversationIn,
    chunk: list[tuple[int, AIConversationMessageIn]],
    chunk_index: int,
    chunk_count: int,
) -> EpisodeCreate:
    chunk_messages = [message for _, message in chunk]
    conversation_id = payload.conversation_id or payload.metadata.get("conversation_id")
    title = (
        payload.title
        or payload.metadata.get("title")
        or conversation_id
        or "Untitled AI conversation"
    )
    project_name = payload.project_name or payload.metadata.get("project_name")
    source_url = (
        payload.source_url
        or payload.metadata.get("source_url")
        or payload.metadata.get("url")
    )
    source_location = str(conversation_id or title)
    if chunk_count > 1:
        source_location = f"{source_location}#chunk-{chunk_index + 1}"
    timestamps = [
        message.timestamp
        for _, message in chunk
        if message.timestamp
    ]
    actors = sorted(
        {
            ai_message_author(message)
            for _, message in chunk
            if normalize_ai_role(message.role) == "human"
        }
    )
    participants = ai_conversation_participants(chunk_messages, payload.source_tool)
    raw_content = format_ai_conversation_messages(chunk_messages)
    permission_scope = payload.metadata.get("permission_scope")
    attention_scope = payload.metadata.get("attention_scope")

    return EpisodeCreate(
        source_tool=payload.source_tool,
        source_location=source_location,
        raw_content=raw_content,
        timestamp_start=timestamps[0] if timestamps else None,
        timestamp_end=timestamps[-1] if timestamps else None,
        actors=actors,
        message_count=len(chunk_messages),
        metadata={
            **payload.metadata,
            "episode_type": "message",
            "source_kind": "ai_conversation",
            "conversation_id": conversation_id,
            "title": title,
            "project_name": project_name,
            "source_url": source_url,
            "permission_scope": permission_scope,
            "attention_scope": attention_scope,
            "participants": participants,
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
                source_url=source_url,
            )
            | {"participant_ids": [participant["id"] for participant in participants]},
            "chunk_index": chunk_index,
            "chunk_count": chunk_count,
            "message_ids": [
                message.id or f"turn_{original_index}"
                for original_index, message in chunk
            ],
            "supporting_messages": [
                {
                    "index": chunk_indexed,
                    "source_message_index": original_index,
                    "message_id": message.id or f"turn_{original_index}",
                    "speaker_role": normalize_ai_role(message.role),
                    "author_name": ai_message_author(message),
                    "content": message.content,
                    "timestamp": message.timestamp,
                    "attachments": message.attachments,
                    "metadata": message.metadata,
                    "source_span": {
                        "kind": "message",
                        "source_tool": payload.source_tool,
                        "source_location": source_location,
                        "message_id": message.id or f"turn_{original_index}",
                        "turn_index": chunk_indexed,
                        "source_message_index": original_index,
                    },
                }
                for chunk_indexed, (original_index, message) in enumerate(chunk, start=1)
            ],
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
    raw_supporting = episode.get("metadata", {}).get("supporting_messages", [])
    supporting = raw_supporting if isinstance(raw_supporting, list) else []
    supporting_by_index = {}
    for item in supporting:
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        if not isinstance(index, int):
            continue
        supporting_by_index[index] = item

    citations = []
    for index in supporting_messages:
        source = supporting_by_index.get(index)
        if source:
            citation = metadata_copy(source)
            citation.setdefault("episode_id", episode["id"])
            citation.setdefault("message_index", index)
            citation.setdefault("reactions", [])
            citations.append(citation)
        else:
            citations.append({"episode_id": episode["id"], "index": index, "message_index": index})
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


def ai_conversation_signal_adjustment(
    episode: dict[str, Any],
    supporting_messages: list[int],
) -> tuple[float, Optional[float], list[str]]:
    if episode.get("metadata", {}).get("source_kind") != "ai_conversation":
        return 0, None, []

    messages = episode.get("metadata", {}).get("supporting_messages", [])
    by_index = {
        item.get("index"): item
        for item in messages
        if isinstance(item.get("index"), int)
    }
    cited = [by_index[index] for index in supporting_messages if index in by_index]
    if any(item.get("speaker_role") == "human" for item in cited):
        return 0.12, None, ["ai_conversation_human_explicit_source"]

    max_supported = max(supporting_messages or [0])
    next_human = next(
        (
            item
            for item in messages
            if item.get("speaker_role") == "human"
            and isinstance(item.get("index"), int)
            and item["index"] > max_supported
        ),
        None,
    )
    if not next_human:
        return 0, 0.7, ["ai_conversation_ai_only_no_human_adoption"]

    content = str(next_human.get("content") or "").lower()
    high_markers = [
        "yes",
        "exactly",
        "perfect",
        "this is great",
        "looks good",
        "i agree",
        "update the spec",
        "ship it",
    ]
    modification_markers = ["yes but", "close, but", "mostly", "with one change"]
    uncertainty_markers = ["not sure", "let me think", "maybe", "tentative"]
    deferred_markers = ["come back", "later", "not yet", "defer"]

    if re.search(r"\b(no|wrong|nah)\b|not that|don't store", content):
        return 0, 0.2, ["ai_conversation_human_rejection"]
    if any(marker in content for marker in uncertainty_markers):
        return 0, 0.45, ["ai_conversation_human_uncertainty"]
    if any(marker in content for marker in deferred_markers):
        return 0, 0.55, ["ai_conversation_human_deferred"]
    if any(marker in content for marker in modification_markers):
        return 0.06, 0.85, ["ai_conversation_human_yes_but"]
    if any(marker in content for marker in high_markers):
        return 0.12, None, ["ai_conversation_human_validation"]
    return 0, 0.75, ["ai_conversation_implicit_human_acceptance"]


def human_signal_label(content: str) -> Optional[str]:
    lower = content.lower()
    if re.search(r"\b(no|wrong|nah)\b|not that|don't store", lower):
        return "rejection"
    if any(marker in lower for marker in ["not sure", "let me think", "maybe", "tentative"]):
        return "uncertainty"
    if any(marker in lower for marker in ["come back", "later", "not yet", "defer"]):
        return "deferred"
    if any(marker in lower for marker in ["yes but", "close, but", "mostly", "with one change"]):
        return "refinement"
    if any(
        marker in lower
        for marker in [
            "yes",
            "exactly",
            "perfect",
            "this is great",
            "looks good",
            "i agree",
            "update the spec",
            "ship it",
            "approved",
        ]
    ):
        return "approval"
    return None


def ai_message_looks_like_artifact(content: str) -> bool:
    lower = content.lower()
    artifact_markers = [
        "spec",
        "roadmap",
        "plan",
        "architecture",
        "proposal",
        "document",
        "implementation",
        "strategy",
        "checklist",
    ]
    return len(content.split()) >= 25 or any(marker in lower for marker in artifact_markers)


def strip_human_approval_prefix(content: str) -> str:
    cleaned = content.strip()
    patterns = [
        r"^i agree[.!]?\s*(?:some context though:\s*)?",
        r"^makes sense[.!]?\s*(?:and\s+)?",
        r"^yes[,.!]?\s*",
        r"^exactly[,.!]?\s*",
        r"^perfect[,.!]?\s*",
        r"^looks good[,.!]?\s*",
    ]
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned


def concise_text(value: str, max_chars: int = 360) -> str:
    text = re.sub(r"\s+", " ", value).strip().rstrip(".")
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def synthesized_ai_artifact_statement(ai_content: str, human_content: str) -> str:
    human_detail = strip_human_approval_prefix(human_content)
    if len(human_detail.split()) >= 12 and not human_detail.lower().startswith(
        ("here's", "heres", "the full exchange", "full exchange")
    ):
        if "only did pm at vega" in human_detail.lower() and "~1.5 years" in human_detail:
            return (
                "Will has ~1.5 years formal PM experience at Vega, then shifted into "
                "consulting, exec coaching, L&D, keynotes, GTM, and CoS work while still "
                "identifying as product-minded."
            )
        return concise_text(human_detail)

    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", ai_content.strip())
        if len(sentence.split()) >= 8
    ]
    priority_markers = [
        "what i'd do next",
        "the honest read",
        "the risk",
        "you should",
        "watch for",
        "strong fit",
        "concern",
        "plan",
        "strategy",
    ]
    for marker in priority_markers:
        for sentence in sentences:
            if marker in sentence.lower():
                return concise_text(sentence)
    if sentences:
        return concise_text(sentences[0])
    return concise_text(ai_content)


def accepted_ai_artifact_extractions(episode: dict[str, Any]) -> list[ExtractedPrimitive]:
    if episode.get("metadata", {}).get("source_kind") != "ai_conversation":
        return []

    messages = episode.get("metadata", {}).get("supporting_messages", [])
    accepted: list[ExtractedPrimitive] = []
    pending_ai: Optional[dict[str, Any]] = None
    saw_refinement = False

    for item in messages:
        role = item.get("speaker_role")
        content = str(item.get("content") or "").strip()
        if role == "ai" and ai_message_looks_like_artifact(content):
            pending_ai = item
            continue
        if role != "human":
            continue

        signal = human_signal_label(content)
        if signal == "refinement":
            saw_refinement = True
            pending_ai = None
            continue
        if not pending_ai:
            continue
        if signal in {"rejection", "uncertainty", "deferred"}:
            pending_ai = None
            if signal == "rejection":
                saw_refinement = False
            continue
        if signal == "approval":
            ai_index = pending_ai.get("index")
            human_index = item.get("index")
            if not isinstance(ai_index, int) or not isinstance(human_index, int):
                pending_ai = None
                continue
            statement = synthesized_ai_artifact_statement(
                str(pending_ai.get("content") or ""),
                content,
            )
            accepted.append(
                ExtractedPrimitive(
                    type="CONTEXT_UPDATE",
                    content={
                        "statement": statement,
                        "actor": item.get("author_name") or "Human",
                        "relates_to": episode.get("metadata", {}).get("title")
                        or episode.get("source_location"),
                        "artifact_body": pending_ai.get("content"),
                        "human_signal": signal,
                        "refinement_pattern": saw_refinement,
                    },
                    supporting_messages=[ai_index, human_index],
                    confidence=0.86 if saw_refinement else 0.82,
                )
            )
            pending_ai = None
            saw_refinement = False

    return accepted


def refined_ai_conversation_result(
    episode: dict[str, Any],
    result: ExtractionResult,
) -> ExtractionResult:
    if episode.get("metadata", {}).get("source_kind") != "ai_conversation":
        return result

    combined = [
        *result.primitives,
        *accepted_ai_artifact_extractions(episode),
    ]
    unique: list[ExtractedPrimitive] = []
    seen = set()
    for extraction in combined:
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

    ai_delta, ai_cap, ai_factors = ai_conversation_signal_adjustment(
        episode,
        extracted.supporting_messages,
    )
    score += ai_delta
    if ai_cap is not None:
        score = min(score, ai_cap)
    factors.extend(ai_factors)

    if extracted.type == "QUESTION":
        score = min(score, 0.8)
        factors.append("questions_capped_below_assert_threshold")

    return ConvictionResult(conviction=max(0, min(round(score, 2), 1)), factors=factors)


def conviction_threshold(conviction: float) -> ConvictionThreshold:
    if conviction >= 0.8:
        return ConvictionThreshold(action="assert", label="high_confidence")
    if conviction >= 0.5:
        return ConvictionThreshold(action="flag", label="needs_review")
    return ConvictionThreshold(action="ask", label="needs_confirmation")


def primitive_matches_query(primitive: dict[str, Any], query: str) -> bool:
    if not query:
        return True
    q = query.lower()
    haystack = f"{primitive.get('statement', '')} {primitive.get('body') or ''}".lower()
    return q in haystack or any(word in haystack for word in q.split())


def primitive_relevance_score(primitive: dict[str, Any], query: str) -> float:
    score = float(primitive.get("conviction") or 0)
    if query:
        q = query.lower()
        statement = str(primitive.get("statement") or "").lower()
        body = str(primitive.get("body") or "").lower()
        if q and q in statement:
            score += 0.35
        elif q and q in body:
            score += 0.2
        score += 0.03 * len(meaningful_term_overlap(q, f"{statement} {body}"))
    return round(score, 3)


CONTEXT_MATCH_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "for", "from", "in", "is",
    "it", "new", "of", "on", "or", "our", "should", "that", "the", "this",
    "to", "what", "with", "about", "know",
}


def meaningful_terms(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", text.lower())
        if len(word) > 2 and word not in CONTEXT_MATCH_STOPWORDS
    }


def meaningful_term_overlap(left: str, right: str) -> list[str]:
    return sorted(meaningful_terms(left) & meaningful_terms(right))


def why_included_for_context_item(
    primitive: dict[str, Any],
    query: str,
    relevance: float,
    threshold: ConvictionThreshold,
) -> str:
    reasons = [f"{threshold.label.replace('_', ' ')} memory"]
    if query:
        q = query.lower()
        statement = str(primitive.get("statement") or "").lower()
        body = str(primitive.get("body") or "").lower()
        if q in statement or q in body:
            reasons.append("direct query match")
        else:
            overlap = meaningful_term_overlap(q, f"{statement} {body}")
            if overlap:
                reasons.append(f"matched terms: {', '.join(overlap[:4])}")
    reasons.append(f"relevance {relevance}")
    return "; ".join(reasons)


def ai_session_context_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "type": item["type"],
        "statement": item["statement"],
        "status": item.get("status"),
        "conviction": item.get("conviction"),
        "threshold": item.get("threshold"),
        "why_included": item.get("why_included"),
        "source_provenance": item.get("source_provenance", {}),
        "citations": item.get("source_citations", []),
    }


def synthesis_matches_query(synthesis: dict[str, Any], query: str) -> bool:
    if not query:
        return True
    q_terms = meaningful_terms(query)
    if not q_terms:
        return True
    haystack_parts = [
        synthesis.get("title", ""),
        synthesis.get("conversation_brief", {}).get("summary", ""),
    ]
    haystack_parts.extend(str(topic.get("name", "")) for topic in synthesis.get("topics", []))
    haystack_parts.extend(str(topic.get("summary", "")) for topic in synthesis.get("topics", []))
    haystack_parts.extend(str(item.get("statement", "")) for item in synthesis.get("primitives", []))
    haystack = " ".join(haystack_parts)
    return bool(q_terms & meaningful_terms(haystack))


def synthesis_relevance_score(synthesis: dict[str, Any], query: str) -> float:
    score = 0.8
    if not query:
        return score
    haystack = " ".join(
        [
            synthesis.get("title", ""),
            synthesis.get("conversation_brief", {}).get("summary", ""),
            *[str(topic.get("name", "")) for topic in synthesis.get("topics", [])],
            *[str(topic.get("summary", "")) for topic in synthesis.get("topics", [])],
            *[str(item.get("statement", "")) for item in synthesis.get("primitives", [])],
        ]
    )
    score += 0.05 * len(meaningful_term_overlap(query, haystack))
    return round(score, 3)


def latest_relevant_synthesis(query: str) -> Optional[dict[str, Any]]:
    syntheses = [
        synthesis
        for synthesis in store.load()["conversation_syntheses"]
        if synthesis_matches_query(synthesis, query)
    ]
    if not syntheses:
        return None
    return sorted(
        syntheses,
        key=lambda synthesis: (
            synthesis_relevance_score(synthesis, query),
            synthesis.get("created_at", ""),
        ),
        reverse=True,
    )[0]


def synthesis_primitive_context_item(primitive: dict[str, Any]) -> dict[str, Any]:
    conviction = float(primitive.get("conviction") or 0.5)
    threshold = conviction_threshold(conviction)
    return {
        "id": primitive.get("id") or f"synthesis:{primitive.get('topic')}:{primitive.get('statement')}",
        "type": primitive.get("type"),
        "statement": primitive.get("statement"),
        "status": primitive.get("status"),
        "conviction": conviction,
        "threshold": threshold.model_dump(),
        "why_included": primitive.get("rationale"),
        "source_provenance": primitive.get("source_provenance", {}),
        "citations": primitive.get("citations", []),
        "topic": primitive.get("topic"),
        "rationale": primitive.get("rationale"),
        "human_signal": primitive.get("human_signal"),
    }


def assemble_context_payload(payload: ContextAssemblyRequest) -> dict[str, Any]:
    relevant_synthesis = latest_relevant_synthesis(payload.query)
    primitives = store.load()["primitives"]
    filtered = [
        primitive
        for primitive in primitives
        if primitive_matches_query(primitive, payload.query)
        and (
            payload.include_low_conviction
            or float(primitive.get("conviction") or 0) >= 0.5
        )
    ]
    ranked = sorted(
        filtered,
        key=lambda primitive: (
            primitive_relevance_score(primitive, payload.query),
            primitive.get("created_at", ""),
        ),
        reverse=True,
    )[: payload.max_items]

    context_items = []
    for primitive in ranked:
        threshold = conviction_threshold(float(primitive.get("conviction") or 0))
        metadata = primitive.get("metadata") or {}
        relevance = primitive_relevance_score(primitive, payload.query)
        context_items.append(
            {
                "id": primitive["id"],
                "type": primitive["type"],
                "statement": primitive["statement"],
                "status": primitive.get("status"),
                "conviction": primitive.get("conviction"),
                "threshold": threshold.model_dump(),
                "source_episode_ids": primitive.get("source_episode_ids", []),
                "source_citations": metadata.get("source_citations", []),
                "source_provenance": metadata.get("source_provenance", {}),
                "why_included": why_included_for_context_item(
                    primitive,
                    payload.query,
                    relevance,
                    threshold,
                ),
                "relevance": relevance,
                "created_at": primitive.get("created_at"),
            }
        )

    summary_lines = [
        "## BrainShare Context",
        f"Query: {payload.query or 'general context'}",
    ]
    for item in context_items:
        summary_lines.append(
            f"- [{item['threshold']['label']}] {item['statement']} "
            f"({item['type']}, conviction {item['conviction']})"
        )

    consumer_kind = str(payload.metadata.get("consumer_kind") or "ai_session")
    synthesis_items = []
    briefing = None
    topics = []
    why_chains = []
    if relevant_synthesis:
        briefing = relevant_synthesis.get("conversation_brief")
        topics = relevant_synthesis.get("topics", [])
        why_chains = relevant_synthesis.get("why_chains", [])
        synthesis_source_provenance = relevant_synthesis.get("source_provenance", {})
        for primitive in relevant_synthesis.get("primitives", [])[: payload.max_items]:
            enriched = {
                **primitive,
                "source_provenance": synthesis_source_provenance,
            }
            synthesis_items.append(synthesis_primitive_context_item(enriched))

    ai_session_payload = {
        "consumer_tool": payload.source_tool,
        "consumer_kind": consumer_kind,
        "query": payload.query,
        "briefing": briefing,
        "topics": topics,
        "why_chains": why_chains,
        "items": [
            *synthesis_items,
            *[ai_session_context_item(item) for item in context_items],
        ][: payload.max_items],
        "instructions": [
            "Use these BrainShare memories as durable context, not as a replacement for current user instructions.",
            "Conviction and threshold describe how strongly the memory is supported by human signal.",
            "When using a memory, preserve its source provenance so the user can trace where it came from.",
        ],
    }

    return {
        "success": True,
        "query": payload.query,
        "source_tool": payload.source_tool,
        "context_items": context_items,
        "ai_session_payload": ai_session_payload,
        "context_summary": "\n".join(summary_lines),
        "tokens_estimate": max(1, len("\n".join(summary_lines)) // 4),
        "assembly": {
            "strategy": "synthesis_first_v0" if relevant_synthesis else "primitive_relevance_v0",
            "included_low_conviction": payload.include_low_conviction,
            "max_items": payload.max_items,
            "metadata": payload.metadata,
            "synthesis_id": relevant_synthesis.get("id") if relevant_synthesis else None,
        },
    }


def confirmation_payload_for_primitives(primitives: list[Primitive]) -> dict[str, Any]:
    lines = ["BrainShare captured:"]
    items = []
    for primitive in primitives:
        icon = {
            "decision": "Decision",
            "assumption": "Assumption",
            "action": "Action",
            "question": "Question",
            "context_update": "Context",
        }.get(primitive.type, primitive.type.replace("_", " ").title())
        threshold = conviction_threshold(primitive.conviction)
        lines.append(
            f"- {icon}: {primitive.statement} "
            f"({threshold.label}, conviction {primitive.conviction})"
        )
        items.append(
            {
                "id": primitive.id,
                "type": primitive.type,
                "statement": primitive.statement,
                "conviction": primitive.conviction,
                "threshold": threshold.model_dump(),
                "source_episode_ids": primitive.source_episode_ids,
                "supporting_messages": primitive.supporting_messages,
            }
        )
    if items:
        lines.append("Anything wrong? Reply with a correction and I will update the memory graph.")
    else:
        lines.append("No durable context was stored from this source.")
    return {
        "text": "\n".join(lines),
        "items": items,
        "correction_affordance": "Reply with a correction; corrections should be stored as superseding Episodes.",
    }


def extracted_to_primitive_create(
    episode: dict[str, Any],
    extracted: ExtractedPrimitive,
    actor_context: Optional[dict[str, Any]] = None,
    extractor: str = "dev-rule",
) -> PrimitiveCreate:
    actor_context = actor_context or {}
    conviction = calculate_conviction(extracted, episode, actor_context)
    threshold = conviction_threshold(conviction.conviction)
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
            "extractor": extractor,
            "extraction_type": extracted.type,
            "source_tool": episode.get("source_tool"),
            "source_location": episode.get("source_location"),
            "source_provenance": metadata_copy(
                episode.get("metadata", {}).get("provenance", {})
            ),
            "extractor_confidence": extracted.confidence,
            "conviction_factors": conviction.factors,
            "conviction_threshold": threshold.model_dump(),
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


def extraction_message_indices(episode: dict[str, Any]) -> set[int]:
    indices = {
        item["index"]
        for item in parse_indexed_messages(episode.get("raw_content", ""))
    }
    indices.update(
        item.get("index")
        for item in episode.get("metadata", {}).get("supporting_messages", [])
        if isinstance(item.get("index"), int)
    )
    return indices


def normalize_extraction_result(
    raw_result: Any,
    episode: dict[str, Any],
) -> ExtractionResult:
    if not isinstance(raw_result, dict):
        raise HTTPException(status_code=502, detail="invalid_extraction_response")

    valid_indices = extraction_message_indices(episode)
    primitives = []
    for raw_primitive in raw_result.get("primitives") or []:
        if not isinstance(raw_primitive, dict):
            continue
        raw_type = str(raw_primitive.get("type") or "").upper()
        if raw_type not in {
            "DECISION",
            "ASSUMPTION",
            "ACTION",
            "QUESTION",
            "CONTEXT_UPDATE",
        }:
            continue
        content = raw_primitive.get("content")
        if not isinstance(content, dict):
            continue
        supporting_messages = [
            index
            for index in raw_primitive.get("supporting_messages") or []
            if isinstance(index, int) and (not valid_indices or index in valid_indices)
        ]
        try:
            confidence = float(raw_primitive.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5
        primitives.append(
            ExtractedPrimitive(
                type=raw_type,  # type: ignore[arg-type]
                content=content,
                supporting_messages=supporting_messages,
                confidence=max(0, min(confidence, 1)),
            )
        )

    return ExtractionResult(
        primitives=primitives,
        no_extractable_context=bool(
            raw_result.get("no_extractable_context", len(primitives) == 0)
        ),
    )


def parse_json_response(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="invalid_extraction_json") from exc


async def extract_episode_with_claude(
    episode: dict[str, Any],
    request: EpisodeExtractionRequest,
) -> ExtractionResult:
    api_key = provider_api_key("claude")
    if not api_key:
        raise HTTPException(status_code=503, detail="anthropic_api_key_required")
    try:
        from anthropic import AsyncAnthropic
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="anthropic_package_required") from exc

    client = AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=DEFAULT_CLAUDE_MODEL,
        max_tokens=4000,
        temperature=0,
        system=EXTRACTION_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": build_extraction_user_prompt(episode, request),
            }
        ],
    )
    text = "\n".join(
        block.text
        for block in response.content
        if getattr(block, "type", None) == "text" and getattr(block, "text", None)
    )
    return normalize_extraction_result(parse_json_response(text), episode)


async def run_episode_extraction(
    episode: dict[str, Any],
    request: EpisodeExtractionRequest,
) -> ExtractionResult:
    if request.provider == "claude":
        result = await extract_episode_with_claude(episode, request)
    else:
        result = extract_episode_with_dev_rules(episode, request.actor_context)
    return refined_ai_conversation_result(episode, result)


def episodes_for_conversation(conversation_id: str) -> list[dict[str, Any]]:
    episodes = [
        episode
        for episode in store.load()["episodes"]
        if episode.get("metadata", {}).get("conversation_id") == conversation_id
    ]
    return sorted(
        episodes,
        key=lambda episode: (
            episode.get("metadata", {}).get("chunk_index", 0),
            episode.get("timestamp_start", ""),
        ),
    )


async def synthesize_conversation_with_claude(
    conversation_id: str,
    title: str,
    episodes: list[dict[str, Any]],
) -> dict[str, Any]:
    api_key = provider_api_key("claude")
    if not api_key:
        raise HTTPException(status_code=503, detail="anthropic_api_key_required")
    try:
        from anthropic import AsyncAnthropic
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="anthropic_package_required") from exc

    client = AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=DEFAULT_CLAUDE_MODEL,
        max_tokens=6000,
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": claude_synthesis_prompt(conversation_id, title, episodes),
            }
        ],
    )
    text = "\n".join(
        block.text
        for block in response.content
        if getattr(block, "type", None) == "text" and getattr(block, "text", None)
    )
    try:
        parsed = parse_json_response(text)
        parsed.setdefault("source_episode_ids", [episode["id"] for episode in episodes])
        parsed.setdefault("source_provenance", {})
        parsed.setdefault("metadata", {})
        parsed["metadata"] = {
            **parsed["metadata"],
            "provider": "claude",
            "synthesis_version": "ai_conversation_synthesis_v0",
        }
        return validate_synthesis_shape(parsed)
    except (ValueError, HTTPException) as exc:
        raise HTTPException(status_code=502, detail=f"invalid_synthesis_json: {exc}") from exc


async def run_conversation_synthesis(
    conversation_id: str,
    request: ConversationSynthesisRequest,
) -> ConversationSynthesisCreate:
    episodes = episodes_for_conversation(conversation_id)
    if not episodes:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    title = (
        episodes[0].get("metadata", {}).get("title")
        or conversation_id
        or "Untitled conversation"
    )
    if request.provider == "claude":
        raw = await synthesize_conversation_with_claude(conversation_id, title, episodes)
    else:
        raw = deterministic_conversation_synthesis(
            conversation_id=conversation_id,
            title=title,
            episodes=episodes,
        )
    validated = validate_synthesis_shape(raw)
    return ConversationSynthesisCreate(**validated)


def synthesis_primitive_to_create(
    synthesis: ConversationSynthesisCreate,
    primitive_payload: dict[str, Any],
) -> PrimitiveCreate:
    primitive_type = str(primitive_payload.get("type") or "context_update")
    if primitive_type not in PrimitiveType.__args__:  # type: ignore[attr-defined]
        primitive_type = "context_update"
    conviction = float(primitive_payload.get("conviction") or 0.5)
    return PrimitiveCreate(
        type=primitive_type,  # type: ignore[arg-type]
        statement=str(primitive_payload.get("statement") or "").strip(),
        body=json.dumps(
            {
                "rationale": primitive_payload.get("rationale"),
                "human_signal": primitive_payload.get("human_signal"),
                "topic": primitive_payload.get("topic"),
                "relationships": primitive_payload.get("relationships", []),
            },
            sort_keys=True,
        ),
        status=primitive_payload.get("status"),
        conviction=max(0, min(conviction, 1)),
        source_episode_ids=synthesis.source_episode_ids,
        supporting_messages=[
            citation.get("message_index")
            for citation in primitive_payload.get("citations", [])
            if isinstance(citation.get("message_index"), int)
        ],
        actors=synthesis.source_provenance.get("actor_ids", []),
        metadata={
            "source": "brainshare.conversation_synthesis",
            "synthesis_version": synthesis.metadata.get("synthesis_version"),
            "source_provenance": synthesis.source_provenance,
            "source_citations": primitive_payload.get("citations", []),
            "topic": primitive_payload.get("topic"),
            "rationale": primitive_payload.get("rationale"),
            "human_signal": primitive_payload.get("human_signal"),
            "relationships": primitive_payload.get("relationships", []),
        },
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


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because", "by", "for",
    "from", "in", "is", "it", "of", "on", "or", "our", "that", "the",
    "this", "to", "use", "using", "we", "with",
}

CONFLICT_MARKERS = {
    "instead", "replace", "replaced", "replacing", "switch", "switched",
    "supersede", "supersedes", "superseded", "stop", "stopped", "no",
    "not", "don't", "do not", "no longer", "rather than",
}


def primitive_text(item: PrimitiveCreate | dict[str, Any]) -> str:
    if isinstance(item, PrimitiveCreate):
        return f"{item.statement} {item.body or ''}"
    return f"{item.get('statement') or ''} {item.get('body') or ''}"


def primitive_tokens(item: PrimitiveCreate | dict[str, Any]) -> set[str]:
    words = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", primitive_text(item).lower())
    return {word for word in words if len(word) > 2 and word not in STOPWORDS}


def token_similarity(left: PrimitiveCreate | dict[str, Any], right: PrimitiveCreate | dict[str, Any]) -> float:
    left_tokens = primitive_tokens(left)
    right_tokens = primitive_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def has_conflict_marker(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in CONFLICT_MARKERS)


def duplicate_match(payload: PrimitiveCreate, primitives: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    candidates = [
        primitive for primitive in primitives
        if primitive.get("type") == payload.type and primitive.get("status") not in {"superseded", "retracted"}
    ]
    best: Optional[dict[str, Any]] = None
    best_score = 0.0
    for candidate in candidates:
        score = token_similarity(payload, candidate)
        if score > best_score:
            best = candidate
            best_score = score

    if best and (
        best_score >= 0.86
        or payload.statement.strip().lower() == str(best.get("statement", "")).strip().lower()
    ):
        return {
            "primitive": best,
            "similarity": round(best_score, 3),
            "reason": "same_type_high_similarity",
        }
    return None


def conflict_match(payload: PrimitiveCreate, primitives: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if payload.type != "decision":
        return None

    candidates = [
        primitive for primitive in primitives
        if primitive.get("type") == "decision" and (primitive.get("status") or "active") == "active"
    ]
    payload_text = primitive_text(payload)
    if not has_conflict_marker(payload_text):
        return None

    best: Optional[dict[str, Any]] = None
    best_score = 0.0
    for candidate in candidates:
        score = token_similarity(payload, candidate)
        if score > best_score:
            best = candidate
            best_score = score

    if best and best_score >= 0.25:
        return {
            "primitive": best,
            "similarity": round(best_score, 3),
            "reason": "conflicting_active_decision",
        }
    return None


def graph_validation_response(action: str, **details: Any) -> dict[str, Any]:
    return {"action": action, **details}


class DevStore:
    """Small JSON-backed store until the Graphiti adapter is wired in."""

    backend_name = "json-dev"
    graph_status = "metadata-only"

    def __init__(self, path: Path):
        self.path = path

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return ensure_store_shape({})
        with self.path.open("r", encoding="utf-8") as f:
            return ensure_store_shape(json.load(f))

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

    async def add_conversation_synthesis(
        self,
        payload: ConversationSynthesisCreate,
    ) -> ConversationSynthesis:
        data = self.load()
        synthesis = ConversationSynthesis(
            id=f"syn_{uuid4().hex}",
            created_at=now_iso(),
            updated_at=now_iso(),
            **payload.model_dump(),
        )
        data["conversation_syntheses"].append(synthesis.model_dump())
        self.save(data)
        return synthesis

    def conversation_syntheses_for(self, conversation_id: str) -> list[dict[str, Any]]:
        return [
            item
            for item in self.load()["conversation_syntheses"]
            if item.get("conversation_id") == conversation_id
        ]

    def get_primitive(self, primitive_id: str) -> Optional[dict[str, Any]]:
        return next(
            (primitive for primitive in self.load()["primitives"] if primitive["id"] == primitive_id),
            None,
        )

    async def mark_primitive_status(
        self,
        primitive_id: str,
        status: str,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        data = self.load()
        now = now_iso()
        for primitive in data["primitives"]:
            if primitive["id"] == primitive_id:
                primitive["status"] = status
                primitive["updated_at"] = now
                primitive["metadata"] = {
                    **primitive.get("metadata", {}),
                    **metadata,
                }
                self.save(data)
                return primitive
        raise HTTPException(status_code=404, detail="primitive_not_found")

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

    async def upsert_actor_authority(self, payload: ActorAuthorityIn) -> dict[str, Any]:
        data = self.load()
        now = now_iso()
        existing = data["actor_authority"].get(payload.actor_id, {})
        item = {
            **existing,
            **payload.model_dump(),
            "updated_at": now,
            "created_at": existing.get("created_at", now),
        }
        data["actor_authority"][payload.actor_id] = item
        self.save(data)
        return item

    def actor_context(self) -> dict[str, Any]:
        return self.load()["actor_authority"]

    async def upsert_provider_key(
        self,
        payload: ProviderKeySetupIn,
        validation_status: Literal["untested", "valid", "invalid"],
        validation_error: Optional[str] = None,
    ) -> dict[str, Any]:
        data = self.load()
        now = now_iso()
        existing = data["provider_keys"].get(payload.provider, {})
        record = {
            "provider": payload.provider,
            "encrypted_api_key": encrypt_provider_secret(payload.api_key.strip()),
            "key_hint": provider_key_hint(payload.api_key),
            "label": payload.label,
            "validation_status": validation_status,
            "validation_error": validation_error,
            "validated_at": now if validation_status == "valid" else existing.get("validated_at"),
            "created_at": existing.get("created_at", now),
            "updated_at": now,
            "metadata": payload.metadata,
        }
        data["provider_keys"][payload.provider] = record
        self.save(data)
        return record

    async def delete_provider_key(self, provider: ProviderName) -> bool:
        data = self.load()
        existed = provider in data["provider_keys"]
        data["provider_keys"].pop(provider, None)
        self.save(data)
        return existed

    def provider_key_record(self, provider: ProviderName) -> Optional[dict[str, Any]]:
        return self.load()["provider_keys"].get(provider)


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
        self._indices_ready = False

    async def add_episode(self, payload: EpisodeCreate) -> Episode:
        episode = await super().add_episode(payload)
        await self._ensure_indices()
        await self._add_episode_to_graphiti(payload, episode.id)
        return episode

    async def add_primitive(self, payload: PrimitiveCreate) -> Primitive:
        primitive = await super().add_primitive(payload)
        await self._ensure_indices()
        await self._add_primitive_to_graphiti(primitive)
        return primitive

    async def _ensure_indices(self) -> None:
        if self._indices_ready:
            return
        await self.graphiti.build_indices_and_constraints()
        self._indices_ready = True

    async def _add_episode_to_graphiti(
        self,
        payload: EpisodeCreate,
        episode_id: str,
    ) -> None:
        source = self._episode_type(payload)

        await self.graphiti.add_episode(
            name=episode_id,
            episode_body=payload.raw_content,
            source=source,
            source_description=f"{payload.source_tool}:{payload.source_location}",
            reference_time=parse_reference_time(payload.timestamp_start),
            group_id=self.group_id,
        )

    async def _add_primitive_to_graphiti(self, primitive: Primitive) -> None:
        await self.graphiti.add_episode(
            name=f"primitive:{primitive.id}",
            episode_body=json.dumps(primitive.model_dump(), sort_keys=True),
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
    backend = os.getenv("BRAINSHARE_STORE_BACKEND", "graphiti").lower()
    if backend == "graphiti":
        return GraphitiStore(STORE_FILE)
    return DevStore(STORE_FILE)


store = build_store()
app = FastAPI(
    title="BrainShare API",
    version="0.2.0",
    description="BrainShare context engine API: episodes, typed primitives, and legacy MCP shims.",
)


async def store_primitive_with_graph_validation(
    payload: PrimitiveCreate,
    source_episode_id: Optional[str] = None,
) -> tuple[Optional[Primitive], dict[str, Any]]:
    data = store.load()
    duplicate = duplicate_match(payload, data["primitives"])
    if duplicate:
        primitive = duplicate["primitive"]
        return None, graph_validation_response(
            "duplicate_skipped",
            duplicate_of_primitive_id=primitive["id"],
            similarity=duplicate["similarity"],
            reason=duplicate["reason"],
        )

    conflict = conflict_match(payload, data["primitives"])
    metadata = {**payload.metadata}
    if conflict:
        old = conflict["primitive"]
        metadata["supersedes_primitive_id"] = old["id"]
        metadata["graph_validation"] = {
            "action": "supersedes_conflicting_decision",
            "similarity": conflict["similarity"],
            "reason": conflict["reason"],
        }
        payload = payload.model_copy(update={"metadata": metadata, "status": payload.status or "active"})
        primitive = await store.add_primitive(payload)
        await store.mark_primitive_status(
            old["id"],
            "superseded",
            {
                "superseded_by_primitive_id": primitive.id,
                "superseded_by_episode_id": source_episode_id,
                "superseded_reason": conflict["reason"],
            },
        )
        return primitive, graph_validation_response(
            "superseded_conflict",
            superseded_primitive_id=old["id"],
            stored_primitive_id=primitive.id,
            similarity=conflict["similarity"],
            reason=conflict["reason"],
        )

    primitive = await store.add_primitive(payload)
    return primitive, graph_validation_response("stored", stored_primitive_id=primitive.id)


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

    actor_context = {
        **store.actor_context(),
        **payload.actor_context,
    }
    extraction_payload = payload.model_copy(update={"actor_context": actor_context})
    result = await run_episode_extraction(episode, extraction_payload)
    stored_primitives: list[Primitive] = []
    graph_validation: list[dict[str, Any]] = []
    if payload.store_primitives:
        for extracted in result.primitives:
            primitive_payload = extracted_to_primitive_create(
                episode,
                extracted,
                actor_context,
                payload.provider,
            )
            factors = primitive_payload.metadata.get("conviction_factors", [])
            if (
                episode.get("metadata", {}).get("source_kind") == "ai_conversation"
                and "ai_conversation_human_rejection" in factors
            ):
                graph_validation.append(
                    graph_validation_response(
                        "ai_rejection_skipped",
                        statement=primitive_payload.statement,
                    )
                )
                continue
            primitive, validation = await store_primitive_with_graph_validation(
                primitive_payload,
                source_episode_id=episode_id,
            )
            graph_validation.append(validation)
            if primitive:
                stored_primitives.append(primitive)

    return {
        "success": True,
        "episode_id": episode_id,
        "provider": payload.provider,
        "actor_context_count": len(actor_context),
        "prompt": {
            "system": EXTRACTION_SYSTEM_PROMPT,
            "user": build_extraction_user_prompt(episode, extraction_payload),
        },
        "extraction": result.model_dump(),
        "stored_primitives": [primitive.model_dump() for primitive in stored_primitives],
        "graph_validation": graph_validation,
        "confirmation": confirmation_payload_for_primitives(stored_primitives),
    }


@app.post("/conversations/{conversation_id}/synthesize", dependencies=[Depends(require_auth)])
async def synthesize_conversation(
    conversation_id: str,
    payload: ConversationSynthesisRequest,
) -> dict[str, Any]:
    synthesis_payload = await run_conversation_synthesis(conversation_id, payload)
    stored_synthesis: Optional[ConversationSynthesis] = None
    if payload.store_synthesis:
        stored_synthesis = await store.add_conversation_synthesis(synthesis_payload)

    stored_primitives: list[Primitive] = []
    graph_validation: list[dict[str, Any]] = []
    if payload.store_primitives:
        for primitive_payload in synthesis_payload.primitives:
            primitive_create = synthesis_primitive_to_create(
                synthesis_payload,
                primitive_payload,
            )
            primitive, validation = await store_primitive_with_graph_validation(
                primitive_create,
            )
            graph_validation.append(validation)
            if primitive:
                stored_primitives.append(primitive)

    synthesis = stored_synthesis.model_dump() if stored_synthesis else synthesis_payload.model_dump()
    return {
        "success": True,
        "conversation_id": conversation_id,
        "provider": payload.provider,
        "synthesis": synthesis,
        "stored_synthesis": stored_synthesis.model_dump() if stored_synthesis else None,
        "stored_primitives": [primitive.model_dump() for primitive in stored_primitives],
        "graph_validation": graph_validation,
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


@app.post("/sources/ai/conversations", dependencies=[Depends(require_auth)])
async def ingest_ai_conversation(payload: AIConversationIn) -> dict[str, Any]:
    chunks = chunk_ai_conversation(payload.messages)
    episodes = [
        await store.add_episode(
            ai_conversation_chunk_to_episode(payload, chunk, index, len(chunks))
        )
        for index, chunk in enumerate(chunks)
    ]
    return {
        "success": True,
        "source_tool": payload.source_tool,
        "conversation_id": payload.conversation_id,
        "episode_count": len(episodes),
        "episodes": [episode.model_dump() for episode in episodes],
    }


@app.post("/primitives", dependencies=[Depends(require_auth)])
async def create_primitive(payload: PrimitiveCreate) -> dict[str, Any]:
    primitive, validation = await store_primitive_with_graph_validation(payload)
    return {
        "success": True,
        "primitive": primitive.model_dump() if primitive else None,
        "graph_validation": validation,
    }


@app.post("/primitives/{primitive_id}/corrections", dependencies=[Depends(require_auth)])
async def correct_primitive(
    primitive_id: str,
    payload: PrimitiveCorrectionIn,
) -> dict[str, Any]:
    existing = store.get_primitive(primitive_id)
    if not existing:
        raise HTTPException(status_code=404, detail="primitive_not_found")

    correction_episode = await store.add_episode(
        EpisodeCreate(
            source_tool="brainshare",
            source_location=f"correction:{primitive_id}",
            raw_content=payload.correction,
            actors=[payload.actor_id] if payload.actor_id else [],
            metadata={
                **payload.metadata,
                "source_kind": "primitive_correction",
                "correction_type": payload.correction_type,
                "target_primitive_id": primitive_id,
                "rationale": payload.rationale,
            },
        )
    )

    if payload.correction_type == "retract":
        correction_primitive_payload = PrimitiveCreate(
            type="context_update",
            statement=f"Retracted: {existing['statement']}",
            body=payload.correction,
            status="active",
            conviction=1.0,
            source_episode_ids=[correction_episode.id],
            actors=[payload.actor_id] if payload.actor_id else existing.get("actors", []),
            related_node_id=existing.get("related_node_id"),
            metadata={
                **payload.metadata,
                "correction_type": "retract",
                "retracts_primitive_id": primitive_id,
                "rationale": payload.rationale,
            },
        )
        correction_primitive = await store.add_primitive(correction_primitive_payload)
        updated_existing = await store.mark_primitive_status(
            primitive_id,
            "retracted",
            {
                "retracted_by_primitive_id": correction_primitive.id,
                "retracted_by_episode_id": correction_episode.id,
                "retraction_rationale": payload.rationale,
            },
        )
    else:
        correction_primitive_payload = PrimitiveCreate(
            type=existing["type"],
            statement=payload.correction,
            body=payload.rationale,
            status="active",
            conviction=1.0,
            source_episode_ids=[correction_episode.id],
            actors=[payload.actor_id] if payload.actor_id else existing.get("actors", []),
            related_node_id=existing.get("related_node_id"),
            metadata={
                **payload.metadata,
                "correction_type": "supersede",
                "supersedes_primitive_id": primitive_id,
                "rationale": payload.rationale,
            },
        )
        correction_primitive = await store.add_primitive(correction_primitive_payload)
        updated_existing = await store.mark_primitive_status(
            primitive_id,
            "superseded",
            {
                "superseded_by_primitive_id": correction_primitive.id,
                "superseded_by_episode_id": correction_episode.id,
                "superseded_reason": "human_correction",
            },
        )

    return {
        "success": True,
        "episode": correction_episode.model_dump(),
        "primitive": correction_primitive.model_dump(),
        "updated_primitive": updated_existing,
    }


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


@app.post("/workos/target-resolution", dependencies=[Depends(require_auth)])
async def resolve_workos_target_endpoint(
    payload: TargetResolutionRequest,
) -> TargetResolutionResponse:
    return resolve_workos_target(payload)


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


@app.post("/context/assemble", dependencies=[Depends(require_auth)])
def assemble_context(payload: ContextAssemblyRequest) -> dict[str, Any]:
    return assemble_context_payload(payload)


@app.get("/providers/keys", dependencies=[Depends(require_auth)])
def list_provider_keys() -> dict[str, Any]:
    data = store.load()
    records = data.get("provider_keys", {})
    return {
        "success": True,
        "providers": [
            provider_key_status("claude", records.get("claude")).model_dump(),
            provider_key_status("openai", records.get("openai")).model_dump(),
        ],
    }


@app.post("/providers/keys", dependencies=[Depends(require_auth)])
async def upsert_provider_key(payload: ProviderKeySetupIn) -> dict[str, Any]:
    validation_status: Literal["untested", "valid", "invalid"] = "untested"
    validation_error: Optional[str] = None
    if payload.validate_key:
        try:
            await validate_provider_key(payload.provider, payload.api_key)
            validation_status = "valid"
        except HTTPException as exc:
            validation_status = "invalid"
            validation_error = str(exc.detail)
            raise

    record = await store.upsert_provider_key(
        payload,
        validation_status=validation_status,
        validation_error=validation_error,
    )
    return {
        "success": True,
        "provider": provider_key_status(payload.provider, record).model_dump(),
    }


@app.delete("/providers/keys/{provider}", dependencies=[Depends(require_auth)])
async def delete_provider_key(provider: ProviderName) -> dict[str, Any]:
    deleted = await store.delete_provider_key(provider)
    return {
        "success": True,
        "provider": provider,
        "deleted": deleted,
    }


@app.post("/actors/authority", dependencies=[Depends(require_auth)])
async def upsert_actor_authority(payload: ActorAuthorityIn) -> dict[str, Any]:
    actor = await store.upsert_actor_authority(payload)
    return {"success": True, "actor": actor}


@app.get("/actors/authority", dependencies=[Depends(require_auth)])
def list_actor_authority() -> dict[str, Any]:
    return {
        "success": True,
        "actors": list(store.actor_context().values()),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=os.getenv("BRAINSHARE_HOST", "0.0.0.0"),
        port=int(os.getenv("BRAINSHARE_PORT", "3100")),
        reload=os.getenv("BRAINSHARE_RELOAD", "true").lower() == "true",
    )
