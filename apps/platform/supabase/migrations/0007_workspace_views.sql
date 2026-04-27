-- Saved views for a workspace. Each view stores a named configuration
-- (column field, filters, sort order). One view per workspace is starred
-- as the default; the board loads the starred view on open.
create table workspace_views (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references nodes(id) on delete cascade,
  name         text not null default 'Default',
  starred      boolean not null default false,
  -- JSON config — nullable fields default to "no preference"
  column_field_id uuid references data_fields(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on workspace_views(workspace_id);

-- Seed a default starred view for every existing workspace.
insert into workspace_views (workspace_id, name, starred)
select id, 'Default', true
from nodes
where type = 'workspace' and archived_at is null;

notify pgrst, 'reload schema';
