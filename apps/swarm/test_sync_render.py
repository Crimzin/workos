import asyncio
import tempfile
import unittest
from pathlib import Path
from context_sync import render, runner
from context_sync.state import Store

# 2026-10-06 14:48 and 14:50 UTC, i.e. 10:48 and 10:50 AM in New York.
FIRST, SECOND = '1557041880515092542', '1557042293524009022'
CONFIG = {'people': {'crimzin__': 'Will'}, 'timezone': 'America/New_York', 'guild_id': '1'}
SOURCES = {'9': {'id': '9', 'name': 'swat'}}
MESSAGES = [
    {'id': SECOND, 'channel_id': '9', 'author': 'crimzin__', 'content': 'tbh it was better when it was hidden', 'attachments': []},
    {'id': FIRST, 'channel_id': '9', 'author': 'crimzin__', 'content': 'I used it on my friend Tom',
     'attachments': [{'id': '7', 'name': 'shot.png', 'type': 'image/png', 'url': 'https://cdn.discordapp.com/a/shot.png'}]},
]
ACTION = {'kind': 'update', 'post': 'Will suggests hiding Quicksand until it takes effect.', 'note': 'Conflicts with the July decision.',
          'source_ids': [FIRST, SECOND], 'source_urls': ['https://discord.com/channels/1/9/' + FIRST, 'https://discord.com/channels/1/9/' + SECOND]}


class RenderTests(unittest.TestCase):
    def test_post_is_summary_then_verbatim_messages_then_note_then_sources(self):
        text = render.body(ACTION, MESSAGES, CONFIG, SOURCES, {(FIRST, '7'): '<figure class="image"><img src="/api/artifacts/download/x"></figure>'}, 'KEY')
        self.assertEqual(text, "\n".join([
            'Will suggests hiding Quicksand until it takes effect.',
            '',
            '> **#swat · Oct 6**',
            '>',
            '> **Will** · 10:48 AM',
            '> I used it on my friend Tom',
            '>',
            '> <figure class="image"><img src="/api/artifacts/download/x"></figure>',
            '>',
            '> **Will** · 10:50 AM',
            '> tbh it was better when it was hidden',
            '',
            '*Note: Conflicts with the July decision.*',
            '',
            f'Discord sources: [1](https://discord.com/channels/1/9/{FIRST}) · [2](https://discord.com/channels/1/9/{SECOND})',
            'Swarm action: KEY']))

    def test_image_that_was_not_copied_is_named_not_dropped(self):
        self.assertIn('> *(attachment: shot.png)*', render.body(ACTION, MESSAGES, CONFIG, SOURCES, {}, 'KEY'))

    def test_each_image_is_uploaded_once_across_retries(self):
        class Discord:
            def has(self, operation): return True
            async def call(self, operation, **kw):
                return [{'id': '7', 'name': 'shot.png', 'type': 'image/png', 'size': 10, 'url': 'https://cdn.discordapp.com/a/shot.png?sig=1'}]
        class Factor:
            uploads = []
            def has(self, operation): return True
            async def call(self, operation, **kw):
                self.uploads.append(kw['url'])
                return {'html': '<figure class="image"></figure>'}
        with tempfile.TemporaryDirectory() as folder, Store(Path(folder)/'db') as store:
            for _ in range(2):
                embeds = asyncio.run(runner.embeds_for(store, Discord(), Factor(), CONFIG, MESSAGES))
            self.assertEqual(embeds, {(FIRST, '7'): '<figure class="image"></figure>'})
            self.assertEqual(Factor.uploads, ['https://cdn.discordapp.com/a/shot.png?sig=1'])

    def test_mentions_show_real_names(self):
        self.assertEqual(render.named('<@42> is it feasible? <@99>', {'ziga_42': 'Ziga'}, {'42': 'ziga_42'}), '@Ziga is it feasible? <@99>')

    def test_uncited_messages_inside_a_short_exchange_are_included(self):
        middle = {'id': str(int(FIRST) + 1000), 'channel_id': '9', 'author': 'camelwrangler', 'content': 'wasnt that how it used to work?'}
        stored = lambda channel, low, high: [middle]
        self.assertEqual([m['content'] for m in render.exchange(MESSAGES, stored)],
                         ['I used it on my friend Tom', 'wasnt that how it used to work?', 'tbh it was better when it was hidden'])
        self.assertEqual(len(render.exchange(MESSAGES, lambda *a: [middle] * 7)), 2)
        late = {**MESSAGES[0], 'id': str(int(FIRST) + (3600000 << 22))}
        self.assertEqual(len(render.exchange([MESSAGES[1], late], stored)), 2)

    def test_long_message_shows_only_an_exact_excerpt(self):
        notes = {'id': FIRST, 'content': 'New version is uploading:\n' + '- filler line\n' * 40 + '- Grappling hook fix\n- Badge fix'}
        self.assertEqual(render.quoted(notes, {}, {}, '- Grappling hook fix'), '… - Grappling hook fix …')
        self.assertEqual(render.quoted(notes, {}, {}, '- Grappling hook is fixed'), notes['content'])
        self.assertEqual(render.quoted({'id': FIRST, 'content': 'short one'}, {}, {}, 'short'), 'short one')
