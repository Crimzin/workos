from __future__ import annotations

from datetime import datetime
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


class DevStore:
    """Small JSON-backed store until the Graphiti adapter is wired in."""

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

    def add_episode(self, payload: EpisodeCreate) -> Episode:
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

    def add_primitive(self, payload: PrimitiveCreate) -> Primitive:
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

    def add_legacy_context(self, payload: PushRequest) -> dict[str, Any]:
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


store = DevStore(STORE_FILE)
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
        "store": "json-dev",
        "graph": "graphiti-adapter-pending",
    }


@app.post("/episodes", dependencies=[Depends(require_auth)])
def create_episode(payload: EpisodeCreate) -> dict[str, Any]:
    episode = store.add_episode(payload)
    return {"success": True, "episode": episode.model_dump()}


@app.get("/episodes", dependencies=[Depends(require_auth)])
def list_episodes(limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
    data = store.load()
    return {"success": True, "episodes": data["episodes"][-limit:]}


@app.post("/primitives", dependencies=[Depends(require_auth)])
def create_primitive(payload: PrimitiveCreate) -> dict[str, Any]:
    primitive = store.add_primitive(payload)
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
def analyze(payload: AnalyzeRequest) -> dict[str, Any]:
    episode = store.add_episode(
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
            store.add_primitive(
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
def push(payload: PushRequest) -> dict[str, Any]:
    item = store.add_legacy_context(payload)
    primitive_type: PrimitiveType = "context_update"
    if payload.category in {"decision", "assumption", "question"}:
        primitive_type = payload.category  # type: ignore[assignment]
    primitive = store.add_primitive(
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
