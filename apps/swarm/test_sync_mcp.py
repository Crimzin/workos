import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from cryptography.fernet import Fernet
from context_sync import mcp_io, auth
from mcp.shared.auth import OAuthToken


class MCPTests(unittest.TestCase):
    def test_mapping_preserves_types_and_rejects_missing_variables(self):
        self.assertEqual(mcp_io.expand({'after': '$after', 'limit': 100}, {'after': None}), {'after': None, 'limit': 100})
        with self.assertRaises(ValueError):
            mcp_io.expand('$missing', {})

    def test_tool_errors_never_look_like_empty_success(self):
        from types import SimpleNamespace
        result = SimpleNamespace(isError=True, structuredContent=None, content=[])
        with self.assertRaises(mcp_io.ToolFailure):
            mcp_io.decode(result)

    def test_mapping_extracts_and_normalizes_response(self):
        value = {'data': [{'identifier': 'a', 'speed': 4}]}
        self.assertEqual(mcp_io.normalize(value, {'path': 'data', 'each': {'id': 'identifier', 'velocity': 'speed'}}), [{'id': 'a', 'velocity': 4}])

    def test_tokens_encrypted_at_rest(self):
        async def scenario():
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder)/'factor.auth'
                storage = auth.EncryptedStorage(path, Fernet.generate_key())
                await storage.set_tokens(OAuthToken(access_token='secret-test', token_type='Bearer'))
                self.assertNotIn('secret-test', path.read_text())
                self.assertEqual((await storage.get_tokens()).access_token, 'secret-test')
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        asyncio.run(scenario())

    def test_restarted_process_knows_token_expiry_and_refresh_endpoint(self):
        from mcp.shared.auth import OAuthMetadata
        async def scenario():
            with tempfile.TemporaryDirectory() as folder:
                path, key = Path(folder)/'factor.auth', Fernet.generate_key()
                first = auth.provider('https://burn.factor.work/mcp', auth.EncryptedStorage(path, key))
                first.context.oauth_metadata = OAuthMetadata(issuer='https://as.example/', authorization_endpoint='https://as.example/authorize', token_endpoint='https://as.example/token')
                await first.context.storage.set_tokens(OAuthToken(access_token='a', token_type='Bearer', expires_in=30, refresh_token='r'))
                second = auth.provider('https://burn.factor.work/mcp', auth.EncryptedStorage(path, key))
                await second._initialize()
                self.assertFalse(second.context.is_token_valid())
                self.assertEqual(str(second.context.oauth_metadata.token_endpoint), 'https://as.example/token')
        asyncio.run(scenario())
