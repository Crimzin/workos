create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references nodes(id) on delete cascade,
  actor_id   uuid references actors(id) on delete set null,
  post_type  text not null default 'post',  -- 'post' | 'card_created' | 'link_created'
  body       text,          -- user text for 'post'; null for activity types
  metadata   jsonb,         -- e.g. { card_id, card_title } for card_created
  pinned     boolean not null default false,
  pinned_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_node_id_created_idx on posts(node_id, created_at desc);
create index if not exists posts_node_id_pinned_idx  on posts(node_id) where pinned = true;

notify pgrst, 'reload schema';
