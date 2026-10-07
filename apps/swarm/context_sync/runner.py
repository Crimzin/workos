"""Bounded ingestion and reconciliation; model output never directly invokes tools."""
from datetime import datetime, timezone
from .policy import choose_stack, validate_actions
from .state import fingerprint


def now():
    return datetime.now(timezone.utc).isoformat()


async def ingest(store, discord, config):
    started = now()
    since = store.get('discovery_since', config['bootstrap_since'])
    sources = await discord.call('sources', guild_id=config['guild_id'], channel_ids=config['channel_ids'], since=since)
    known = store.get('sources', {})
    known.update({s['id']: s for s in sources})
    scope = set(config['channel_ids'])
    previous_scope = store.get('configured_scope')
    if previous_scope is not None and previous_scope != sorted(scope):
        store.put('notes', '')
        store.put('tail', [])
    store.put('configured_scope', sorted(scope))
    known = {i:s for i,s in known.items() if s['id'] in scope or s.get('parent_id') in scope}
    store.put('sources', known)
    # Retain discovered threads even after they archive, including unfinished backlogs.
    for source in known.values():
        channel = source['id']
        after = store.overlap_after(channel) or store.cursor(channel) or config['bootstrap_after']
        for _ in range(config.get('pages_per_source', 10)):
            page = await discord.call('messages', guild_id=config['guild_id'], channel_id=channel, after=after, limit=100)
            if not page:
                break
            if any(int(m['id']) <= int(after) for m in page):
                raise ValueError('Discord page did not move forward from checkpoint')
            store.ingest(channel, page)
            after = store.cursor(channel)
            if len(page) < 100:
                break
    store.put('discovery_since', started)


async def card_index(store, factor, config, force=False):
    cached = store.get('card_index')
    stamp = store.get('index_at')
    if not force and cached is not None and stamp and (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds() < config.get('index_ttl_seconds', 86400):
        return cached
    items, cursor, seen = [], None, set()
    for _ in range(20):
        page = await factor.call('index', cursor=cursor, limit=100)
        items.extend(page['items'])
        cursor = page.get('next')
        if not cursor:
            items.sort(key=lambda item: item['id'])
            store.put('card_index', items)
            store.put('index_at', now())
            return items
        if cursor in seen:
            raise ValueError('Factor index cursor repeated')
        seen.add(cursor)
    raise ValueError('Factor index exceeded bounded refresh; narrow workspace scope')


async def propose(store, discord, factor, planner, config):
    if store.actions():
        return
    batch = store.pending_messages(config.get('batch_size', 100), list(store.get('sources', {})))
    if not batch:
        return
    humans = [m for m in batch if not m.get('bot', False)]
    if not humans:
        store.save_plan([m['id'] for m in batch], [], store.get('notes', ''))
        return
    context = {'project': config.get('project_context', {}), 'notes': store.get('notes', ''), 'tail': [m for m in store.get('tail', []) if m.get('channel_id') in store.get('sources', {})]}
    # Reply references are evidence/context, never separately advanced checkpoints.
    references = []
    for message in humans:
        if message.get('reply_id') and len(references) < 10 and discord.has('message'):
            references.append(await discord.call('message', guild_id=config['guild_id'], channel_id=message['channel_id'], message_id=message['reply_id']))
    context['references'] = references
    index = await card_index(store, factor, config)
    selected = await planner.select(humans, index, context)
    allowed_ids = {c['id'] for c in index}
    if not isinstance(selected, list) or len(selected) > 8 or any(i not in allowed_ids for i in selected):
        raise ValueError('Candidate selection exceeded bounds or invented card IDs')
    cards = {i: await factor.call('card', card_id=i) for i in selected}
    result = await planner.plan(humans, cards, context)
    evidence = {m['id']: m for m in [*context['tail'], *references, *humans] if not m.get('unavailable')}
    actions = validate_actions(result['actions'], list(evidence.values()), cards)
    notes = result.get('notes', '')
    if not isinstance(notes, str) or len(notes) > 8000:
        raise ValueError('Retained context exceeds limit')
    for action in actions:
        action['source_urls'] = [evidence[i]['url'] for i in action['source_ids']]
        action['source_channels'] = {i:evidence[i].get('channel_id') for i in action['source_ids']}
        action['source_hashes'] = {i:fingerprint(store.message(i)) for i in action['source_ids'] if store.message(i) is not None}
        if action['kind'] == 'update':
            action['base'] = fingerprint(cards[action['card_id']])
            action['revision'] = cards[action['card_id']].get('revision')
        else:
            # Creation waits for a fresh search at apply time if supported; otherwise index must still be fresh.
            action['index_at'] = store.get('index_at')
            action['index_digest'] = fingerprint(index)
    store.save_plan([m['id'] for m in batch], actions, notes)
    store.put('tail', humans[-10:])


async def apply_actions(store, factor, config):
    pending = store.actions()
    if not pending:
        return
    destination, column, fresh_digest = None, None, None
    if any(a['body']['kind'] == 'create' and a['status'] == 'pending' for a in pending):
        fresh_digest = fingerprint(await card_index(store, factor, config, force=True))
        stacks = await factor.call('stacks')
        previous = store.get('destination', config['fallback_stack'])
        destination = choose_stack(stacks, previous) if config.get('velocity_verified') else previous
        target = next((s for s in stacks if s['id'] == destination and not s.get('archived', False)), None)
        if target:
            matches = [c['id'] for c in target['columns'] if c['name'].strip().casefold() == 'this week']
            column = matches[0] if len(matches) == 1 else None
        if column:
            store.put('destination', destination)
    for record in pending:
        action, key = record['body'], record['key']
        if record['status'] == 'uncertain':
            if factor.has('reconcile'):
                result = await factor.call('reconcile', action_key=key)
                if isinstance(result, dict) and result.get('action_key') == key and result.get('id'):
                    store.set_action(key, 'done', result)
                    store.put('index_at', None)
            continue
        if record['status'] != 'pending':
            continue
        if any(channel not in store.get('sources', {}) for channel in action.get('source_channels', {}).values()):
            store.set_action(key, 'conflict', {'reason':'Source channel is no longer in scope'})
            continue
        if any(store.message(i) is None or fingerprint(store.message(i)) != digest for i,digest in action.get('source_hashes', {}).items()):
            store.set_action(key, 'conflict', {'reason':'Source message changed; replan required'})
            continue
        provenance = '\n\nSources:\n' + '\n'.join(action['source_urls']) + f'\nSwarm action: {key}'
        payload = {k: action[k] for k in ('title', 'description', 'fields', 'post') if k in action}
        if action['kind'] == 'create':
            if not column:
                continue
            # Old dry-run creates require a fresh proposal, avoiding duplicates after human edits.
            if not action.get('index_at') or (datetime.now(timezone.utc) - datetime.fromisoformat(action['index_at'])).total_seconds() > config.get('index_ttl_seconds', 86400):
                store.set_action(key, 'conflict', {'reason': 'Creation index expired; replan required'})
                continue
            if action.get('index_digest') != fresh_digest:
                store.set_action(key, 'conflict', {'reason': 'Card index changed; replan required'})
                continue
            payload.update(stack_id=destination, column_id=column)
            payload['description'] += provenance
        else:
            current = await factor.call('card', card_id=action['card_id'])
            if fingerprint(current) != action['base']:
                store.set_action(key, 'conflict', {'reason': 'Card changed; replan required'})
                continue
            payload['post'] = payload.get('post', 'Updated from team discussion.') + provenance
            # Without atomic version checking, only an additive post is safe.
            if (not config.get('conditional_updates_verified') or action.get('revision') is None) and any(k in payload for k in ('title', 'description', 'fields')):
                store.set_action(key, 'conflict', {'reason': 'Conditional card updates not verified'})
                continue
        # Persist before crossing the network. A process crash leaves this uncertain.
        store.set_action(key, 'uncertain')
        try:
            result = await factor.call(action['kind'], payload=payload, card_id=action.get('card_id'),
                                       action_key=key, expected_revision=action.get('revision'))
            if not isinstance(result, dict) or not result.get('id'):
                raise ValueError('Write result did not include an ID')
        except Exception:
            continue
        store.set_action(key, 'done', result)
        store.put('index_at', None)


async def run_once(store, discord, factor, planner, config, apply=False):
    await ingest(store, discord, config)
    # Drain earlier writes first; then refresh the index before planning more creations.
    if apply:
        await apply_actions(store, factor, config)
    await propose(store, discord, factor, planner, config)
    if apply:
        await apply_actions(store, factor, config)
    store.prune()
    status = store.status()
    if not store.actions():
        store.put('last_success', now())
    return {**status, 'mode': 'apply' if apply else 'dry-run', 'proposals': store.actions()}
