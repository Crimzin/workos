create table if not exists workos_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  workspace_id uuid references nodes(id) on delete set null,
  node_id uuid references nodes(id) on delete set null,
  actor_id uuid references actors(id) on delete set null,
  event_type text not null,
  subject_type text not null,
  subject_id uuid,
  occurred_at timestamptz not null default now(),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(trim(event_type)) > 0),
  check (length(trim(subject_type)) > 0)
);

alter table workos_events enable row level security;

create index if not exists workos_events_instance_occurred_idx
  on workos_events(instance_id, occurred_at desc);

create index if not exists workos_events_workspace_occurred_idx
  on workos_events(workspace_id, occurred_at desc)
  where workspace_id is not null;

create index if not exists workos_events_node_occurred_idx
  on workos_events(node_id, occurred_at desc)
  where node_id is not null;

create index if not exists workos_events_actor_occurred_idx
  on workos_events(actor_id, occurred_at desc)
  where actor_id is not null;

create index if not exists workos_events_type_occurred_idx
  on workos_events(event_type, occurred_at desc);

notify pgrst, 'reload schema';
