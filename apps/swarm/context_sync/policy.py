"""Deterministic bounds on model-proposed changes."""
import math


def choose_stack(stacks, previous):
    eligible = [s for s in stacks if not s.get('archived', False)]
    measured = [s for s in eligible if isinstance(s.get('velocity'), (int, float))
                and not isinstance(s['velocity'], bool) and math.isfinite(s['velocity'])]
    if not measured:
        return previous
    high = max(s['velocity'] for s in measured)
    leaders = sorted(s['id'] for s in measured if s['velocity'] == high)
    return previous if previous in leaders else leaders[0]


def validate_actions(actions, messages, cards):
    sources = {m['id']: m for m in messages}
    if not isinstance(actions, list) or len(actions) > 20:
        raise ValueError('At most 20 actions are allowed per batch')
    allowed = {'kind', 'card_id', 'title', 'description', 'post', 'fields', 'source_ids', 'evidence'}
    for action in actions:
        if not isinstance(action, dict) or set(action) - allowed:
            raise ValueError('Unknown action fields')
        if action.get('kind') not in ('create', 'update'):
            raise ValueError('Unsupported action kind')
        ids = action.get('source_ids', [])
        if not ids or any(i not in sources for i in ids):
            raise ValueError('Every action needs real source messages')
        if action['kind'] == 'update' and action.get('card_id') not in cards:
            raise ValueError('Update target was not retrieved')
        if action['kind'] == 'create' and (not action.get('title') or not action.get('description')):
            raise ValueError('New cards require title and description')
        if not any(action.get(k) for k in ('title', 'description', 'post', 'fields')):
            raise ValueError('Empty change')
        for field in ('title', 'description', 'post'):
            if field in action and (not isinstance(action[field], str) or not action[field].strip() or len(action[field]) > 16000):
                raise ValueError('Invalid text change')
        fields = action.get('fields', {})
        if not isinstance(fields, dict) or set(fields) - {'owner', 'status', 'priority', 'deadline'}:
            raise ValueError('Unsupported structured field')
        for field in fields:
            evidence = action.get('evidence', {}).get(field, {})
            source = sources.get(evidence.get('source_id'))
            quote = evidence.get('quote')
            if not source or source['id'] not in ids or not isinstance(quote, str) or not quote.strip() or quote not in source.get('content', ''):
                raise ValueError('Field changes require verbatim source evidence')
    return actions
