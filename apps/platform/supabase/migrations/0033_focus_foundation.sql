create table if not exists focus_sessions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  actor_id uuid not null references actors(id) on delete cascade,
  mode text not null
    check (mode in ('weekly', 'morning', 'midday', 'end_of_day', 'friday_reflection', 'ad_hoc')),
  window_key text not null,
  status text not null default 'active'
    check (status in ('active', 'closed')),
  title text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_id, actor_id, window_key),
  unique(id, instance_id),
  check (length(trim(window_key)) > 0),
  check (length(trim(title)) > 0)
);

create table if not exists focus_messages (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  focus_session_id uuid not null,
  actor_id uuid references actors(id) on delete set null,
  role text not null check (role in ('user', 'workos', 'system')),
  message_kind text not null
    check (message_kind in ('briefing', 'reply', 'status', 'repair_prompt')),
  dedupe_key text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint focus_messages_session_instance_fk
    foreign key (focus_session_id, instance_id)
    references focus_sessions(id, instance_id)
    on delete cascade,
  unique(focus_session_id, message_kind, dedupe_key),
  check (length(trim(body)) > 0)
);

create table if not exists focus_items (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  focus_session_id uuid not null,
  created_by_message_id uuid references focus_messages(id) on delete set null,
  dedupe_key text,
  title text not null,
  body text,
  item_type text not null default 'next_move'
    check (item_type in ('priority', 'next_move', 'planning_question', 'radar')),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'deferred', 'dismissed', 'completed')),
  anchor_status text not null default 'anchored'
    check (anchor_status in ('anchored', 'needs_thread', 'dismissed')),
  priority_rank integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deferred_until timestamptz,
  constraint focus_items_session_instance_fk
    foreign key (focus_session_id, instance_id)
    references focus_sessions(id, instance_id)
    on delete cascade,
  unique(focus_session_id, dedupe_key),
  check (length(trim(title)) > 0)
);

create table if not exists focus_item_threads (
  id uuid primary key default gen_random_uuid(),
  focus_item_id uuid not null references focus_items(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  thread_role text not null default 'primary'
    check (thread_role in ('primary', 'supporting')),
  created_at timestamptz not null default now(),
  unique(focus_item_id, thread_id)
);

create index if not exists focus_sessions_instance_active_idx
  on focus_sessions(instance_id, status, opened_at desc);

create index if not exists focus_sessions_window_idx
  on focus_sessions(instance_id, actor_id, window_key);

create index if not exists focus_messages_session_created_idx
  on focus_messages(focus_session_id, created_at asc);

create index if not exists focus_items_session_rank_idx
  on focus_items(focus_session_id, status, priority_rank asc, created_at asc);

create index if not exists focus_items_anchor_status_idx
  on focus_items(focus_session_id, anchor_status);

create index if not exists focus_item_threads_thread_idx
  on focus_item_threads(thread_id);

drop trigger if exists focus_sessions_set_updated_at on focus_sessions;
create trigger focus_sessions_set_updated_at
  before update on focus_sessions
  for each row execute function set_updated_at();

drop trigger if exists focus_messages_set_updated_at on focus_messages;
create trigger focus_messages_set_updated_at
  before update on focus_messages
  for each row execute function set_updated_at();

drop trigger if exists focus_items_set_updated_at on focus_items;
create trigger focus_items_set_updated_at
  before update on focus_items
  for each row execute function set_updated_at();

create or replace function rpc_upsert_focus_item_with_threads(
  p_instance_id uuid,
  p_focus_session_id uuid,
  p_created_by_message_id uuid,
  p_title text,
  p_body text,
  p_item_type text,
  p_anchor_status text,
  p_priority_rank integer,
  p_thread_ids uuid[] default '{}'::uuid[],
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns focus_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item focus_items%rowtype;
  v_thread_id uuid;
  v_thread_count integer := coalesce(array_length(p_thread_ids, 1), 0);
begin
  perform 1
  from focus_sessions
  where id = p_focus_session_id
    and instance_id = p_instance_id;

  if not found then
    raise exception 'Focus session not found';
  end if;

  if p_anchor_status = 'anchored' and v_thread_count = 0 then
    raise exception 'Anchored Focus items require at least one thread';
  end if;

  insert into focus_items (
    instance_id,
    focus_session_id,
    created_by_message_id,
    dedupe_key,
    title,
    body,
    item_type,
    anchor_status,
    priority_rank,
    metadata
  )
  values (
    p_instance_id,
    p_focus_session_id,
    p_created_by_message_id,
    p_dedupe_key,
    trim(p_title),
    p_body,
    p_item_type,
    p_anchor_status,
    p_priority_rank,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (focus_session_id, dedupe_key) do update set
    created_by_message_id = excluded.created_by_message_id,
    title = excluded.title,
    body = excluded.body,
    item_type = excluded.item_type,
    anchor_status = excluded.anchor_status,
    priority_rank = excluded.priority_rank,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into v_item;

  foreach v_thread_id in array coalesce(p_thread_ids, '{}'::uuid[]) loop
    insert into focus_item_threads (
      focus_item_id,
      thread_id,
      thread_role
    )
    values (
      v_item.id,
      v_thread_id,
      'primary'
    )
    on conflict (focus_item_id, thread_id) do nothing;
  end loop;

  return v_item;
end;
$$;

alter table focus_sessions enable row level security;
alter table focus_messages enable row level security;
alter table focus_items enable row level security;
alter table focus_item_threads enable row level security;

notify pgrst, 'reload schema';
