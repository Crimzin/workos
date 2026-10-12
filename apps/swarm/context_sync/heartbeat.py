"""Report each run to an outside monitor, which alerts the operator when a report fails or never arrives.

The address in SWARM_HEARTBEAT_URL is a Healthchecks-style ping URL: POST to it for success, to
/start when a run begins and to /fail when it stops. Reports carry counts and error types only.
"""
import json
import os
import sys

import httpx

STUCK = ('conflict', 'uncertain')


def send(signal='', body='', transport=None):
    """Deliver one report. Never raises: monitoring must not stop or fail a sync."""
    url = os.environ.get('SWARM_HEARTBEAT_URL', '').strip().rstrip('/')
    if not url:
        return False
    try:
        with httpx.Client(transport=transport, timeout=10) as http:
            http.post(f'{url}/{signal}' if signal else url, content=body.encode()[:10000]).raise_for_status()
        return True
    except Exception as error:
        # The address is a secret and client errors can quote it; only disclose their class.
        print(f'Heartbeat not delivered ({type(error).__name__}).', file=sys.stderr)
        return False


def outcome(summary):
    """Signal and body for a finished run: failure when writes are waiting on the operator."""
    counts = {row['status']: row['count'] for row in summary.get('actions', [])}
    stuck = [f'{counts[status]} {status}' for status in STUCK if counts.get(status)]
    body = json.dumps(summary)
    if stuck:
        return 'fail', 'Writes need operator recovery: ' + ', '.join(stuck) + '\n' + body
    return '', body
