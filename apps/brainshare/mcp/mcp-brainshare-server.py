#!/usr/bin/env python3

import asyncio
import json
import os
import sys
from typing import Any

import httpx
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
)

# Configuration
BRAINSHARE_API = os.getenv("BRAINSHARE_API", "http://localhost:3100")
TEAM_TOKEN = os.getenv("BRAINSHARE_TOKEN", "bs_team_abc123")

app = Server("brainshare")

@app.list_tools()
async def handle_list_tools() -> list[Tool]:
    """List available BrainShare tools"""
    return [
        Tool(
            name="brainshare_analyze",
            description="Send conversation chunk to BrainShare for automatic context extraction",
            inputSchema={
                "type": "object",
                "properties": {
                    "conversation_chunk": {
                        "type": "string",
                        "description": "Recent conversation content to analyze for valuable context"
                    },
                    "trigger_type": {
                        "type": "string",
                        "enum": ["keyword", "session_end", "manual"],
                        "description": "What triggered this analysis",
                        "default": "manual"
                    }
                },
                "required": ["conversation_chunk"]
            }
        ),
        Tool(
            name="brainshare_push",
            description="Manually add specific context to team's shared knowledge",
            inputSchema={
                "type": "object", 
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The context to add to team knowledge"
                    },
                    "category": {
                        "type": "string",
                        "enum": ["decision", "knowledge", "work", "question", "idea", "policy", "plan", "theory", "prediction", "code", "lesson", "risk", "resource", "constraint", "assumption", "metric", "feedback", "process", "timeline", "consensus", "dissent"],
                        "description": "Type of context being added",
                        "default": "knowledge"
                    }
                },
                "required": ["content"]
            }
        ),
        Tool(
            name="brainshare_pull",
            description="Query team's shared context for relevant information",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string", 
                        "description": "What to search for in team context"
                    },
                    "max_tokens": {
                        "type": "number",
                        "description": "Maximum tokens to return",
                        "default": 4000
                    }
                },
                "required": ["query"]
            }
        )
    ]

@app.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Handle tool calls to BrainShare API"""
    
    headers = {"Authorization": f"Bearer {TEAM_TOKEN}"}
    
    try:
        async with httpx.AsyncClient() as client:
            if name == "brainshare_analyze":
                response = await client.post(
                    f"{BRAINSHARE_API}/analyze",
                    headers=headers,
                    json={
                        "conversation_chunk": arguments["conversation_chunk"],
                        "trigger_type": arguments.get("trigger_type", "manual"),
                        "source_llm": "claude"
                    }
                )
                result = response.json()
                
                if result.get("success"):
                    extracted = result.get("extracted_context", [])
                    if extracted:
                        context_summary = "\n".join([
                            f"- {item['content']} (category: {item['category']}, confidence: {item['confidence']})"
                            for item in extracted
                        ])
                        return [TextContent(
                            type="text",
                            text=f"BrainShare extracted {len(extracted)} context items:\n{context_summary}"
                        )]
                    else:
                        return [TextContent(
                            type="text", 
                            text="No valuable context detected in this conversation chunk."
                        )]
                else:
                    return [TextContent(type="text", text=f"Error: {result.get('error', 'Unknown error')}")]
            
            elif name == "brainshare_push":
                response = await client.post(
                    f"{BRAINSHARE_API}/push",
                    headers=headers,
                    json={
                        "content": arguments["content"],
                        "category": arguments.get("category", "knowledge"),
                        "source_llm": "claude"
                    }
                )
                result = response.json()
                
                if result.get("success"):
                    return [TextContent(
                        type="text",
                        text=f"Added to team context: {result['message']} (category: {result['category']})"
                    )]
                else:
                    return [TextContent(type="text", text=f"Error: {result.get('error', 'Unknown error')}")]
            
            elif name == "brainshare_pull":
                params = {
                    "query": arguments["query"],
                    "llm": "claude",
                    "max_tokens": arguments.get("max_tokens", 4000)
                }
                response = await client.get(
                    f"{BRAINSHARE_API}/pull",
                    headers=headers,
                    params=params
                )
                result = response.json()
                
                if result.get("success"):
                    context_items = result.get("context", [])
                    if context_items:
                        context_text = "\n".join([
                            f"- {item['content']} ({item['category']}, {item['timestamp'][:10]})"
                            for item in context_items
                        ])
                        return [TextContent(
                            type="text",
                            text=f"Team context for '{arguments['query']}':\n{context_text}\n\n(Compression: {result.get('compression_level', 'none')})"
                        )]
                    else:
                        return [TextContent(
                            type="text",
                            text=f"No team context found for '{arguments['query']}'"
                        )]
                else:
                    return [TextContent(type="text", text=f"Error: {result.get('error', 'Unknown error')}")]
            
            else:
                return [TextContent(type="text", text=f"Unknown tool: {name}")]
                
    except Exception as e:
        return [TextContent(type="text", text=f"Error calling BrainShare API: {str(e)}")]

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="brainshare",
                server_version="0.1.0",
                capabilities=app.get_capabilities(
                    notification_options=None,
                    experimental_capabilities=None,
                ),
            ),
        )

if __name__ == "__main__":
    asyncio.run(main())
