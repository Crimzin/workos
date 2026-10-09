"""Deterministic bounds on model-proposed changes."""
import math


def choose_stack(stacks, previous):
    eligible = [s for s in stacks if not s.get('archived', False)]
    measured = [s for s in eligible if isinstance(s.get('velocity'), (int, float))
                and not isinstance(s['velocity'], bool) and math.isfinite(s['velocity'])]
    if len(measured) != len(eligible) or not measured:
        return previous
    high = max(s['velocity'] for s in measured)
    leaders = sorted(s['id'] for s in measured if s['velocity'] == high)
    return previous if previous in leaders else leaders[0]


def sanitize(actions, messages, post_only=False, cards=None):
    """Drop what the evidence or the destination cannot support, keeping the rest of the batch."""
    sources, kept = {m['id']: m for m in messages}, []
    for action in actions if isinstance(actions, list) else []:
        if not isinstance(action, dict):
            continue
        action = dict(action)
        # A citation that matches no supplied message is dropped; an action left with none goes too.
        action['source_ids'] = [i for i in action.get('source_ids') or [] if i in sources]
        if not action['source_ids']:
            continue
        evidence = action.get('evidence') if isinstance(action.get('evidence'), dict) else {}
        fields = action.get('fields') if isinstance(action.get('fields'), dict) else {}
        supported = {}
        for name, value in fields.items():
            proof = evidence.get(name) if isinstance(evidence.get(name), dict) else {}
            source, quote = sources.get(proof.get('source_id')), proof.get('quote')
            if (name in ('owner', 'status', 'priority', 'deadline') and source and source['id'] in action.get('source_ids', [])
                    and isinstance(quote, str) and quote.strip() and quote in source.get('content', '')):
                supported[name] = value
        action.pop('fields', None)
        action.pop('evidence', None)
        if supported:
            action['fields'], action['evidence'] = supported, {k: evidence[k] for k in supported}
        if not action.get('note'):
            action.pop('note', None)
        excerpts = action.pop('excerpts', None)
        excerpts = {i: text for i, text in excerpts.items() if i in action['source_ids'] and isinstance(text, str) and text.strip()} if isinstance(excerpts, dict) else {}
        if excerpts:
            action['excerpts'] = excerpts
        if action.get('kind') == 'create':
            # A new card's body is its description; the discussion is quoted beneath it.
            summary = action.pop('post', None)
            if not action.get('description') and summary:
                action['description'] = summary
            if not action.get('title') or not action.get('description'):
                continue
        linked = set((cards or {}).get(action.get('card_id'), {}).get('linked_messages', []))
        if action.get('kind') == 'update' and linked and set(action['source_ids']) <= linked:
            # Every cited message is already linked from the card, by a person or an earlier run.
            continue
        if post_only and action.get('kind') == 'update':
            # The destination can only add posts; an update with nothing to post is dropped.
            action = {k: v for k, v in action.items() if k in ('kind', 'card_id', 'post', 'note', 'excerpts', 'source_ids') and v}
            if not action.get('post'):
                continue
        kept.append(action)
    return kept


def validate_actions(actions, messages, cards):
    sources = {m['id']: m for m in messages}
    if not isinstance(actions, list) or len(actions) > 20:
        raise ValueError('At most 20 actions are allowed per batch')
    allowed = {'kind', 'card_id', 'title', 'description', 'post', 'note', 'excerpts', 'fields', 'source_ids', 'evidence'}
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
        if not isinstance(action.get('excerpts', {}), dict):
            raise ValueError('Invalid excerpts')
        for field in ('title', 'description', 'post', 'note'):
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
