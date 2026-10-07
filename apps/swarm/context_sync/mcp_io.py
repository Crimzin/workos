"""MCP transport and explicit, reviewable server capability mappings."""
import json
import os
from contextlib import AsyncExitStack
from pathlib import Path
import jsonschema
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client
from .auth import EncryptedStorage, provider


class ToolFailure(RuntimeError):
    pass


def expand(value, variables):
    if isinstance(value, str) and value.startswith('$'):
        if value[1:] not in variables:
            raise ValueError(f'Missing operation variable: {value[1:]}')
        return variables[value[1:]]
    if isinstance(value, dict):
        return {k: expand(v, variables) for k, v in value.items()}
    if isinstance(value, list):
        return [expand(v, variables) for v in value]
    return value


def at(value, path):
    for part in path.split('.') if path else []:
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def normalize(value, rule):
    value = at(value, rule.get('path', ''))
    if 'each' in rule:
        if not isinstance(value, list):
            raise ValueError('Expected list response')
        value = [{k: at(item, path) for k, path in rule['each'].items()} for item in value]
    if 'fields' in rule:
        value = {k: at(value, path) for k, path in rule['fields'].items()}
    return value


def decode(result):
    if result.isError:
        # Do not echo server errors: they can contain credentials or private data.
        raise ToolFailure('MCP tool reported an error')
    if result.structuredContent is not None:
        return result.structuredContent
    texts = [c.text for c in result.content if c.type == 'text']
    if len(texts) != 1:
        raise ToolFailure('Expected one JSON tool result')
    try:
        return json.loads(texts[0])
    except ValueError as error:
        raise ToolFailure('Expected structured JSON tool result') from error


class Connection:
    def __init__(self, config, state_dir, interactive=False):
        self.config, self.state_dir, self.interactive = config, Path(state_dir), interactive
        self.stack = AsyncExitStack()
        self.tools = {}

    async def __aenter__(self):
        try:
            if self.config.get('transport') == 'stdio':
                params = StdioServerParameters(command=self.config['command'], args=self.config.get('args', []),
                                               env={**os.environ, **self.config.get('env', {})})
                read, write = await self.stack.enter_async_context(stdio_client(params))
            else:
                url = self.config['url']
                if not url.startswith('https://'):
                    raise ValueError('Remote MCP requires HTTPS')
                key = os.environ.get('SWARM_TOKEN_KEY')
                if not key:
                    raise ValueError('SWARM_TOKEN_KEY is required for encrypted OAuth storage')
                storage = EncryptedStorage(self.state_dir / self.config.get('auth_file', 'factor.auth'), key)
                streams = await self.stack.enter_async_context(streamablehttp_client(url, auth=provider(url, storage, self.interactive)))
                read, write = streams[:2]
            self.session = await self.stack.enter_async_context(ClientSession(read, write))
            await self.session.initialize()
            cursor = None
            while True:
                result = await self.session.list_tools(cursor=cursor)
                for tool in result.tools:
                    self.tools[tool.name] = tool.model_dump(mode='json')
                if not result.nextCursor:
                    break
                if result.nextCursor == cursor:
                    raise ToolFailure('Tool discovery cursor did not advance')
                cursor = result.nextCursor
            return self
        except BaseException:
            await self.stack.aclose()
            raise

    async def __aexit__(self, *args):
        await self.stack.aclose()

    async def call(self, name, arguments):
        if name not in self.tools:
            raise ToolFailure(f'Unavailable configured tool: {name}')
        jsonschema.validate(arguments, self.tools[name]['inputSchema'])
        return decode(await self.session.call_tool(name, arguments))


class Adapter:
    def __init__(self, connection, operations):
        self.connection, self.operations = connection, operations

    def has(self, operation):
        return operation in self.operations

    async def call(self, operation, **variables):
        if not self.has(operation):
            raise ToolFailure(f'Missing verified operation mapping: {operation}')
        rule = self.operations[operation]
        result = await self.connection.call(rule['tool'], expand(rule.get('arguments', {}), variables))
        return normalize(result, rule.get('result', {}))
