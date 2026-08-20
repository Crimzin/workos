-- Thread Working Model projections and immutable answer reason traces.

alter table memory_primitives
  drop constraint if exists memory_primitives_type_check;

alter table memory_primitives
  add constraint memory_primitives_type_check
  check (
    type in (
      'goal',
      'decision',
      'idea',
      'assumption',
      'constraint',
      'question',
      'standard',
      'signal',
      'context_update',
      'rationale'
    )
  ),
  add column if not exists extraction_mode text not null default 'user_authored'
    check (extraction_mode in ('explicit', 'inferred', 'synthesized', 'user_authored')),
  add column if not exists conviction_posture text not null default 'assert'
    check (conviction_posture in ('assert', 'flag', 'ask')),
  add column if not exists conviction_factors jsonb not null default '[]'::jsonb,
  add column if not exists conviction_version text not null default 'working-model-v1',
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_to timestamptz,
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists sensitivity_label text not null default 'normal'
    check (
      sensitivity_label in (
        'normal',
        'private',
        'financial',
        'medical',
        'legal',
        'credential_like',
        'high_care'
      )
    ),
  add column if not exists supersedes_primitive_id uuid references memory_primitives(id) on delete set null,
  add column if not exists superseded_by_primitive_id uuid references memory_primitives(id) on delete set null,
  add column if not exists external_graph_id text,
  add column if not exists updated_by_actor_id uuid references actors(id) on delete set null,
  add column if not exists schema_version integer not null default 1
    check (schema_version > 0);

alter table memory_primitives
  drop constraint if exists memory_primitives_status_check;

alter table memory_primitives
  add constraint memory_primitives_status_check
  check (
    status in (
      'tentative',
      'active',
      'superseded',
      'retracted',
      'resolved',
      'untested',
      'validated',
      'invalidated',
      'reversed'
    )
  );

alter table memory_primitives
  drop constraint if exists memory_primitives_id_instance_key;

alter table memory_primitives
  add constraint memory_primitives_id_instance_key unique (id, instance_id);

create index if not exists memory_primitives_node_live_idx
  on memory_primitives(node_id, status, type, updated_at desc);

create index if not exists memory_primitives_supersedes_idx
  on memory_primitives(supersedes_primitive_id)
  where supersedes_primitive_id is not null;

create index if not exists memory_primitives_superseded_by_idx
  on memory_primitives(superseded_by_primitive_id)
  where superseded_by_primitive_id is not null;

create table if not exists memory_primitive_evidence (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  memory_primitive_id uuid not null,
  relation text not null
    check (relation in ('extracted_from', 'supports', 'contradicts', 'qualifies', 'reinforces', 'corrects')),
  source_kind text not null,
  source_app text,
  source_node_id uuid references nodes(id) on delete set null,
  source_post_id uuid references posts(id) on delete set null,
  source_message_id text,
  context_chunk_id uuid references context_chunks(id) on delete set null,
  excerpt text,
  source_span jsonb not null default '{}'::jsonb,
  actor_id uuid references actors(id) on delete set null,
  observed_at timestamptz,
  human_signal text not null default 'none'
    check (
      human_signal in (
        'none',
        'explicit_statement',
        'explicit_approval',
        'explicit_correction',
        'observed_action',
        'repeated_reference'
      )
    ),
  authority_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_primitive_evidence_claim_instance_fk
    foreign key (memory_primitive_id, instance_id)
    references memory_primitives(id, instance_id)
    on delete restrict
);

create index if not exists memory_primitive_evidence_claim_idx
  on memory_primitive_evidence(memory_primitive_id, relation, observed_at desc);

create index if not exists memory_primitive_evidence_source_post_idx
  on memory_primitive_evidence(source_post_id)
  where source_post_id is not null;

create index if not exists memory_primitive_evidence_source_node_idx
  on memory_primitive_evidence(source_node_id)
  where source_node_id is not null;

create table if not exists memory_primitive_edges (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  from_primitive_id uuid not null,
  to_primitive_id uuid not null,
  relationship_kind text not null
    check (relationship_kind in ('depends_on', 'supports', 'contradicts', 'serves_goal', 'answers', 'derived_from', 'qualifies', 'revises')),
  status text not null default 'active'
    check (status in ('active', 'retracted')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  derivation_metadata jsonb not null default '{}'::jsonb,
  created_by_actor_id uuid references actors(id) on delete set null,
  updated_by_actor_id uuid references actors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_primitive_edges_from_instance_fk
    foreign key (from_primitive_id, instance_id)
    references memory_primitives(id, instance_id)
    on delete cascade,
  constraint memory_primitive_edges_to_instance_fk
    foreign key (to_primitive_id, instance_id)
    references memory_primitives(id, instance_id)
    on delete cascade,
  check (from_primitive_id <> to_primitive_id)
);

create unique index if not exists memory_primitive_edges_active_unique_idx
  on memory_primitive_edges(from_primitive_id, to_primitive_id, relationship_kind)
  where status = 'active';

create index if not exists memory_primitive_edges_to_idx
  on memory_primitive_edges(to_primitive_id, status);

create table if not exists context_retrieval_overrides (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  target_type text not null
    check (target_type in ('memory_primitive', 'account_memory', 'context_source')),
  target_id uuid not null,
  directive text not null default 'exclude'
    check (directive in ('exclude', 'demote')),
  user_reason text,
  created_by_actor_id uuid references actors(id) on delete set null,
  cleared_by_actor_id uuid references actors(id) on delete set null,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists context_retrieval_overrides_active_unique_idx
  on context_retrieval_overrides(thread_id, target_type, target_id)
  where cleared_at is null;

create index if not exists context_retrieval_overrides_thread_active_idx
  on context_retrieval_overrides(thread_id, created_at desc)
  where cleared_at is null;

create table if not exists reason_traces (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  trace_kind text not null
    check (
      trace_kind in (
        'answer',
        'priority_recommendation',
        'next_move_recommendation',
        'schedule_recommendation',
        'tool_selection',
        'workflow_step'
      )
    ),
  subject_type text not null,
  subject_id uuid not null,
  agent_run_id uuid references agent_runs(id) on delete set null,
  status text not null
    check (status in ('complete', 'partial', 'failed')),
  schema_version integer not null default 1
    check (schema_version > 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(subject_type)) > 0),
  check (jsonb_typeof(snapshot) = 'object')
);

create unique index if not exists reason_traces_answer_subject_unique_idx
  on reason_traces(trace_kind, subject_type, subject_id)
  where trace_kind = 'answer';

create index if not exists reason_traces_thread_created_idx
  on reason_traces(thread_id, created_at desc);

create index if not exists reason_traces_agent_run_idx
  on reason_traces(agent_run_id)
  where agent_run_id is not null;

alter table agent_runs
  add column if not exists response_post_id uuid references posts(id) on delete set null;

create index if not exists agent_runs_response_post_idx
  on agent_runs(response_post_id)
  where response_post_id is not null;

create or replace function prevent_memory_evidence_mutation()
returns trigger as $$
begin
  raise exception 'memory evidence is append-only';
end;
$$ language plpgsql;

drop trigger if exists memory_primitive_evidence_immutable on memory_primitive_evidence;
create trigger memory_primitive_evidence_immutable
  before update or delete on memory_primitive_evidence
  for each row execute function prevent_memory_evidence_mutation();

create or replace function prevent_reason_trace_mutation()
returns trigger as $$
begin
  raise exception 'reason traces are immutable';
end;
$$ language plpgsql;

drop trigger if exists reason_traces_immutable on reason_traces;
create trigger reason_traces_immutable
  before update or delete on reason_traces
  for each row execute function prevent_reason_trace_mutation();

drop trigger if exists memory_primitive_edges_set_updated_at on memory_primitive_edges;
create trigger memory_primitive_edges_set_updated_at
  before update on memory_primitive_edges
  for each row execute function set_updated_at();

drop trigger if exists context_retrieval_overrides_set_updated_at on context_retrieval_overrides;
create trigger context_retrieval_overrides_set_updated_at
  before update on context_retrieval_overrides
  for each row execute function set_updated_at();

alter table memory_primitive_evidence enable row level security;
alter table memory_primitive_edges enable row level security;
alter table context_retrieval_overrides enable row level security;
alter table reason_traces enable row level security;

notify pgrst, 'reload schema';
