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

    def test_hosted_start_keeps_refreshed_login_until_the_seed_is_replaced(self):
        import base64, os
        from unittest import mock
        from context_sync.__main__ import seed
        encode = lambda value: base64.b64encode(value).decode()
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            (state/'config.json').write_text('old')
            with mock.patch.dict(os.environ, {'SWARM_CONFIG_B64': encode(b'{"v": "new"}'), 'SWARM_AUTH_SEED_B64': encode(b'seed-1')}):
                seed(state, state/'config.json')
                self.assertEqual(((state/'config.json').read_text(), (state/'factor.auth').read_bytes()), ('{"v": "new"}', b'seed-1'))
                (state/'factor.auth').write_bytes(b'refreshed')
                seed(state, state/'config.json')
                self.assertEqual((state/'factor.auth').read_bytes(), b'refreshed')
            with mock.patch.dict(os.environ, {'SWARM_AUTH_SEED_B64': encode(b'seed-2')}):
                seed(state, state/'config.json')
                self.assertEqual((state/'factor.auth').read_bytes(), b'seed-2')
                self.assertEqual((state/'factor.auth').stat().st_mode & 0o777, 0o600)

    def test_pasted_variables_survive_lost_padding_quotes_and_prefix(self):
        import base64
        from context_sync.__main__ import pasted
        value = base64.b64encode(b'{"a": 1}').decode()
        self.assertTrue(value.endswith('='))
        for form in (value, value.rstrip('='), f'"{value}"', f' {value}\n', 'SWARM_CONFIG_B64=' + value):
            self.assertEqual(pasted('SWARM_CONFIG_B64', form), b'{"a": 1}')
        with self.assertRaisesRegex(ValueError, 'SWARM_CONFIG_B64 is not valid base64'):
            pasted('SWARM_CONFIG_B64', 'not base64 !!')

    def test_seed_fingerprint_matches_what_earlier_versions_recorded(self):
        import base64, hashlib, os
        from unittest import mock
        from context_sync.__main__ import seed
        raw = base64.b64encode(b'seed-1').decode()
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            (state/'factor.auth').write_bytes(b'refreshed')
            (state/'factor.seed').write_text(hashlib.sha256(raw.encode()).hexdigest())
            with mock.patch.dict(os.environ, {'SWARM_AUTH_SEED_B64': raw}):
                seed(state, None)
            self.assertEqual((state/'factor.auth').read_bytes(), b'refreshed')

    def test_grouped_failure_reports_only_the_underlying_error_types(self):
        from context_sync.__main__ import leaves
        try:
            try:
                raise KeyError('secret-value')
            except KeyError as inner:
                raise RuntimeError('wrapped') from inner
        except RuntimeError as error:
            group = ExceptionGroup('unhandled', [error, ExceptionGroup('nested', [TimeoutError()])])
        self.assertEqual(leaves(group), {'RuntimeError', 'KeyError', 'TimeoutError'})
