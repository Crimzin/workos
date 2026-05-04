-- 0016_memory_primitives.sql
-- WorkOS-native typed memory primitives for BrainShare foundations.
-- These records are manually authored in WorkOS now and can later be synced
-- to BrainShare/Graphiti episodes without changing the WorkOS surface.

create table if not exists memory_primitives (
  id                    uuid primary key default gen_random_uuid(),
  instance_id           uuid not null references instances(id) on delete cascade,
  node_id               uuid not null references nodes(id) on delete cascade,
  type                  text not null, -- 'rationale' | 'assumption' | 'decision'
  statement             text not null,
  body                  text,
  status                text not null default 'active',
  conviction            numeric(3,2) not null default 1.00,
  metadata              jsonb not null default '{}'::jsonb,
  source_post_id        uuid references posts(id) on delete set null,
  source_label          text,
  external_episode_id   text,
  created_by_actor_id   uuid references actors(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (type in ('rationale', 'assumption', 'decision')),
  check (conviction >= 0 and conviction <= 1)
);

create unique index if not exists memory_primitives_one_rationale_per_node_idx
  on memory_primitives(node_id)
  where type = 'rationale';

create index if not exists memory_primitives_node_idx on memory_primitives(node_id);
create index if not exists memory_primitives_instance_idx on memory_primitives(instance_id);
create index if not exists memory_primitives_type_idx on memory_primitives(type);
create index if not exists memory_primitives_source_post_idx on memory_primitives(source_post_id);
create index if not exists memory_primitives_external_episode_idx on memory_primitives(external_episode_id);

create or replace function set_memory_primitives_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_memory_primitives_updated_at on memory_primitives;
create trigger trg_memory_primitives_updated_at
  before update on memory_primitives
  for each row execute function set_memory_primitives_updated_at();

notify pgrst, 'reload schema';
