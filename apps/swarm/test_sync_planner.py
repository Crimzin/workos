import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from context_sync.state import Store, BudgetExceeded
from context_sync import planner

class Messages:
    calls = 0
    async def count_tokens(self, **kw): return SimpleNamespace(input_tokens=1000)
    async def create(self, **kw):
        self.calls += 1
        return SimpleNamespace(stop_reason='tool_use', usage=SimpleNamespace(input_tokens=1000, output_tokens=10),
                               content=[SimpleNamespace(type='tool_use', name='result', input={'card_ids':[]})])

class PlannerTests(unittest.TestCase):
    def test_budget_blocks_inference_before_request(self):
        with tempfile.TemporaryDirectory() as folder, Store(Path(folder)/'db') as store:
            messages = Messages()
            p = planner.Planner(store, {'monthly_budget_usd':0.0001}, SimpleNamespace(messages=messages))
            with self.assertRaises(BudgetExceeded):
                asyncio.run(p.select([{'id':'1','content':'Hi'}], [], {}))
            self.assertEqual(messages.calls, 0)
    def test_structured_candidate_selection(self):
        with tempfile.TemporaryDirectory() as folder, Store(Path(folder)/'db') as store:
            p = planner.Planner(store, {}, SimpleNamespace(messages=Messages()))
            self.assertEqual(asyncio.run(p.select([{'id':'1','content':'Hi'}], [], {})), [])
