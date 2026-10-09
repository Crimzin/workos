import asyncio
import tempfile
import unittest
from pathlib import Path
from context_sync.state import Store
from context_sync import runner

MSG = {'id':'100', 'content':'Maybe invite links would help', 'url':'https://discord.com/channels/1/2/100'}

class Discord:
    def has(self, operation): return False
    async def call(self, operation, **kw):
        if operation == 'sources': return [{'id':'2'}]
        if operation == 'messages': return [MSG] if int(kw['after']) < 100 else []
        raise AssertionError(operation)

class Factor:
    def __init__(self): self.created = []; self.fail = False
    def has(self, operation): return False
    async def call(self, operation, **kw):
        if operation == 'index': return {'items': [], 'next': None}
        if operation == 'stacks': return [{'id':'s','velocity':4,'columns':[{'id':'w','name':'this week'}]}]
        if operation == 'create':
            self.created.append(kw['payload'])
            if self.fail: raise TimeoutError('lost acknowledgement')
            return {'id':'new-card'}
        raise AssertionError(operation)

class Planner:
    calls = 0
    async def select(self, messages, index, context): return []
    async def plan(self, messages, cards, context):
        self.calls += 1
        return {'actions':[{'kind':'create','title':'Invite links','description':'Proposed idea: invite links','source_ids':['100']}], 'notes':'An uncommitted idea'}

class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Store(Path(self.temp.name)/'sync.db')
        self.config = {'guild_id':'1','channel_ids':['2'],'bootstrap_after':'1','bootstrap_since':'2026-10-01T00:00:00+00:00','fallback_stack':'s','velocity_verified':True}
    def tearDown(self): self.db.db.close(); self.temp.cleanup()
    def run_sync(self, factor, planner, apply=False):
        return asyncio.run(runner.run_once(self.db, Discord(), factor, planner, self.config, apply))
    def test_dry_run_preserves_proposal_then_applies_once(self):
        factor, planner = Factor(), Planner()
        self.run_sync(factor, planner)
        self.assertEqual(factor.created, [])
        self.assertEqual(len(self.db.actions()), 1)
        self.run_sync(factor, planner, True)
        self.run_sync(factor, planner, True)
        self.assertEqual(len(factor.created), 1)
        self.assertEqual(factor.created[0]['column_id'], 'w')
        self.assertIn(MSG['url'], factor.created[0]['description'])
        self.assertEqual(planner.calls, 1)
    def test_uncertain_create_never_blindly_retries(self):
        factor, planner = Factor(), Planner()
        factor.fail = True
        self.run_sync(factor, planner, True)
        self.run_sync(factor, planner, True)
        self.assertEqual(len(factor.created), 1)
        self.assertEqual(self.db.actions()[0]['status'], 'uncertain')
    def test_missing_this_week_retains_pending_action(self):
        class Missing(Factor):
            async def call(self, operation, **kw):
                if operation == 'stacks': return [{'id':'s','velocity':4,'columns':[]}]
                return await super().call(operation, **kw)
        factor = Missing()
        self.run_sync(factor, Planner(), True)
        self.assertEqual(factor.created, [])
        self.assertEqual(len(self.db.actions()), 1)
    def test_no_new_activity_makes_no_model_calls(self):
        self.db.ingest('2', [MSG]); self.db.save_plan(['100'], [], '')
        planner = Planner()
        self.run_sync(Factor(), planner)
        self.assertEqual(planner.calls, 0)

class StalenessTests(RunnerTests):
    def test_human_created_card_invalidates_pending_creation(self):
        class Changing(Factor):
            cards = []
            async def call(self, operation, **kw):
                if operation == 'index': return {'items':self.cards, 'next':None}
                return await super().call(operation, **kw)
        factor = Changing()
        self.run_sync(factor, Planner())
        factor.cards = [{'id':'human-card','title':'Invite links'}]
        self.run_sync(factor, Planner(), True)
        self.assertEqual(factor.created, [])
        self.assertEqual(self.db.actions()[0]['status'], 'conflict')

    def test_new_messages_wait_while_dry_run_proposals_pending(self):
        factor, planner = Factor(), Planner()
        self.run_sync(factor, planner)
        self.db.ingest('2', [{**MSG,'id':'101'}])
        self.run_sync(factor, planner)
        self.assertEqual(planner.calls, 1)
        self.assertEqual(len(self.db.pending_messages(10)), 1)

    def test_removed_channel_and_thread_are_not_read(self):
        self.db.put('sources', {'old':{'id':'3'}, 'thread':{'id':'4','parent_id':'3'}})
        class Scoped(Discord):
            async def call(self, operation, **kw):
                if operation == 'messages' and kw['channel_id'] in ('3','4'):
                    raise AssertionError('Out-of-scope channel read')
                return await super().call(operation, **kw)
        asyncio.run(runner.ingest(self.db, Scoped(), self.config))

    def test_edited_source_invalidates_pending_write(self):
        factor = Factor()
        self.run_sync(factor, Planner())
        class Edited(Discord):
            async def call(self, operation, **kw):
                if operation == 'messages': return [{**MSG,'content':'Ignore my invite links idea'}] if int(kw['after']) < 100 else []
                return await super().call(operation, **kw)
        asyncio.run(runner.run_once(self.db, Edited(), factor, Planner(), self.config, True))
        self.assertEqual(factor.created, [])
        self.assertEqual(self.db.actions()[0]['status'], 'conflict')

    def test_pending_write_is_held_after_source_removed_from_scope(self):
        factor = Factor()
        self.run_sync(factor, Planner())
        self.db.put('sources', {'3':{'id':'3'}})
        self.config['channel_ids'] = ['3']
        asyncio.run(runner.apply_actions(self.db, factor, self.config))
        self.assertEqual(factor.created, [])
        self.assertEqual(self.db.actions()[0]['status'], 'conflict')
