create table if not exists model_provider_settings (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  provider_key text not null check (provider_key in ('anthropic', 'openai', 'google', 'deepseek', 'perplexity')),
  label text not null,
  enabled boolean not null default false,
  auth_strategy text not null default 'env' check (auth_strategy in ('env')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_id, provider_key),
  check (length(trim(label)) > 0)
);

create table if not exists model_routing_policies (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  mode text not null default 'auto' check (mode in ('auto', 'ask_first', 'off')),
  preferred_research_provider_key text not null default 'perplexity' check (preferred_research_provider_key in ('perplexity', 'google')),
  max_cost_tier text not null default 'standard' check (max_cost_tier in ('low', 'standard', 'premium')),
  allow_parallel_research boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists model_provider_settings_instance_idx
  on model_provider_settings(instance_id);

create unique index if not exists model_routing_policies_instance_idx
  on model_routing_policies(instance_id);

create or replace function set_model_routing_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_model_provider_settings_updated_at on model_provider_settings;
create trigger trg_model_provider_settings_updated_at
  before update on model_provider_settings
  for each row execute function set_model_routing_updated_at();

drop trigger if exists trg_model_routing_policies_updated_at on model_routing_policies;
create trigger trg_model_routing_policies_updated_at
  before update on model_routing_policies
  for each row execute function set_model_routing_updated_at();

insert into model_provider_settings (
  instance_id,
  provider_key,
  label,
  enabled,
  auth_strategy,
  config
)
select id, 'anthropic', 'Claude', true, 'env', '{"default_model_id":"claude-sonnet-5","default_model_label":"Sonnet 5"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (
  instance_id,
  provider_key,
  label,
  enabled,
  auth_strategy,
  config
)
select id, 'openai', 'ChatGPT', false, 'env', '{"default_model_id":"gpt-5.5","default_model_label":"GPT-5.5"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (
  instance_id,
  provider_key,
  label,
  enabled,
  auth_strategy,
  config
)
select id, 'google', 'Gemini', false, 'env', '{"default_model_id":"gemini-3-pro","default_model_label":"Gemini 3 Pro"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (
  instance_id,
  provider_key,
  label,
  enabled,
  auth_strategy,
  config
)
select id, 'deepseek', 'DeepSeek', false, 'env', '{"default_model_id":"deepseek-v4-pro","default_model_label":"DeepSeek V4 Pro"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_provider_settings (
  instance_id,
  provider_key,
  label,
  enabled,
  auth_strategy,
  config
)
select id, 'perplexity', 'Perplexity', false, 'env', '{"default_model_id":"sonar-pro","default_model_label":"Sonar Pro"}'::jsonb
from instances
on conflict (instance_id, provider_key) do nothing;

insert into model_routing_policies (
  instance_id,
  mode,
  preferred_research_provider_key,
  max_cost_tier,
  allow_parallel_research,
  config
)
select id, 'auto', 'perplexity', 'standard', true, '{}'::jsonb
from instances
on conflict do nothing;

alter table model_provider_settings enable row level security;
alter table model_routing_policies enable row level security;

notify pgrst, 'reload schema';
