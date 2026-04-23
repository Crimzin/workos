-- Phase 1.1 expansion: Instance, Actors, Members, Data Fields
--
-- Adds the Instance layer above workspaces, the actor model (humans + agents
-- share one table), node membership, and the instance-global data fields
-- system with its default "Status" field used to drive Board columns.

-- =============================================================================
-- Instances
-- =============================================================================

create table if not exists instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists instances_set_updated_at on instances;
create trigger instances_set_updated_at
  before update on instances
  for each row execute function set_updated_at();

-- =============================================================================
-- Actors (humans + agents, one table)
-- =============================================================================

do $$ begin
  create type actor_kind as enum ('human', 'agent');
exception when duplicate_object then null; end $$;

create table if not exists actors (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  kind actor_kind not null,
  name text not null,
  agent_type text,  -- e.g., 'claude', 'claude_code', 'swarm', 'brainshare'; null for humans
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists actors_instance_id_idx on actors(instance_id);

drop trigger if exists actors_set_updated_at on actors;
create trigger actors_set_updated_at
  before update on actors
  for each row execute function set_updated_at();

-- =============================================================================
-- Nodes: add instance_id, owner_id, archived_at; drop text owner + status
-- =============================================================================

alter table nodes add column if not exists instance_id uuid references instances(id) on delete cascade;
alter table nodes add column if not exists owner_id uuid references actors(id) on delete set null;
alter table nodes add column if not exists archived_at timestamptz;

create index if not exists nodes_instance_id_idx on nodes(instance_id);
create index if not exists nodes_owner_id_idx on nodes(owner_id);

-- =============================================================================
-- Node members (actors who participate on a node, beyond the owner)
-- =============================================================================

create table if not exists node_members (
  node_id uuid not null references nodes(id) on delete cascade,
  actor_id uuid not null references actors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, actor_id)
);
create index if not exists node_members_actor_id_idx on node_members(actor_id);

-- =============================================================================
-- Data fields (instance-global)
-- =============================================================================

do $$ begin
  create type field_type as enum ('single_select', 'multi_select', 'text', 'date');
exception when duplicate_object then null; end $$;

create table if not exists data_fields (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  name text not null,
  field_type field_type not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, name)
);
create index if not exists data_fields_instance_id_idx on data_fields(instance_id);

drop trigger if exists data_fields_set_updated_at on data_fields;
create trigger data_fields_set_updated_at
  before update on data_fields
  for each row execute function set_updated_at();

-- Options for select-type fields. `color` references a design-token key
-- like 'badge-1'..'badge-6' so the UI can theme badges consistently.
create table if not exists data_field_options (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references data_fields(id) on delete cascade,
  name text not null,
  color text not null default 'badge-1',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (field_id, name)
);
create index if not exists data_field_options_field_id_idx on data_field_options(field_id);

-- Values of fields on nodes. For text/date/single_select there is one row per
-- (node, field). For multi_select there can be multiple rows per (node, field),
-- each pointing at a different option.
create table if not exists node_field_values (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references nodes(id) on delete cascade,
  field_id uuid not null references data_fields(id) on delete cascade,
  option_id uuid references data_field_options(id) on delete cascade,
  value_text text,
  value_date date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists node_field_values_node_id_idx on node_field_values(node_id);
create index if not exists node_field_values_field_id_idx on node_field_values(field_id);

drop trigger if exists node_field_values_set_updated_at on node_field_values;
create trigger node_field_values_set_updated_at
  before update on node_field_values
  for each row execute function set_updated_at();

-- =============================================================================
-- Wipe dev seed and re-seed with the new model
-- =============================================================================

truncate nodes cascade;

do $$
declare
  instance_id uuid := gen_random_uuid();
  will_id uuid := gen_random_uuid();
  claude_id uuid := gen_random_uuid();
  claude_code_id uuid := gen_random_uuid();
  swarm_id uuid := gen_random_uuid();
  brainshare_id uuid := gen_random_uuid();

  personal_ws_id uuid := gen_random_uuid();
  burn_ws_id uuid := gen_random_uuid();

  roadmap_stack_id uuid := gen_random_uuid();
  bugs_stack_id uuid := gen_random_uuid();
  inbox_stack_id uuid := gen_random_uuid();

  card1_id uuid := gen_random_uuid();
  card2_id uuid := gen_random_uuid();
  card3_id uuid := gen_random_uuid();

  status_field_id uuid := gen_random_uuid();
  opt_backlog uuid := gen_random_uuid();
  opt_prioritized uuid := gen_random_uuid();
  opt_planning uuid := gen_random_uuid();
  opt_in_progress uuid := gen_random_uuid();
  opt_done uuid := gen_random_uuid();
begin
  -- Instance
  insert into instances (id, name) values (instance_id, 'Will');

  -- Actors: one human + four agents
  insert into actors (id, instance_id, kind, name, agent_type) values
    (will_id,        instance_id, 'human', 'Will',         null),
    (claude_id,      instance_id, 'agent', 'Claude',       'claude'),
    (claude_code_id, instance_id, 'agent', 'Claude Code',  'claude_code'),
    (swarm_id,       instance_id, 'agent', 'Swarm',        'swarm'),
    (brainshare_id,  instance_id, 'agent', 'BrainShare',   'brainshare');

  -- Workspaces: personal (undeletable) + Burn
  insert into nodes (id, instance_id, parent_id, type, title, description, owner_id, position) values
    (personal_ws_id, instance_id, null, 'workspace', 'Will''s Workspace', 'Personal workspace', will_id, 0),
    (burn_ws_id,     instance_id, null, 'workspace', 'Burn',              'Burn product development', will_id, 1);

  -- Stacks
  insert into nodes (id, instance_id, parent_id, type, title, description, owner_id, position) values
    (roadmap_stack_id, instance_id, burn_ws_id,     'stack', 'Roadmap', 'In-flight features and next-up work', will_id, 0),
    (bugs_stack_id,    instance_id, burn_ws_id,     'stack', 'Bugs',    'Known issues and triage',             will_id, 1),
    (inbox_stack_id,   instance_id, personal_ws_id, 'stack', 'My First Stack', 'A place to start — rename me anytime', will_id, 0);

  -- Cards
  insert into nodes (id, instance_id, parent_id, type, title, description, owner_id, position) values
    (card1_id, instance_id, roadmap_stack_id, 'card', 'Build WorkOS v0 data model', 'Recursive node schema in Supabase',             will_id, 0),
    (card2_id, instance_id, roadmap_stack_id, 'card', 'Kanban view',                'Columns by status, drag + drop within a stack', will_id, 1),
    (card3_id, instance_id, bugs_stack_id,    'card', 'Login screen flashes',       'Brief render of empty state on cold load',      will_id, 0);

  -- Claude Code is a member of the data-model card since it's building it
  insert into node_members (node_id, actor_id) values (card1_id, claude_code_id);

  -- Default Status field (instance-global)
  insert into data_fields (id, instance_id, name, field_type, position) values
    (status_field_id, instance_id, 'Status', 'single_select', 0);

  insert into data_field_options (id, field_id, name, color, position) values
    (opt_backlog,     status_field_id, 'Backlog',     'badge-1', 0),
    (opt_prioritized, status_field_id, 'Prioritized', 'badge-6', 1),
    (opt_planning,    status_field_id, 'Planning',    'badge-3', 2),
    (opt_in_progress, status_field_id, 'In Progress', 'badge-2', 3),
    (opt_done,        status_field_id, 'Done',        'badge-4', 4);

  -- Status values for the three seeded cards
  insert into node_field_values (node_id, field_id, option_id) values
    (card1_id, status_field_id, opt_in_progress),
    (card2_id, status_field_id, opt_backlog),
    (card3_id, status_field_id, opt_backlog);
end $$;

-- =============================================================================
-- Clean up old columns now that data is backfilled
-- =============================================================================

alter table nodes drop column if exists owner;
alter table nodes drop column if exists status;

-- Tighten: instance_id should be non-null going forward
alter table nodes alter column instance_id set not null;
