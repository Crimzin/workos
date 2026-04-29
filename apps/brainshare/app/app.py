from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4
import json
import os

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
