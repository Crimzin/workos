-- Phase 1.1: Recursive node model
--
-- Every entity in WorkOS Core is a node. Nodes form a tree via parent_id.
-- The `type` field is a tag for UI rendering (workspace / stack / card),
-- not a structural constraint — the model supports unlimited nesting depth
-- from day one. UI in Phase 1 renders one level at a time.
--
-- Future phases layer on: posts (1.4), data fields (1.5), links (1.6),
-- rationale/assumptions/decisions (Phase 2 BrainShare hooks).

create extension if not exists "pgcrypto";

create table if not exists nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references nodes(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  status text,
  owner text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nodes_parent_id_idx on nodes(parent_id);
create index if not exists nodes_type_idx on nodes(type);
create index if not exists nodes_parent_position_idx on nodes(parent_id, position);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists nodes_set_updated_at on nodes;
create trigger nodes_set_updated_at
  before update on nodes
  for each row execute function set_updated_at();
