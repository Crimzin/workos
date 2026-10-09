"""Operator entry point. Live writes always require --apply plus verified configuration."""
import argparse
import asyncio
import json
import jsonschema
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from .factor import TOOLS, FactorAdapter
from .mcp_io import Adapter, Connection
from .planner import Planner
from .runner import run_once
from .state import Store, run_lock


def discord_config():
    return {'transport':'stdio','command':sys.executable,'args':['-m','context_sync.discord_mcp']}


def discord_operations():
    return {
        'sources':{'tool':'list_sources','arguments':{'guild_id':'$guild_id','channel_ids':'$channel_ids','since':'$since'},'result':{'path':'items'}},
        'messages':{'tool':'read_messages','arguments':{'guild_id':'$guild_id','channel_id':'$channel_id','after':'$after','limit':'$limit'},'result':{'path':'items'}},
        'attachments':{'tool':'read_attachments','arguments':{'guild_id':'$guild_id','channel_id':'$channel_id','message_id':'$message_id'},'result':{'path':'items'}},
        'message':{'tool':'read_message','arguments':{'guild_id':'$guild_id','channel_id':'$channel_id','message_id':'$message_id'}},
    }


HEX = re.compile('[0-9a-f]{24}')


def native(config):
    return config.get('factor', {}).get('adapter') == 'factor'


def validate_config(config, apply=False):
    if not isinstance(config.get('guild_id'), str) or not config['guild_id'].isdigit():
        raise ValueError('Configure guild_id from Discord MCP discovery')
    if not config.get('channel_ids') or any(not isinstance(c, str) or not c.isdigit() for c in config['channel_ids']):
        raise ValueError('Configure explicit Discord channel_ids')
    if not config.get('fallback_stack'):
        raise ValueError('Configure the verified initial Factor stack ID')
    if native(config):
        stacks = config.get('stack_ids')
        if not stacks or len(stacks) > 30 or any(not isinstance(s, str) or not HEX.fullmatch(s) for s in stacks):
            raise ValueError('Configure the verified Factor stack_ids')
        if config['fallback_stack'] not in stacks:
            raise ValueError('fallback_stack must be one of stack_ids')
    else:
        required = {'index', 'card', 'stacks'} | ({'create', 'update'} if apply else set())
        missing = required - set(config.get('factor_operations', {}))
        if missing:
            raise ValueError('Missing Factor MCP mappings: ' + ', '.join(sorted(missing)))
    if apply and not config.get('live_writes_verified'):
        raise ValueError('Review a real dry-run and set live_writes_verified before applying')
    for name, default, maximum in [('batch_size',100,200),('pages_per_source',10,50),('max_output_tokens',4096,32000),('max_context_chars',120000,200000)]:
        value = config.get(name, default)
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= maximum:
            raise ValueError(f'Invalid bounded setting: {name}')
    budget = config.get('monthly_budget_usd', 5)
    if not isinstance(budget, (int, float)) or not 0 < budget <= 100:
        raise ValueError('monthly_budget_usd must be between 0 and 100')


def initialize_cutoff(store, config):
    cutoff = store.get('bootstrap')
    if cutoff is None:
        when = datetime.now(timezone.utc) - timedelta(days=config.get('bootstrap_days', 7))
        cutoff = {'bootstrap_since':when.isoformat(), 'bootstrap_after':str((int(when.timestamp()*1000)-1420070400000) << 22)}
        store.put('bootstrap', cutoff)
    return {**config, **cutoff}


async def main_async(args):
    config = json.loads(Path(args.config).read_text()) if args.config else {}
    state_dir = Path(args.state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)
    if os.environ.get('SWARM_TOKEN_KEY_FILE') and not os.environ.get('SWARM_TOKEN_KEY'):
        os.environ['SWARM_TOKEN_KEY'] = Path(os.environ['SWARM_TOKEN_KEY_FILE']).read_text().strip()
    if args.command in ('discover', 'login'):
        server_config = config.get('discord', discord_config()) if args.server == 'discord' else config.get('factor', {'url':'https://burn.factor.work/mcp'})
        with run_lock(state_dir/'sync.db'):
            async with Connection(server_config, state_dir, interactive=args.command == 'login') as connection:
                if args.tool:
                    value = await connection.call(args.tool, json.loads(args.arguments))
                else:
                    value = list(connection.tools.values())
                print(json.dumps(value, indent=2))
        return 0
    with run_lock(state_dir/'sync.db'), Store(state_dir/'sync.db') as store:
        if args.command == 'status':
            print(json.dumps(store.status(), indent=2))
            return 0
        if args.command == 'replan':
            if not args.action:
                raise ValueError('--action is required')
            store.replan(args.action)
            print('Unwritten proposal superseded; source messages queued for replanning.')
            return 0
        validate_config(config, args.apply)
        config = initialize_cutoff(store, config)
        async with Connection(config.get('discord', discord_config()), state_dir) as discord_conn:
            async with Connection(config['factor'], state_dir) as factor_conn:
                discord = Adapter(discord_conn, config.get('discord_operations', discord_operations()))
                if native(config):
                    planner = Planner(store, config)
                    factor = FactorAdapter(factor_conn, config, store=store, reader=planner.describe)
                    needed = TOOLS['read'] | (TOOLS['write'] if args.apply else set())
                else:
                    planner = Planner(store, config)
                    factor = Adapter(factor_conn, config['factor_operations'])
                    needed = {rule['tool'] for rule in factor.operations.values()}
                if needed - set(factor_conn.tools):
                    raise ValueError('Configured Factor tool is not available: ' + ', '.join(sorted(needed - set(factor_conn.tools))))
                if args.command == 'check':
                    print(json.dumps({'connected':True,'factor_tools':sorted(factor_conn.tools)}))
                    return 0
                try:
                    result = await asyncio.wait_for(run_once(store, discord, factor, planner, config, args.apply), timeout=config.get('run_timeout_seconds', 1500))
                except BaseException as error:
                    # Only this worker's own plain ValueErrors carry a safe, fixed message.
                    reason = str(error)[:200] if type(error) is ValueError else None
                    if isinstance(error, jsonschema.ValidationError):
                        # Rule and location only; the message itself can quote discussion content.
                        reason = f'{error.validator} at {"/".join(str(part) for part in error.absolute_path)}'
                    store.put('last_error', {'at':datetime.now(timezone.utc).isoformat(), 'type':type(error).__name__, 'reason':reason})
                    raise
                # Detailed proposals are a private file; routine logs contain only counts.
                report = state_dir/'last-run.json'
                fd = os.open(report, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, 'w') as handle:
                    json.dump(result, handle, indent=2)
                print(json.dumps({k:v for k,v in result.items() if k != 'proposals'}))
                if args.apply and store.actions():
                    return 2
                return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['discover','login','check','run','status','replan'])
    parser.add_argument('--config')
    parser.add_argument('--action', help='Local action key for replan')
    parser.add_argument('--state-dir', default=os.environ.get('SWARM_STATE_DIR', '.sync-state'))
    parser.add_argument('--server', choices=['factor','discord'], default='factor')
    parser.add_argument('--tool', help='Explicit read-only tool to call during discovery')
    parser.add_argument('--arguments', default='{}')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.tool and (args.server != 'discord' or args.tool not in {'list_guilds','list_channels','list_sources','read_messages','read_message','read_attachments'}):
        parser.error('Discovery tool calls are limited to bundled read-only Discord tools')
    try:
        return asyncio.run(main_async(args))
    except Exception as error:
        # Exceptions from remote clients may embed credentials; only disclose their class.
        print(f'Sync stopped ({type(error).__name__}). Check configuration and connection authorization; queued work is preserved.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
