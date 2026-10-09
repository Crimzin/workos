"""Small read-only Discord MCP server; shares the worker process lifetime."""
import asyncio
import os
from datetime import datetime, timezone
import httpx
from mcp.server.fastmcp import FastMCP

server = FastMCP('Burn Discord read-only')


def snowflake(value):
    if not isinstance(value, str) or not value.isdigit():
        raise ValueError('Expected a Discord snowflake string')
    return value


def client():
    return httpx.AsyncClient(base_url='https://discord.com/api/v10', timeout=30,
                             headers={'Authorization': 'Bot ' + os.environ['DISCORD_BOT_TOKEN']})


async def get(http, path, params=None, missing_ok=False):
    for attempt in range(3):
        response = await http.get(path, params=params)
        if response.status_code == 429 and attempt < 2:
            delay = float(response.json().get('retry_after', 1))
            if delay > 30:
                response.raise_for_status()
            await asyncio.sleep(max(delay, 0))
            continue
        if missing_ok and response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    raise RuntimeError('Discord retry exhausted')


def normalized(message, guild, channel):
    author = message.get('author', {})
    return {'id': message['id'], 'channel_id': channel,
            'content': message.get('content', ''), 'author': author.get('username', ''),
            'author_id': author.get('id'), 'bot': author.get('bot', False),
            'url': f'https://discord.com/channels/{guild}/{channel}/{message["id"]}',
            'reply_id': message.get('message_reference', {}).get('message_id'),
            # Signed CDN links change on every read, so only the stable part is stored.
            'attachments': [{'id': a.get('id'), 'name': a.get('filename'), 'type': a.get('content_type'),
                             'url': (a.get('url') or '').split('?')[0]} for a in message.get('attachments', [])]}


async def messages(http, guild_id, channel_id, after, limit):
    snowflake(guild_id)
    snowflake(channel_id)
    params = {'limit': min(max(limit, 1), 100)}
    if after:
        params['after'] = snowflake(after)
    data = await get(http, f'/channels/{channel_id}/messages', params)
    return [normalized(m, guild_id, channel_id) for m in sorted(data, key=lambda m: int(m['id']))]


@server.tool()
async def list_guilds() -> dict:
    """List servers accessible to the bot, for initial configuration."""
    async with client() as http:
        guilds = await get(http, '/users/@me/guilds')
    return {'items': [{'id': g['id'], 'name': g['name']} for g in guilds]}


@server.tool()
async def list_channels(guild_id: str) -> dict:
    """List channel IDs and names in a server for explicit scope selection."""
    snowflake(guild_id)
    async with client() as http:
        channels = await get(http, f'/guilds/{guild_id}/channels')
    return {'items': [{'id': c['id'], 'name': c['name'], 'type': c['type']} for c in channels]}


@server.tool()
async def list_sources(guild_id: str, channel_ids: list[str], since: str) -> dict:
    """Discover selected channels and their active/recently archived accessible threads."""
    snowflake(guild_id)
    for channel in channel_ids:
        snowflake(channel)
    cutoff = datetime.fromisoformat(since.replace('Z', '+00:00'))
    async with client() as http:
        channels = await get(http, f'/guilds/{guild_id}/channels')
        selected = [c for c in channels if c['id'] in channel_ids]
        if {c['id'] for c in selected} != set(channel_ids):
            raise ValueError('Configured channel is missing from guild')
        sources = {c['id']: {'id': c['id'], 'name': c['name']} for c in selected if c['type'] in (0, 5)}
        active = await get(http, f'/guilds/{guild_id}/threads/active')
        for thread in active['threads']:
            if thread['parent_id'] in channel_ids:
                sources[thread['id']] = {'id': thread['id'], 'name': thread['name'], 'parent_id': thread['parent_id']}
        for channel in selected:
            # Joined private threads use snowflake pagination; public use archive timestamps.
            kinds = ['public'] + (['joined/private'] if channel['type'] == 0 else [])
            for kind in kinds:
                before = None
                for _ in range(20):
                    params = {'limit': 100}
                    if before:
                        params['before'] = before
                    prefix = 'users/@me/threads/archived/private' if kind == 'joined/private' else 'threads/archived/public'
                    result = await get(http, f'/channels/{channel["id"]}/{prefix}', params)
                    threads = result['threads']
                    for thread in threads:
                        archived = datetime.fromisoformat(thread['thread_metadata']['archive_timestamp'].replace('Z', '+00:00'))
                        if archived >= cutoff:
                            sources[thread['id']] = {'id': thread['id'], 'name': thread['name'], 'parent_id': thread['parent_id']}
                    if not result.get('has_more'):
                        break
                    if not threads:
                        raise ValueError('Archived thread page did not advance')
                    stamp = threads[-1]['thread_metadata']['archive_timestamp']
                    # Public archives are sorted by archive time; joined private by ID.
                    if kind == 'public' and datetime.fromisoformat(stamp.replace('Z', '+00:00')) < cutoff:
                        break
                    next_before = threads[-1]['id'] if kind == 'joined/private' else stamp
                    if next_before == before:
                        raise ValueError('Archived thread cursor repeated')
                    before = next_before
                else:
                    raise ValueError('Archive discovery limit reached; narrow scope or increase limit')
    return {'items': list(sources.values())}


@server.tool()
async def read_messages(guild_id: str, channel_id: str, after: str, limit: int = 100) -> dict:
    """Read the next oldest-first page after a message ID; never omit bot messages from checkpointing."""
    async with client() as http:
        return {'items': await messages(http, guild_id, channel_id, after, limit)}


@server.tool()
async def read_message(guild_id: str, channel_id: str, message_id: str) -> dict:
    """Retrieve a referenced older message only when context requires it."""
    for value in (guild_id, channel_id, message_id):
        snowflake(value)
    async with client() as http:
        message = await get(http, f'/channels/{channel_id}/messages/{message_id}', missing_ok=True)
    if message is None:
        return {'id': message_id, 'unavailable': True, 'content': '[Referenced message unavailable]'}
    return normalized(message, guild_id, channel_id)


@server.tool()
async def read_attachments(guild_id: str, channel_id: str, message_id: str) -> dict:
    """Return a message's attachments with fresh, short-lived download links."""
    for value in (guild_id, channel_id, message_id):
        snowflake(value)
    async with client() as http:
        message = await get(http, f'/channels/{channel_id}/messages/{message_id}', missing_ok=True)
    return {'items': [{'id': a.get('id'), 'name': a.get('filename'), 'type': a.get('content_type'), 'size': a.get('size'),
                       'url': a.get('url')} for a in (message or {}).get('attachments', [])]}


if __name__ == '__main__':
    server.run(transport='stdio')
