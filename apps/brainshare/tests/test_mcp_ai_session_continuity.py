import asyncio
import importlib.util
import json
import sys
import types
from dataclasses import dataclass
from importlib.machinery import SourceFileLoader
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MCP_PATH = ROOT / "mcp" / "mcp-brainshare-server.py"


@dataclass
class FakeTool:
    name: str
    description: str
    inputSchema: dict


@dataclass
class FakeTextContent:
    type: str
    text: str


class FakeServer:
    def __init__(self, name):
        self.name = name

    def list_tools(self):
        return lambda func: func

    def call_tool(self):
        return lambda func: func

    def get_capabilities(self, **kwargs):
        return {}

    async def run(self, *args, **kwargs):
        return None


def install_mcp_shims() -> None:
    mcp_module = types.ModuleType("mcp")
    server_module = types.ModuleType("mcp.server")
    server_module.Server = FakeServer
    models_module = types.ModuleType("mcp.server.models")
    models_module.InitializationOptions = lambda **kwargs: kwargs
    stdio_module = types.ModuleType("mcp.server.stdio")
    stdio_module.stdio_server = lambda: None
    types_module = types.ModuleType("mcp.types")
    types_module.Tool = FakeTool
    types_module.TextContent = FakeTextContent
    types_module.Resource = object
    types_module.ImageContent = object
    types_module.EmbeddedResource = object
    sys.modules.update(
        {
            "mcp": mcp_module,
            "mcp.server": server_module,
            "mcp.server.models": models_module,
            "mcp.server.stdio": stdio_module,
            "mcp.types": types_module,
        }
    )


def load_mcp_server():
    install_mcp_shims()
    loader = SourceFileLoader("brainshare_mcp_server", str(MCP_PATH))
    spec = importlib.util.spec_from_loader("brainshare_mcp_server", loader)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_mcp_lists_get_context_tool():
    server = load_mcp_server()

    tools = asyncio.run(server.handle_list_tools())
    names = {tool.name for tool in tools}

    assert "brainshare_get_context" in names
    tool = next(item for item in tools if item.name == "brainshare_get_context")
    assert tool.inputSchema["properties"]["query"]["type"] == "string"
    assert tool.inputSchema["properties"]["source_tool"]["type"] == "string"


def test_mcp_get_context_returns_ai_session_payload_with_traceability():
    server = load_mcp_server()
    observed = {}

    class FakeResponse:
        def json(self):
            return {
                "success": True,
                "ai_session_payload": {
                    "consumer_tool": "claude",
                    "consumer_kind": "ai_session",
                    "items": [
                        {
                            "id": "prim_1",
                            "statement": "BrainShare preserves provenance.",
                            "citations": [
                                {
                                    "source_span": {
                                        "source_tool": "chatgpt",
                                        "source_location": "chatgpt-conv-123",
                                    }
                                }
                            ],
                        }
                    ],
                },
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, headers=None, json=None):
            observed.update({"url": url, "headers": headers, "json": json})
            return FakeResponse()

    server.httpx.AsyncClient = FakeClient

    result = asyncio.run(
        server.handle_call_tool(
            "brainshare_get_context",
            {
                "query": "provenance",
                "source_tool": "claude",
                "max_items": 3,
            },
        )
    )

    assert observed["url"].endswith("/context/assemble")
    assert observed["json"]["source_tool"] == "claude"
    assert observed["json"]["metadata"]["consumer_kind"] == "ai_session"
    payload = json.loads(result[0].text)
    assert payload["items"][0]["citations"][0]["source_span"]["source_tool"] == "chatgpt"


if __name__ == "__main__":
    test_mcp_lists_get_context_tool()
    test_mcp_get_context_returns_ai_session_payload_with_traceability()
