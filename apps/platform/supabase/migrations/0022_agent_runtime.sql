-- 0022_agent_runtime.sql
-- Provider-neutral agent capabilities, durable planning runs, run events,
-- run artifacts, and minimal provider/tool settings.

alter table if exists ai_standards
  drop constraint if exists ai_standards_category_check;

alter table if exists ai_standards
  add constraint ai_standards_category_check
  check (category in ('interaction', 'output', 'execution'));

create table if not exists agent_actor_capabilities (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references actors(id) on delete cascade,
  capability  text not null,
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(actor_id, capability),
  check (capability in ('chat', 'code', 'shell', 'git', 'browser', 'github', 'database', 'web'))
);

create table if not exists agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  instance_id          uuid not null references instances(id) on delete cascade,
  workspace_id         uuid not null references nodes(id) on delete cascade,
  target_node_id       uuid not null references nodes(id) on delete cascade,
  trigger_post_id      uuid not null references posts(id) on delete cascade,
  requester_actor_id   uuid not null references actors(id) on delete cascade,
  agent_actor_id       uuid not null references actors(id) on delete cascade,
  provider_key         text not null,
  status               text not null default 'planning',
  branch_name          text,
  worktree_path        text,
  summary              text,
  error                text,
  plan_body            text,
  confirmation_post_id uuid references posts(id) on delete set null,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (provider_key in ('inline_claude', 'codex', 'claude_code')),
  check (status in ('mentioned', 'planning', 'awaiting_confirmation', 'queued', 'running', 'needs_input', 'verifying', 'completed', 'failed', 'cancelled'))
);

create table if not exists agent_run_events (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references agent_runs(id) on delete cascade,
  event_type  text not null,
  message     text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists agent_run_artifacts (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references agent_runs(id) on delete cascade,
  artifact_type text not null,
  title         text not null,
  uri           text,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  check (length(trim(title)) > 0)
);

create table if not exists agent_provider_settings (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references instances(id) on delete cascade,
  provider_key text not null,
  label        text not null,
  enabled      boolean not null default false,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(instance_id, provider_key),
  check (provider_key in ('inline_claude', 'codex', 'claude_code')),
  check (length(trim(label)) > 0)
);

create table if not exists agent_tool_settings (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references instances(id) on delete cascade,
  tool_key     text not null,
  label        text not null,
  status       text not null default 'missing',
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(instance_id, tool_key),
  check (tool_key in ('aidex')),
  check (status in ('available', 'missing', 'stale', 'disabled')),
  check (length(trim(label)) > 0)
);

create index if not exists agent_actor_capabilities_actor_idx on agent_actor_capabilities(actor_id);
create index if not exists agent_runs_instance_idx on agent_runs(instance_id);
create index if not exists agent_runs_target_node_idx on agent_runs(target_node_id);
create index if not exists agent_runs_trigger_post_idx on agent_runs(trigger_post_id);
create index if not exists agent_runs_status_idx on agent_runs(status);
create index if not exists agent_run_events_run_idx on agent_run_events(run_id, created_at);
create index if not exists agent_run_artifacts_run_idx on agent_run_artifacts(run_id);
create index if not exists agent_provider_settings_instance_idx on agent_provider_settings(instance_id);
create index if not exists agent_tool_settings_instance_idx on agent_tool_settings(instance_id);

create or replace function set_agent_runtime_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agent_actor_capabilities_updated_at on agent_actor_capabilities;
create trigger trg_agent_actor_capabilities_updated_at
  before update on agent_actor_capabilities
  for each row execute function set_agent_runtime_updated_at();

drop trigger if exists trg_agent_runs_updated_at on agent_runs;
create trigger trg_agent_runs_updated_at
  before update on agent_runs
  for each row execute function set_agent_runtime_updated_at();

drop trigger if exists trg_agent_provider_settings_updated_at on agent_provider_settings;
create trigger trg_agent_provider_settings_updated_at
  before update on agent_provider_settings
  for each row execute function set_agent_runtime_updated_at();

drop trigger if exists trg_agent_tool_settings_updated_at on agent_tool_settings;
create trigger trg_agent_tool_settings_updated_at
  before update on agent_tool_settings
  for each row execute function set_agent_runtime_updated_at();

insert into agent_provider_settings (instance_id, provider_key, label, enabled, config)
select id, 'inline_claude', 'Claude inline replies', true, '{}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into agent_provider_settings (instance_id, provider_key, label, enabled, config)
select id, 'codex', 'Codex', false, '{"requires_confirmation":true}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into agent_provider_settings (instance_id, provider_key, label, enabled, config)
select id, 'claude_code', 'Claude Code', false, '{"requires_confirmation":true}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into agent_tool_settings (instance_id, tool_key, label, status, config)
select id, 'aidex', 'AiDex', 'missing', '{}'::jsonb
from instances
on conflict (instance_id, tool_key) do nothing;

notify pgrst, 'reload schema';
