-- 1.8.75: Node Mirroring
-- A node_mirrors row records that a node (stack or card) appears in an
-- additional parent context beyond its home nodes.parent_id.
-- Position within the mirror context is stored independently.

create table if not exists node_mirrors (
  id               uuid primary key default gen_random_uuid(),
  node_id          uuid not null references nodes(id) on delete cascade,
  mirror_parent_id uuid not null references nodes(id) on delete cascade,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  -- A node can only be mirrored into a given parent once.
  unique (node_id, mirror_parent_id)
);

-- Fast lookup: "what are all the mirror contexts for this node?"
create index if not exists node_mirrors_node_id_idx
  on node_mirrors(node_id);

-- Fast lookup: "what nodes are mirrored into this workspace/stack?"
create index if not exists node_mirrors_mirror_parent_id_idx
  on node_mirrors(mirror_parent_id);

-- Fast ordering within a mirror parent
create index if not exists node_mirrors_parent_position_idx
  on node_mirrors(mirror_parent_id, position);

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Updated board RPC: includes mirrored stacks via UNION and adds
-- is_mirror_here / is_mirrored flags to stacks and cards.
-- ---------------------------------------------------------------------------

create or replace function rpc_get_workspace_board(p_workspace_id uuid)
returns jsonb
language sql
stable
as $$
  with workspace as (
    select *
    from nodes
    where id = p_workspace_id
      and type = 'workspace'
      and archived_at is null
    limit 1
  ),

  -- All stacks appearing on this board: home (parent_id = workspace) + mirrored
  stack_rows as (
    -- Home stacks: native children of this workspace
    select
      n.*,
      n.position    as display_position,
      false         as is_mirror_here
    from nodes n
    join workspace w on n.parent_id = w.id
    where n.type = 'stack'

    union all

    -- Mirrored stacks: linked into this workspace via node_mirrors
    select
      n.*,
      nm.position   as display_position,
      true          as is_mirror_here
    from node_mirrors nm
    join nodes n       on n.id = nm.node_id
    join workspace w   on nm.mirror_parent_id = w.id
    where n.type = 'stack'
  ),

  -- Which node_ids have any mirrors anywhere in the instance
  mirrored_node_ids as (
    select distinct node_id from node_mirrors
  ),

  card_rows as (
    select c.*
    from nodes c
    join stack_rows s on c.parent_id = s.id
    where c.type = 'card'
  ),

  field_rows as (
    select f.*
    from data_fields f
    join workspace w on f.instance_id = w.instance_id
    where f.field_type in ('single_select', 'multi_select')
  ),

  option_rows as (
    select o.*
    from data_field_options o
    where o.field_id in (select id from field_rows)
  ),

  value_rows as (
    select v.*
    from node_field_values v
    where v.node_id in (select id from card_rows)
      and v.option_id is not null
  ),

  card_field_values as (
    select
      node_id,
      jsonb_object_agg(field_id, option_ids) as field_values
    from (
      select node_id, field_id, jsonb_agg(option_id) as option_ids
      from value_rows
      group by node_id, field_id
    ) grouped
    group by node_id
  ),

  cards_json as (
    select
      c.parent_id as stack_id,
      c.position,
      jsonb_build_object(
        'id',          c.id,
        'title',       c.title,
        'description', c.description,
        'owner_id',    c.owner_id,
        'position',    c.position,
        'archived_at', c.archived_at,
        'is_mirrored', (c.id in (select node_id from mirrored_node_ids)),
        'field_values', coalesce(cfv.field_values, '{}'::jsonb)
      ) as card
    from card_rows c
    left join card_field_values cfv on cfv.node_id = c.id
  ),

  stacks_json as (
    select
      s.display_position,
      jsonb_build_object(
        'id',             s.id,
        'title',          s.title,
        'description',    s.description,
        'owner_id',       s.owner_id,
        'position',       s.display_position,
        'archived_at',    s.archived_at,
        'is_mirror_here', s.is_mirror_here,
        'is_mirrored',    (s.id in (select node_id from mirrored_node_ids)),
        'cards', coalesce(
          (select jsonb_agg(cj.card order by cj.position)
           from cards_json cj
           where cj.stack_id = s.id),
          '[]'::jsonb
        )
      ) as stack
    from stack_rows s
  ),

  options_json as (
    select
      o.field_id,
      o.position,
      jsonb_build_object(
        'id',       o.id,
        'name',     o.name,
        'position', o.position
      ) as option
    from option_rows o
  ),

  fields_json as (
    select
      f.position,
      jsonb_build_object(
        'id',          f.id,
        'name',        f.name,
        'field_type',  f.field_type,
        'color',       f.color,
        'description', f.description,
        'locked',      f.locked,
        'options', coalesce(
          (select jsonb_agg(oj.option order by oj.position)
           from options_json oj
           where oj.field_id = f.id),
          '[]'::jsonb
        )
      ) as field
    from field_rows f
  ),

  default_column_field as (
    select coalesce(
      (select id from field_rows where field_type = 'single_select'
       order by position asc limit 1),
      (select id from field_rows order by position asc limit 1)
    ) as id
  )

  select case
    when not exists (select 1 from workspace) then null
    else jsonb_build_object(
      'workspace',          (select to_jsonb(w.*) from workspace w),
      'stacks', coalesce(
        (select jsonb_agg(sj.stack order by sj.display_position)
         from stacks_json sj),
        '[]'::jsonb
      ),
      'fields', coalesce(
        (select jsonb_agg(fj.field order by fj.position)
         from fields_json fj),
        '[]'::jsonb
      ),
      'defaultColumnFieldId', (select id from default_column_field)
    )
  end;
$$;

notify pgrst, 'reload schema';
