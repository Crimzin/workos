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
                self.db.execute('''INSERT INTO messages(id,channel,body) VALUES(?,?,?)
                    ON CONFLICT(id) DO UPDATE SET body=excluded.body, processed=0, seen_at=CURRENT_TIMESTAMP
                    WHERE messages.body != excluded.body''',
                                (message['id'], channel, canonical({**message, 'channel_id': channel})))
            if ids:
                previous = int(self.cursor(channel) or 0)
                self.db.execute('INSERT OR REPLACE INTO cursors VALUES(?,?)',
                                (channel, str(max(previous, ids[-1]))))

    def pending_messages(self, limit, channels=None):
        condition, parameters = '', []
        if channels is not None:
            if not channels:
                return []
            condition = ' AND channel IN (' + ','.join('?' for _ in channels) + ')'
            parameters.extend(channels)
        rows = self.db.execute('SELECT body FROM messages WHERE processed=0' + condition + ' ORDER BY length(id),id LIMIT ?', (*parameters, limit))
        return [json.loads(row[0]) for row in rows]

    def overlap_after(self, channel, count=20):
        rows = list(self.db.execute('SELECT id FROM messages WHERE channel=? ORDER BY length(id) DESC,id DESC LIMIT ?', (channel, count)))
        return str(int(rows[-1][0]) - 1) if rows else None

    def save_plan(self, ids, actions, notes):
        with self.db:
            for action in actions:
                key = fingerprint(action)
                self.db.execute('''INSERT INTO actions(key,body,status) VALUES(?,?,?)
                    ON CONFLICT(key) DO UPDATE SET status='pending',result=NULL WHERE actions.status='superseded' ''',
                                (key, canonical(action), 'pending'))
            self.db.executemany('UPDATE messages SET processed=1 WHERE id=?', [(i,) for i in ids])
            self.db.execute('INSERT OR REPLACE INTO meta VALUES(?,?)', ('notes', canonical(notes)))

    def actions(self):
        rows = self.db.execute("SELECT * FROM actions WHERE status NOT IN ('done','superseded') ORDER BY created_at,key")
        return [{**dict(row), 'body': json.loads(row['body'])} for row in rows]

    def message(self, message_id):
        row = self.db.execute('SELECT body FROM messages WHERE id=?', (message_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def between(self, channel, low, high):
        """Stored messages in one channel strictly between two message IDs, oldest first."""
        rows = self.db.execute('SELECT id, body FROM messages WHERE channel=? AND length(id) BETWEEN ? AND ?', (channel, len(low), len(high)))
        found = [json.loads(body) for i, body in rows if int(low) < int(i) < int(high)]
        return sorted(found, key=lambda m: int(m['id']))

    def authors(self):
        """Discord user ID to handle, for every author seen, so mentions can be shown as names."""
        rows = self.db.execute("SELECT DISTINCT json_extract(body,'$.author_id'), json_extract(body,'$.author') FROM messages")
        return {user: handle for user, handle in rows if user}

    def replan(self, key):
        row = self.db.execute('SELECT body,status FROM actions WHERE key=?', (key,)).fetchone()
        if not row or row['status'] not in ('pending', 'conflict'):
            raise ValueError('Only unwritten pending/conflict actions may be replanned')
        ids = json.loads(row['body'])['source_ids']
        if any(self.message(i) is None for i in ids):
            raise ValueError('Source messages expired; restore evidence before replanning')
        with self.db:
            self.db.execute("UPDATE actions SET status='superseded' WHERE key=?", (key,))
            self.db.executemany('UPDATE messages SET processed=0 WHERE id=?', [(i,) for i in ids])
            self.db.execute("DELETE FROM meta WHERE key='index_at'")

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
        if self.actions():
            return
        with self.db:
            self.db.execute("DELETE FROM messages WHERE processed=1 AND seen_at < datetime('now', ?)", (f'-{days} days',))

    def status(self):
        return {'pending_messages': self.db.execute('SELECT count(*) FROM messages WHERE processed=0').fetchone()[0],
                'actions': [dict(r) for r in self.db.execute('SELECT status,count(*) AS count FROM actions GROUP BY status')],
                'spend': [dict(r) for r in self.db.execute('SELECT month,sum(amount) AS usd FROM spend GROUP BY month')],
                'last_success': self.get('last_success')}
