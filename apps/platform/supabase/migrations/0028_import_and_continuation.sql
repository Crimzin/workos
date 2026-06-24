create table if not exists import_sessions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  actor_id uuid references actors(id) on delete set null,
  source_apps text[] not null default '{}'::text[]
    check (source_apps <@ array['claude', 'chatgpt', 'unknown']::text[]),
  import_name text,
  status text not null default 'completed'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  source_counts jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table nodes
  add column if not exists source_kind text
    check (source_kind is null or source_kind in ('native', 'imported_ai_chat')),
  add column if not exists source_app text
    check (source_app is null or source_app in ('workos', 'claude', 'chatgpt', 'unknown')),
  add column if not exists source_import_session_id uuid references import_sessions(id) on delete set null,
  add column if not exists source_conversation_id text,
  add column if not exists source_title text,
  add column if not exists source_hash text,
  add column if not exists source_created_at timestamptz,
  add column if not exists source_updated_at timestamptz,
  add column if not exists imported_visibility text not null default 'visible'
    check (imported_visibility in ('visible', 'hidden_from_imported_chats')),
  add column if not exists suggestion_status text not null default 'allowed'
    check (suggestion_status in ('allowed', 'ignored'));

create table if not exists thread_context_attachments (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  thread_id uuid not null references nodes(id) on delete cascade,
  context_source_node_id uuid not null references nodes(id) on delete cascade,
  attached_by text not null
    check (attached_by in ('automatic', 'conversational', 'hashtag', 'side_panel', 'user')),
  status text not null default 'active'
    check (status in ('active', 'removed', 'ignored_for_suggestions')),
  reason text,
  source_post_id uuid references posts(id) on delete set null,
  source_message_id text,
  source_span jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  unique(thread_id, context_source_node_id)
);

create index if not exists import_sessions_instance_created_idx
  on import_sessions(instance_id, created_at desc);

create index if not exists nodes_imported_chats_idx
  on nodes(instance_id, source_app, updated_at desc)
  where source_kind = 'imported_ai_chat' and archived_at is null;

create index if not exists nodes_imported_visibility_idx
  on nodes(instance_id, imported_visibility, updated_at desc)
  where source_kind = 'imported_ai_chat';

create unique index if not exists nodes_source_conversation_idx
  on nodes(instance_id, source_app, source_conversation_id);

create index if not exists thread_context_active_idx
  on thread_context_attachments(thread_id, status, created_at desc);

create index if not exists thread_context_source_idx
  on thread_context_attachments(context_source_node_id, status, created_at desc);

drop trigger if exists import_sessions_set_updated_at on import_sessions;
create trigger import_sessions_set_updated_at
  before update on import_sessions
  for each row execute function set_updated_at();

drop trigger if exists thread_context_attachments_set_updated_at on thread_context_attachments;
create trigger thread_context_attachments_set_updated_at
  before update on thread_context_attachments
  for each row execute function set_updated_at();

alter table import_sessions enable row level security;
alter table thread_context_attachments enable row level security;

notify pgrst, 'reload schema';
