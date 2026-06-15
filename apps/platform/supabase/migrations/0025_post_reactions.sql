create table if not exists post_reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  actor_id   uuid not null references actors(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, actor_id, emoji)
);

create index if not exists post_reactions_post_id_emoji_idx
  on post_reactions(post_id, emoji);

notify pgrst, 'reload schema';
