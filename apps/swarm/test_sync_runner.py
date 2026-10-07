import asyncio
import tempfile
import unittest
from pathlib import Path
from context_sync.state import Store
from context_sync import runner

MSG = {'id':'100', 'content':'Maybe invite links would help', 'url':'https://discord.com/channels/1/2/100'}

class Discord:
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
