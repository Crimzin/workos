import asyncio
import unittest
import httpx
from context_sync import discord_mcp


class DiscordTests(unittest.TestCase):
    def test_messages_are_oldest_first_with_cursor_and_source_links(self):
        async def scenario():
            def handler(request):
                self.assertEqual(request.url.params['after'], '10')
                return httpx.Response(200, json=[{'id':'12','content':'later','author':{'id':'a','username':'Ann'}}, {'id':'11','content':'first','author':{'id':'a','username':'Ann'}}])
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url='https://discord.com/api/v10') as client:
                result = await discord_mcp.messages(client, '1', '2', '10', 100)
                self.assertEqual([m['id'] for m in result], ['11','12'])
                self.assertEqual(result[0]['url'], 'https://discord.com/channels/1/2/11')
        asyncio.run(scenario())

    def test_request_failure_is_not_empty_history(self):
        async def scenario():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(403)), base_url='https://discord.com/api/v10') as client:
                with self.assertRaises(httpx.HTTPStatusError):
                    await discord_mcp.messages(client, '1', '2', None, 100)
        asyncio.run(scenario())
