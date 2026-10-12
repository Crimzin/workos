import asyncio
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock

import httpx

from context_sync import __main__ as entry
from context_sync import heartbeat

URL = 'https://hc.example/ping/abc'


def recorder(status=200, error=None):
    seen = []
    def handle(request):
        seen.append((str(request.url), request.content.decode()))
        if error:
            raise error
        return httpx.Response(status)
    return seen, httpx.MockTransport(handle)


class SendTests(unittest.TestCase):
    def test_without_a_configured_address_nothing_is_sent(self):
        seen, transport = recorder()
        with mock.patch.dict(os.environ, clear=True):
            self.assertFalse(heartbeat.send('fail', 'x', transport=transport))
        self.assertEqual(seen, [])

    def test_success_report_goes_to_the_address_with_its_body(self):
        seen, transport = recorder()
        with mock.patch.dict(os.environ, {'SWARM_HEARTBEAT_URL': URL + '/ \n'}):
            self.assertTrue(heartbeat.send('', 'counts', transport=transport))
        self.assertEqual(seen, [(URL, 'counts')])

    def test_start_and_fail_are_reported_under_the_address(self):
        seen, transport = recorder()
        with mock.patch.dict(os.environ, {'SWARM_HEARTBEAT_URL': URL}):
            heartbeat.send('start', transport=transport)
            heartbeat.send('fail', 'ValueError', transport=transport)
        self.assertEqual(seen, [(URL + '/start', ''), (URL + '/fail', 'ValueError')])

    def test_an_unreachable_monitor_never_stops_the_run_or_leaks_the_address(self):
        _, transport = recorder(error=httpx.ConnectError('no route to ' + URL))
        log = StringIO()
        with mock.patch.dict(os.environ, {'SWARM_HEARTBEAT_URL': URL}), redirect_stderr(log):
            self.assertFalse(heartbeat.send('', 'counts', transport=transport))
        self.assertIn('ConnectError', log.getvalue())
        self.assertNotIn('abc', log.getvalue())

    def test_a_refused_report_counts_as_not_delivered(self):
        _, transport = recorder(status=404)
        with mock.patch.dict(os.environ, {'SWARM_HEARTBEAT_URL': URL}), redirect_stderr(StringIO()):
            self.assertFalse(heartbeat.send('', 'counts', transport=transport))


class OutcomeTests(unittest.TestCase):
    def test_a_clean_run_reports_success_with_its_counts(self):
        summary = {'pending_messages': 0, 'actions': [{'status': 'done', 'count': 4}, {'status': 'pending', 'count': 2}], 'mode': 'apply'}
        signal, body = heartbeat.outcome(summary)
        self.assertEqual(signal, '')
        self.assertEqual(json.loads(body), summary)

    def test_writes_needing_the_operator_report_failure_and_say_which(self):
        summary = {'actions': [{'status': 'done', 'count': 4}, {'status': 'uncertain', 'count': 1}, {'status': 'conflict', 'count': 2}]}
        signal, body = heartbeat.outcome(summary)
        self.assertEqual(signal, 'fail')
        self.assertTrue(body.startswith('Writes need operator recovery: 2 conflict, 1 uncertain'))


class Connected:
    tools = {'t': {}}
    def __init__(self, *args, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return False


class WiringTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.sent = []
        patches = [mock.patch.object(heartbeat, 'send', lambda signal='', body='', **kw: self.sent.append((signal, body))),
                   mock.patch.dict(os.environ, clear=True)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.addCleanup(self.temp.cleanup)

    def main(self, *arguments):
        with mock.patch.object(sys, 'argv', ['context_sync', *arguments, '--state-dir', self.temp.name]), redirect_stderr(StringIO()), redirect_stdout(StringIO()):
            return entry.main()

    def test_a_run_that_stops_reports_start_then_failure_with_the_error_type(self):
        self.assertEqual(self.main('run'), 1)
        self.assertEqual([signal for signal, _ in self.sent], ['start', 'fail'])
        self.assertIn('ValueError: Configure guild_id', self.sent[1][1])

    def test_commands_other_than_run_report_nothing(self):
        self.assertEqual(self.main('status'), 0)
        self.assertEqual(self.sent, [])

    def test_a_finished_run_reports_its_outcome_without_proposals(self):
        config = Path(self.temp.name)/'config.json'
        operations = {name: {'tool': 't'} for name in ('index', 'card', 'stacks')}
        config.write_text(json.dumps({'guild_id': '1', 'channel_ids': ['2'], 'fallback_stack': 's', 'factor': {}, 'factor_operations': operations}))
        async def ran(*args, **kwargs):
            return {'pending_messages': 0, 'actions': [{'status': 'uncertain', 'count': 1}], 'mode': 'dry-run', 'proposals': [{'body': 'private discussion'}]}
        with mock.patch.object(entry, 'Connection', Connected), mock.patch.object(entry, 'run_once', ran):
            self.assertEqual(self.main('run', '--config', str(config)), 0)
        self.assertEqual([signal for signal, _ in self.sent], ['start', 'fail'])
        self.assertNotIn('private discussion', self.sent[1][1])


if __name__ == '__main__':
    unittest.main()
