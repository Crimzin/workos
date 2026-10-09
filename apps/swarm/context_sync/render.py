"""Builds the text of a Factor post: summary, the discussion word for word, note, sources."""
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

IMAGE_TYPES = ('image/png', 'image/jpeg', 'image/gif', 'image/webp')


def sent(message_id, zone):
    return datetime.fromtimestamp(((int(message_id) >> 22) + 1420070400000) / 1000, timezone.utc).astimezone(ZoneInfo(zone))


def images(message):
    return [a for a in message.get('attachments', []) if a.get('id') and a.get('type') in IMAGE_TYPES]


def named(text, people, authors):
    """Show `<@id>` mentions as @Name; this is the only change made to a quoted message."""
    return re.sub(r'<@!?(\d+)>', lambda m: '@' + people.get(authors[m.group(1)], authors[m.group(1)]) if m.group(1) in authors else m.group(0), text)


def exchange(cited, between, minutes=30, limit=6):
    """Cited messages plus the uncited ones lying inside the same short back-and-forth.

    `between(channel, low, high)` returns stored messages between two IDs. A gap is filled only
    when the cited neighbours are close in time and few messages separate them.
    """
    ordered, result = sorted(cited, key=lambda m: int(m['id'])), []
    for index, message in enumerate(ordered):
        result.append(message)
        after = ordered[index + 1] if index + 1 < len(ordered) else None
        if not after or after.get('channel_id') != message.get('channel_id'):
            continue
        if ((int(after['id']) >> 22) - (int(message['id']) >> 22)) > minutes * 60000:
            continue
        gap = [m for m in between(message['channel_id'], message['id'], after['id']) if not m.get('bot')]
        if len(gap) <= limit:
            result.extend(gap)
    return result


def quoted(message, people, authors, excerpt):
    """The message text, or an exact passage of a long one with the cuts marked."""
    text = named(message['content'], people, authors).strip()
    excerpt = excerpt.strip() if isinstance(excerpt, str) else ''
    if len(text) <= 400 or not excerpt or excerpt == text or excerpt not in text:
        return text
    return ('' if text.startswith(excerpt) else '… ') + excerpt + ('' if text.endswith(excerpt) else ' …')


def marker(key):
    """The line that proves a post is this action's. Twelve characters of the key are shown."""
    return f'Swarm action: {key[:12]}'


def body(action, messages, config, sources, embeds, key, authors=None):
    """Markdown for one post. `messages` are quoted exactly as stored, inside a quote block;
    only the summary and the note come from the model."""
    people, zone, authors = config.get('people', {}), config.get('timezone', 'America/New_York'), authors or {}
    summary = (action.get('description') if action['kind'] == 'create' else action.get('post') or '').strip()
    quote, heading = [], None
    for message in sorted(messages, key=lambda m: int(m['id'])):
        when = sent(message['id'], zone)
        channel = sources.get(message.get('channel_id'), {}).get('name')
        label = f'**{"#" + channel if channel else "Discord"} · {when:%b} {when.day}**'
        if label != heading:
            quote.append(label)
            heading = label
        author = people.get(message.get('author'), message.get('author') or 'Unknown')
        text = quoted(message, people, authors, action.get('excerpts', {}).get(message['id']))
        quote.append(f'**{author}** · {when:%I:%M %p}'.replace('· 0', '· ') + (f'\n{text}' if text else ''))
        for attachment in message.get('attachments', []):
            quote.append(embeds.get((message['id'], attachment.get('id'))) or f'*(attachment: {attachment.get("name")})*')
    # Every line of the discussion sits in one Markdown quote block, blank lines included.
    block = '\n>\n'.join('\n'.join('> ' + line if line else '>' for line in part.split('\n')) for part in quote)
    links = ' · '.join(f'[{n}]({url})' for n, url in enumerate(action['source_urls'], 1))
    parts = [summary, block, f'*Note: {action["note"].strip()}*' if action.get('note') else '',
             f'Discord sources: {links}\n{marker(key)}']
    return '\n\n'.join(p for p in parts if p)
