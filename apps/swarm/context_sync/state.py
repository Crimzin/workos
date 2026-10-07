"""Durable ingestion, outbox and conservative spend accounting."""
import fcntl
import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


class BudgetExceeded(RuntimeError):
    pass


class AlreadyRunning(RuntimeError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


@contextmanager
def run_lock(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix('.lock').open('a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise AlreadyRunning('Another sync run holds the lock') from error
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


class Store:
    def __init__(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        path.chmod(0o600)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS cursors(channel TEXT PRIMARY KEY, message_id TEXT);
            CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, channel TEXT, body TEXT,
                processed INTEGER DEFAULT 0, seen_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS actions(key TEXT PRIMARY KEY, body TEXT, status TEXT,
                result TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS spend(id TEXT PRIMARY KEY, month TEXT, amount REAL);
        ''')

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.db.close()

    def cursor(self, channel):
        row = self.db.execute('SELECT message_id FROM cursors WHERE channel=?', (channel,)).fetchone()
        return row[0] if row else None

    def ingest(self, channel, messages):
        ids = [int(m['id']) for m in messages]
        if ids != sorted(set(ids)):
            raise ValueError('Messages must be unique and oldest-first')
        with self.db:
            for message in messages:
                self.db.execute('INSERT OR IGNORE INTO messages(id,channel,body) VALUES(?,?,?)',
                                (message['id'], channel, canonical({**message, 'channel_id': channel})))
            if ids:
                previous = int(self.cursor(channel) or 0)
                self.db.execute('INSERT OR REPLACE INTO cursors VALUES(?,?)',
                                (channel, str(max(previous, ids[-1]))))

    def pending_messages(self, limit):
        rows = self.db.execute('SELECT body FROM messages WHERE processed=0 ORDER BY length(id),id LIMIT ?', (limit,))
        return [json.loads(row[0]) for row in rows]

    def save_plan(self, ids, actions, notes):
        with self.db:
            for action in actions:
                key = fingerprint(action)
                self.db.execute('INSERT OR IGNORE INTO actions(key,body,status) VALUES(?,?,?)',
                                (key, canonical(action), 'pending'))
            self.db.executemany('UPDATE messages SET processed=1 WHERE id=?', [(i,) for i in ids])
            self.db.execute('INSERT OR REPLACE INTO meta VALUES(?,?)', ('notes', canonical(notes)))

    def actions(self):
        rows = self.db.execute("SELECT * FROM actions WHERE status != 'done' ORDER BY created_at,key")
        return [{**dict(row), 'body': json.loads(row['body'])} for row in rows]

    def set_action(self, key, status, result=None):
        with self.db:
            self.db.execute('UPDATE actions SET status=?,result=? WHERE key=?', (status, canonical(result), key))

    def get(self, key, default=None):
        row = self.db.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def put(self, key, value):
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO meta VALUES(?,?)', (key, canonical(value)))

    def reserve(self, amount, cap):
        month = datetime.now(timezone.utc).strftime('%Y-%m')
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            total = self.db.execute('SELECT COALESCE(SUM(amount),0) FROM spend WHERE month=?', (month,)).fetchone()[0]
            if amount < 0 or total + amount > cap:
                raise BudgetExceeded('Monthly model budget exhausted; work remains queued')
            key = str(uuid.uuid4())
            self.db.execute('INSERT INTO spend VALUES(?,?,?)', (key, month, amount))
        return key

    def settle(self, key, amount):
        with self.db:
            self.db.execute('UPDATE spend SET amount=? WHERE id=?', (amount, key))

    def prune(self, days=30):
        # Provenance remains in the action ledger; only processed raw messages expire.
        with self.db:
            self.db.execute("DELETE FROM messages WHERE processed=1 AND seen_at < datetime('now', ?)", (f'-{days} days',))

    def status(self):
        return {'pending_messages': self.db.execute('SELECT count(*) FROM messages WHERE processed=0').fetchone()[0],
                'actions': [dict(r) for r in self.db.execute('SELECT status,count(*) AS count FROM actions GROUP BY status')],
                'spend': [dict(r) for r in self.db.execute('SELECT month,sum(amount) AS usd FROM spend GROUP BY month')],
                'last_success': self.get('last_success')}
