alter table nodes
  add column if not exists thread_resolution_status text not null default 'active'
    check (thread_resolution_status in ('active', 'resolved', 'reopened', 'superseded')),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_actor_id uuid references actors(id) on delete set null,
  add column if not exists resolution_summary text,
  add column if not exists resolution_source_post_id uuid references posts(id) on delete set null;

create index if not exists nodes_parent_thread_status_idx
  on nodes(parent_id, thread_resolution_status, updated_at desc);

create index if not exists nodes_resolution_source_post_idx
  on nodes(resolution_source_post_id)
  where resolution_source_post_id is not null;

notify pgrst, 'reload schema';
