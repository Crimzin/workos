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

create or replace function rpc_correct_memory_primitive(
  p_claim_id uuid,
  p_actor_id uuid,
  p_replacement_statement text default null,
  p_reason text default null
)
returns table (
  old_claim_id uuid,
  replacement_claim_id uuid,
  thread_id uuid,
  instance_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old memory_primitives%rowtype;
  v_replacement_id uuid;
  v_now timestamptz := now();
  v_reason text := nullif(trim(p_reason), '');
  v_replacement text := nullif(trim(p_replacement_statement), '');
  v_correction_factor jsonb;
begin
  if v_reason is null then
    raise exception 'A correction reason is required';
  end if;

  select mp.*
    into v_old
    from memory_primitives mp
    where mp.id = p_claim_id
    for update;

  if not found then
    raise exception 'Working model claim not found';
  end if;

  if not exists (
    select 1
    from actors a
    where a.id = p_actor_id
      and a.instance_id = v_old.instance_id
  ) then
    raise exception 'Correction actor does not belong to this instance';
  end if;

  if v_old.status in ('superseded', 'retracted', 'invalidated', 'reversed') then
    raise exception 'This belief has already changed';
  end if;

  if v_replacement is not null and v_replacement = trim(v_old.statement) then
    raise exception 'The replacement must change the belief';
  end if;

  if v_replacement is not null and v_old.type = 'rationale' then
    raise exception 'Legacy rationale beliefs can be retracted but not replaced';
  end if;

  v_correction_factor := jsonb_build_object(
    'code', 'explicit_human_correction',
    'direction', 'supports',
    'explanation', 'A person explicitly corrected the earlier belief.',
    'evidence_refs', '[]'::jsonb
  );

  if v_replacement is not null then
    insert into memory_primitives (
      instance_id,
      node_id,
      type,
      statement,
      body,
      status,
      conviction,
      metadata,
      source_post_id,
      source_label,
      created_by_actor_id,
      extraction_mode,
      conviction_posture,
      conviction_factors,
      conviction_version,
      valid_from,
      last_confirmed_at,
      sensitivity_label,
      supersedes_primitive_id,
      updated_by_actor_id,
      schema_version
    ) values (
      v_old.instance_id,
      v_old.node_id,
      v_old.type,
      v_replacement,
      v_old.body,
      'active',
      1.00,
      coalesce(v_old.metadata, '{}'::jsonb) || jsonb_build_object(
        'corrected_from_primitive_id', v_old.id,
        'correction_reason', v_reason
      ),
      v_old.source_post_id,
      'Explicit user correction',
      p_actor_id,
      'explicit',
      'assert',
      jsonb_build_array(v_correction_factor),
      'working-model-v1',
      v_now,
      v_now,
      v_old.sensitivity_label,
      v_old.id,
      p_actor_id,
      greatest(v_old.schema_version, 1)
    )
    returning id into v_replacement_id;

    update memory_primitives
      set status = 'superseded',
          valid_to = v_now,
          superseded_by_primitive_id = v_replacement_id,
          updated_by_actor_id = p_actor_id,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'correction_reason', v_reason
          )
      where id = v_old.id;

    insert into memory_primitive_edges (
      instance_id,
      from_primitive_id,
      to_primitive_id,
      relationship_kind,
      derivation_metadata,
      created_by_actor_id
    ) values (
      v_old.instance_id,
      v_replacement_id,
      v_old.id,
      'revises',
      jsonb_build_object('reason', v_reason, 'human_signal', 'explicit_correction'),
      p_actor_id
    );
  else
    update memory_primitives
      set status = 'retracted',
          valid_to = v_now,
          updated_by_actor_id = p_actor_id,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'correction_reason', v_reason
          )
      where id = v_old.id;
  end if;

  insert into memory_primitive_evidence (
    instance_id,
    memory_primitive_id,
    relation,
    source_kind,
    source_app,
    source_node_id,
    excerpt,
    actor_id,
    observed_at,
    human_signal,
    authority_snapshot,
    metadata
  ) values (
    v_old.instance_id,
    coalesce(v_replacement_id, v_old.id),
    'corrects',
    'user_correction',
    'workos',
    v_old.node_id,
    left(v_reason, 280),
    p_actor_id,
    v_now,
    'explicit_correction',
    jsonb_build_object('actor_id', p_actor_id, 'source', 'working_model_correction'),
    jsonb_build_object('corrected_primitive_id', v_old.id)
  );

  update memory_primitives dependent
    set conviction_posture = 'flag',
        conviction = least(dependent.conviction, 0.59),
        conviction_factors = coalesce(dependent.conviction_factors, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'code', 'invalid_upstream_assumption',
            'direction', 'weakens',
            'explanation', 'A belief this depended on was corrected.',
            'evidence_refs', '[]'::jsonb
          )),
        updated_by_actor_id = p_actor_id
    where dependent.id in (
      select edge.from_primitive_id
      from memory_primitive_edges edge
      where edge.to_primitive_id = v_old.id
        and edge.relationship_kind = 'depends_on'
        and edge.status = 'active'
    )
      and dependent.status in ('active', 'tentative', 'validated', 'untested');

  old_claim_id := v_old.id;
  replacement_claim_id := v_replacement_id;
  thread_id := v_old.node_id;
  instance_id := v_old.instance_id;
  return next;
end;
$$;

revoke all on function rpc_correct_memory_primitive(uuid, uuid, text, text)
  from public;
grant execute on function rpc_correct_memory_primitive(uuid, uuid, text, text)
  to service_role;

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
