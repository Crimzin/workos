-- 0015_node_links.sql
-- Bidirectional context linking between any two nodes (cards or stacks).
-- link_type 'related' = mutual; 'blocks' = directional (from blocks to).

create table if not exists node_links (
  id                  uuid primary key default gen_random_uuid(),
  from_node_id        uuid not null references nodes(id) on delete cascade,
  to_node_id          uuid not null references nodes(id) on delete cascade,
  link_type           text not null default 'related',  -- 'related' | 'blocks'
  created_at          timestamptz not null default now(),
  created_by_actor_id uuid references actors(id) on delete set null,
  check (from_node_id <> to_node_id),
  unique (from_node_id, to_node_id, link_type)
);

create index if not exists node_links_from_idx on node_links(from_node_id);
create index if not exists node_links_to_idx   on node_links(to_node_id);

notify pgrst, 'reload schema';
