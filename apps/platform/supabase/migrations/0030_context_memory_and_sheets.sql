create table if not exists account_memory_records (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  category text not null
    check (category in ('identity', 'role', 'current_project', 'standing_goal', 'preference', 'communication_style', 'writing_voice', 'recurring_constraint', 'tool_context', 'relationship', 'correction', 'sensitive_fact', 'work_standard')),
  statement text not null,
  scope text not null default 'account'
    check (scope in ('account', 'workspace', 'project', 'person', 'domain')),
  scope_ref_id uuid,
  status text not null default 'active'
    check (status in ('active', 'tentative', 'superseded', 'retracted')),
  sensitivity_label text not null default 'normal'
    check (sensitivity_label in ('normal', 'private', 'financial', 'medical', 'legal', 'credential_like', 'high_care')),
  conviction numeric(3,2) not null default 1.00
    check (conviction >= 0 and conviction <= 1),
  source_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  supersedes_memory_id uuid references account_memory_records(id) on delete set null,
  superseded_by_memory_id uuid references account_memory_records(id) on delete set null,
  created_by_actor_id uuid references actors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  stale_after timestamptz,
  retracted_at timestamptz,
  check (length(trim(statement)) > 0)
);

create table if not exists thread_context_sheets (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  long_term jsonb not null default '[]'::jsonb,
  short_term jsonb not null default '[]'::jsonb,
  active_working jsonb not null default '[]'::jsonb,
  markdown text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agent_runs
  add column if not exists current_stage text,
  add column if not exists prompt_manifest jsonb not null default '{}'::jsonb;

create index if not exists account_memory_records_instance_status_idx
  on account_memory_records(instance_id, status, updated_at desc);

create index if not exists account_memory_records_category_idx
  on account_memory_records(instance_id, category, status);

create index if not exists account_memory_records_sensitivity_idx
  on account_memory_records(instance_id, sensitivity_label, status);

create unique index if not exists thread_context_sheets_thread_idx
  on thread_context_sheets(thread_id);

create index if not exists thread_context_sheets_instance_updated_idx
  on thread_context_sheets(instance_id, updated_at desc);

create index if not exists agent_runs_inline_stage_idx
  on agent_runs(target_node_id, provider_key, status, updated_at desc)
  where provider_key = 'inline_claude';

drop trigger if exists account_memory_records_set_updated_at on account_memory_records;
create trigger account_memory_records_set_updated_at
  before update on account_memory_records
  for each row execute function set_updated_at();

drop trigger if exists thread_context_sheets_set_updated_at on thread_context_sheets;
create trigger thread_context_sheets_set_updated_at
  before update on thread_context_sheets
  for each row execute function set_updated_at();

alter table account_memory_records enable row level security;
alter table thread_context_sheets enable row level security;

notify pgrst, 'reload schema';
