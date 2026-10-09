"""Bounded ingestion and reconciliation; model output never directly invokes tools."""
from datetime import datetime, timezone
from . import render
from .policy import choose_stack, sanitize, validate_actions
from .state import fingerprint


def now():
    return datetime.now(timezone.utc).isoformat()


def index_digest(index, own=()):
    # Identity and titles only: Factor regenerates card summaries on its own. Cards this worker
    # created are left out, or its first new card would hold every other one waiting behind it.
    return fingerprint(sorted((c['id'], c.get('title')) for c in index if c['id'] not in own))


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
    context = {'project': config.get('project_context', {}), 'people': config.get('people', {}), 'notes': store.get('notes', ''), 'tail': [m for m in store.get('tail', []) if m.get('channel_id') in store.get('sources', {})]}
    # Reply references are evidence/context, never separately advanced checkpoints.
    references = []
    for message in humans:
        if message.get('reply_id') and len(references) < 10 and discord.has('message'):
            references.append(await discord.call('message', guild_id=config['guild_id'], channel_id=message['channel_id'], message_id=message['reply_id']))
    context['references'] = references
    index = await card_index(store, factor, config)
    # Send times let the model tell whether a card was touched after the discussion it would cite.
    people, authors = config.get('people', {}), store.authors()
    dated = [{**m, 'author': people.get(m.get('author'), m.get('author')), 'content': render.named(m.get('content', ''), people, authors), 'sent_at': datetime.fromtimestamp(((int(m['id']) >> 22) + 1420070400000) / 1000, timezone.utc).strftime('%B %d, %Y, %H:%M UTC')} for m in humans]
    selected = await planner.select(dated, index, context)
    allowed_ids = {c['id'] for c in index}
    if not isinstance(selected, list):
        raise ValueError('Candidate selection was not a list')
    # Unknown IDs and overflow are discarded; only real indexed cards are ever retrieved.
    selected = [i for i in dict.fromkeys(selected) if i in allowed_ids][:min(config.get('max_candidates', 20), 30)]
    cards = {i: await factor.call('card', card_id=i) for i in selected}
    result = await planner.plan(dated, cards, context)
    evidence = {m['id']: m for m in [*context['tail'], *references, *humans] if not m.get('unavailable')}
    actions = sanitize(result['actions'], list(evidence.values()), config.get('factor', {}).get('adapter') == 'factor', cards)
    actions = validate_actions(actions, list(evidence.values()), cards)
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
            action['index_digest'] = index_digest(index, store.created_ids())
    store.save_plan([m['id'] for m in batch], actions, notes)
    store.put('tail', humans[-10:])


async def embeds_for(store, discord, factor, config, messages):
    """Copy image attachments into Factor once each; an image that fails is quoted by name instead."""
    embeds = {}
    if not (discord and discord.has('attachments') and factor.has('attach')):
        return embeds
    for message in messages:
        fresh = None
        for attachment in render.images(message):
            if len(embeds) >= config.get('max_images_per_post', 4):
                return embeds
            cache = f'upload:{message["id"]}:{attachment["id"]}'
            snippet = store.get(cache)
            if snippet is None:
                try:
                    if fresh is None:
                        fresh = {a['id']: a for a in await discord.call('attachments', guild_id=config['guild_id'],
                                                                         channel_id=message['channel_id'], message_id=message['id'])}
                    source = fresh.get(attachment['id'])
                    if not source or (source.get('size') or 0) > 3_000_000:
                        continue
                    snippet = (await factor.call('attach', url=source['url'], name=source['name']))['html']
                    store.put(cache, snippet)
                except Exception:
                    continue
            embeds[(message['id'], attachment['id'])] = snippet
    return embeds


async def apply_actions(store, factor, config, discord=None):
    pending = store.actions()
    if not pending:
        return
    destination, column, fresh = None, None, []
    if any(a['body']['kind'] == 'create' and a['status'] == 'pending' for a in pending):
        fresh = await card_index(store, factor, config, force=True)
        stacks = await factor.call('stacks')
        previous = store.get('destination', config['fallback_stack'])
        destination = choose_stack(stacks, previous) if config.get('velocity_verified') else previous
        target = next((s for s in stacks if s['id'] == destination and not s.get('archived', False)), None)
        if target:
            matches = [c['id'] for c in target['columns'] if c['name'].strip().casefold() == 'this week']
            column = matches[0] if len(matches) == 1 else None
        if column:
            store.put('destination', destination)
    writes = 0
    for record in pending:
        action, key = record['body'], record['key']
        if record['status'] == 'uncertain':
            if factor.has('reconcile'):
                result = await factor.call('reconcile', action_key=key, action=action, since=record['created_at'],
                                           stack_id=store.get('destination', config['fallback_stack']))
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
        quoted = render.exchange([m for m in (store.message(i) for i in action['source_ids']) if m], store.between)
        payload = {k: action[k] for k in ('title', 'description', 'fields', 'post') if k in action}

        async def text():
            # Images are copied only once every check below has passed, immediately before the write.
            embeds = await embeds_for(store, discord, factor, config, quoted)
            return render.body(action, quoted, config, store.get('sources', {}), embeds, key, store.authors())
        if action['kind'] == 'create':
            if not column:
                continue
            # Old dry-run creates require a fresh proposal, avoiding duplicates after human edits.
            if not action.get('index_at') or (datetime.now(timezone.utc) - datetime.fromisoformat(action['index_at'])).total_seconds() > config.get('index_ttl_seconds', 86400):
                store.set_action(key, 'conflict', {'reason': 'Creation index expired; replan required'})
                continue
            # Recomputed per action: an earlier create in this run adds to the worker's own cards.
            if action.get('index_digest') != index_digest(fresh, store.created_ids()):
                store.set_action(key, 'conflict', {'reason': 'Card index changed; replan required'})
                continue
            payload.update(stack_id=destination, column_id=column)
            payload.pop('post', None)
            payload['description'] = await text()
        else:
            current = await factor.call('card', card_id=action['card_id'])
            if fingerprint(current) != action['base']:
                store.set_action(key, 'conflict', {'reason': 'Card changed; replan required'})
                continue
            # Without atomic version checking, only an additive post is safe.
            if (not config.get('conditional_updates_verified') or action.get('revision') is None) and any(k in payload for k in ('title', 'description', 'fields')):
                store.set_action(key, 'conflict', {'reason': 'Conditional card updates not verified'})
                continue
            payload['post'] = await text()
        # Factor's write tool takes tens of seconds, so a run writes a bounded number and the rest wait.
        if writes >= config.get('max_writes_per_run', 12):
            break
        writes += 1
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
        await apply_actions(store, factor, config, discord)
    await propose(store, discord, factor, planner, config)
    if apply:
        await apply_actions(store, factor, config, discord)
    store.prune()
    status = store.status()
    if not store.actions():
        store.put('last_success', now())
    return {**status, 'mode': 'apply' if apply else 'dry-run', 'proposals': store.actions()}
