import tempfile
import unittest
from pathlib import Path
from context_sync import state, policy


class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'state.db'

    def tearDown(self):
        self.temp.cleanup()

    def test_checkpoint_and_pending_survive_restart(self):
        with state.Store(self.path) as db:
            db.ingest('c', [{'id': '10', 'content': 'hello'}, {'id': '11', 'content': 'world'}])
        with state.Store(self.path) as db:
            self.assertEqual(db.cursor('c'), '11')
            self.assertEqual(len(db.pending_messages(20)), 2)
            db.ingest('c', [{'id': '11', 'content': 'world'}])
            self.assertEqual(len(db.pending_messages(20)), 2)

    def test_bad_page_does_not_advance_checkpoint(self):
        with state.Store(self.path) as db:
            with self.assertRaises(ValueError):
                db.ingest('c', [{'id': '20'}, {'id': '19'}])
            self.assertIsNone(db.cursor('c'))

    def test_plan_and_uncertain_write_are_durable(self):
        with state.Store(self.path) as db:
            db.ingest('c', [{'id': '10'}])
            action = {'kind': 'create', 'source_ids': ['10'], 'title': 'Idea'}
            db.save_plan(['10'], [action], 'remember this')
            key = db.actions()[0]['key']
            db.set_action(key, 'uncertain')
        with state.Store(self.path) as db:
            self.assertEqual(db.pending_messages(20), [])
            self.assertEqual(db.actions()[0]['status'], 'uncertain')
            db.save_plan([], [action], 'remember this')
            self.assertEqual(len(db.actions()), 1)
            self.assertEqual(db.actions()[0]['status'], 'uncertain')

    def test_budget_reserves_before_spending(self):
        with state.Store(self.path) as db:
            key = db.reserve(0.03, 0.05)
            with self.assertRaises(state.BudgetExceeded):
                db.reserve(0.03, 0.05)
            db.settle(key, 0.01)
            db.reserve(0.03, 0.05)

    def test_lock_excludes_second_process(self):
        with state.run_lock(self.path):
            with self.assertRaises(state.AlreadyRunning):
                with state.run_lock(self.path):
                    pass


class PolicyTests(unittest.TestCase):
    def test_velocity_tie_keeps_previous(self):
        stacks = [{'id': 'a', 'velocity': 2}, {'id': 'b', 'velocity': 2}]
        self.assertEqual(policy.choose_stack(stacks, 'b'), 'b')
        self.assertEqual(policy.choose_stack([{'id': 'a', 'velocity': None}], 'b'), 'b')

    def test_rejects_invented_source_or_target(self):
        messages = [{'id': '10', 'content': 'An idea', 'url': 'https://discord.com/channels/g/c/10'}]
        for action in [
            {'kind': 'create', 'source_ids': ['99'], 'title': 'Idea', 'description': 'x', 'fields': {}},
            {'kind': 'update', 'source_ids': ['10'], 'card_id': 'unknown', 'post': 'x'},
        ]:
            with self.assertRaises(ValueError):
                policy.validate_actions([action], messages, {})

    def test_field_changes_require_literal_evidence(self):
        messages = [{'id': '10', 'content': 'Maybe we could do this', 'url': 'https://discord.com/channels/g/c/10'}]
        action = {'kind': 'create', 'source_ids': ['10'], 'title': 'Idea', 'description': 'Proposed idea', 'fields': {'owner': 'Will'}}
        with self.assertRaises(ValueError):
            policy.validate_actions([action], messages, {})

class EditTests(unittest.TestCase):
    def test_edited_message_requeues_without_regressing_cursor(self):
        with tempfile.TemporaryDirectory() as folder, state.Store(Path(folder)/'db') as db:
            db.ingest('c', [{'id':'10','content':'ship'}, {'id':'11','content':'later'}])
            db.save_plan(['10','11'], [], '')
            db.ingest('c', [{'id':'10','content':'do not ship'}])
            self.assertEqual(db.cursor('c'), '11')
            self.assertEqual(db.pending_messages(10)[0]['content'], 'do not ship')

    def test_missing_previous_velocity_retains_destination(self):
        self.assertEqual(policy.choose_stack([{'id':'a','velocity':None},{'id':'b','velocity':2}], 'a'), 'a')

    def test_replan_preserves_uncertain_write_and_requeues_conflict(self):
        with tempfile.TemporaryDirectory() as folder, state.Store(Path(folder)/'db') as db:
            db.ingest('c', [{'id':'10','content':'idea'}])
            db.save_plan(['10'], [{'kind':'create','source_ids':['10']}], '')
            key = db.actions()[0]['key']
            db.set_action(key, 'uncertain')
            with self.assertRaises(ValueError): db.replan(key)
            db.set_action(key, 'conflict')
            db.replan(key)
            self.assertEqual(db.actions(), [])
            self.assertEqual(len(db.pending_messages(10)), 1)

    def test_replanned_identical_action_can_be_proposed_again(self):
        with tempfile.TemporaryDirectory() as folder, state.Store(Path(folder)/'db') as db:
            db.ingest('c', [{'id':'10','content':'idea'}])
            action = {'kind':'create','source_ids':['10']}
            db.save_plan(['10'], [action], '')
            key = db.actions()[0]['key']
            db.replan(key)
            db.save_plan(['10'], [action], '')
            self.assertEqual(db.actions()[0]['status'], 'pending')
