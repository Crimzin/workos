create extension if not exists pg_trgm;

create table if not exists context_chunks (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references instances(id) on delete cascade,
  source_node_id uuid not null references nodes(id) on delete cascade,
  source_post_id uuid references posts(id) on delete cascade,
  source_message_id text,
  chunk_index integer not null,
  text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_node_id, source_message_id, chunk_index)
);

create index if not exists context_chunks_instance_created_idx
  on context_chunks(instance_id, created_at desc);

create index if not exists context_chunks_source_idx
  on context_chunks(source_node_id, chunk_index);

create index if not exists context_chunks_text_trgm_idx
  on context_chunks using gin (text gin_trgm_ops);

drop trigger if exists context_chunks_set_updated_at on context_chunks;
create trigger context_chunks_set_updated_at
  before update on context_chunks
  for each row execute function set_updated_at();

alter table context_chunks enable row level security;

notify pgrst, 'reload schema';
