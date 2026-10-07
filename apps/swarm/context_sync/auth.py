"""Encrypted MCP OAuth state; interactive login only via explicit CLI command."""
import asyncio
import json
import os
import tempfile
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from cryptography.fernet import Fernet
from mcp.client.auth import OAuthClientProvider
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken


class EncryptedStorage:
    def __init__(self, path, key):
        self.path = Path(path)
        self.fernet = Fernet(key)

    def read(self):
        return json.loads(self.fernet.decrypt(self.path.read_bytes())) if self.path.exists() else {}

    def write(self, key, value):
        data = self.read()
        data[key] = value.model_dump(mode='json')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(dir=self.path.parent)
        try:
            with os.fdopen(fd, 'wb') as handle:
                handle.write(self.fernet.encrypt(json.dumps(data).encode()))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(name, self.path)
        finally:
            if os.path.exists(name):
                os.unlink(name)

    async def get_tokens(self):
        data = self.read().get('tokens')
        return OAuthToken.model_validate(data) if data else None

    async def set_tokens(self, tokens):
        self.write('tokens', tokens)

    async def get_client_info(self):
        data = self.read().get('client')
        return OAuthClientInformationFull.model_validate(data) if data else None

    async def set_client_info(self, client_info):
        self.write('client', client_info)


class LoginCallback:
    def __init__(self, port=8765):
        self.port = port
        self.future = None
        self.server = None

    async def redirect(self, url):
        self.future = asyncio.get_running_loop().create_future()
        self.server = await asyncio.start_server(self.handle, '127.0.0.1', self.port, limit=8192)
        webbrowser.open(url)

    async def handle(self, reader, writer):
        try:
            line = (await asyncio.wait_for(reader.readline(), 10)).decode('ascii')
            method, target, _ = line.split(' ', 2)
            parsed = urlsplit(target)
            query = parse_qs(parsed.query)
            valid = method == 'GET' and parsed.path == '/callback' and 'code' in query and 'state' in query
            if valid and self.future and not self.future.done():
                self.future.set_result((query['code'][0], query['state'][0]))
            writer.write(b'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nReturn to the terminal to check connection status.')
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    async def callback(self):
        try:
            return await asyncio.wait_for(self.future, 240)
        finally:
            if self.server:
                self.server.close()
                await self.server.wait_closed()


async def no_login(*args):
    raise RuntimeError('MCP authorization required: run the login command locally')


def provider(url, storage, interactive=False):
    callback = LoginCallback()
    return OAuthClientProvider(
        server_url=url,
        client_metadata=OAuthClientMetadata(
            client_name='Burn Swarm', redirect_uris=['http://127.0.0.1:8765/callback'],
            grant_types=['authorization_code', 'refresh_token'], response_types=['code'],
            token_endpoint_auth_method='none'),
        storage=storage, redirect_handler=callback.redirect if interactive else no_login,
        callback_handler=callback.callback if interactive else no_login,
    )
