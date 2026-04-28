-- 1.8.76: Show mirrored cards in their mirror stacks on the board
-- Replaces rpc_get_workspace_board so that:
--   • Cards that are mirrored into a stack appear in that stack under `mirror_cards`
--     (separate from `cards` so DnD can keep them non-sortable).
--   • Home cards appear in `cards` as before, with is_mirror_here: false.
--   • moveCard cleanup guard is enforced in application code (dnd.ts).

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
    -- Home stacks
    select
      n.*,
      n.position  as display_position,
      false       as is_mirror_here
    from nodes n
    join workspace w on n.parent_id = w.id
    where n.type = 'stack'

    union all

    -- Mirrored stacks
    select
      n.*,
      nm.position as display_position,
      true        as is_mirror_here
    from node_mirrors nm
    join nodes n     on n.id = nm.node_id
    join workspace w on nm.mirror_parent_id = w.id
    where n.type = 'stack'
  ),

  -- Which node_ids have any mirrors anywhere in the instance
  mirrored_node_ids as (
    select distinct node_id from node_mirrors
  ),

  -- Home cards: native children of stacks on this board
  home_card_rows as (
    select c.*
    from nodes c
    join stack_rows s on c.parent_id = s.id
    where c.type = 'card'
  ),

  -- Mirrored cards: appear in stacks on this board via node_mirrors
  mirror_card_rows as (
    select c.*, nm.mirror_parent_id as mirror_stack_id, nm.position as mirror_position
    from node_mirrors nm
    join nodes c     on c.id = nm.node_id and c.type = 'card'
    join stack_rows s on nm.mirror_parent_id = s.id
  ),

  -- All card IDs we need field values for
  all_card_ids as (
    select id from home_card_rows
    union
    select id from mirror_card_rows
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
    where v.node_id in (select id from all_card_ids)
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

  -- JSON for home cards (keyed by their real parent_id stack)
  home_cards_json as (
    select
      c.parent_id as stack_id,
      c.position,
      jsonb_build_object(
        'id',             c.id,
        'title',          c.title,
        'description',    c.description,
        'owner_id',       c.owner_id,
        'position',       c.position,
        'archived_at',    c.archived_at,
        'is_mirror_here', false,
        'is_mirrored',    (c.id in (select node_id from mirrored_node_ids)),
        'field_values',   coalesce(cfv.field_values, '{}'::jsonb)
      ) as card
    from home_card_rows c
    left join card_field_values cfv on cfv.node_id = c.id
  ),

  -- JSON for mirror cards (keyed by their mirror_stack_id)
  mirror_cards_json as (
    select
      mc.mirror_stack_id as stack_id,
      mc.mirror_position as position,
      jsonb_build_object(
        'id',             mc.id,
        'title',          mc.title,
        'description',    mc.description,
        'owner_id',       mc.owner_id,
        'position',       mc.mirror_position,
        'archived_at',    mc.archived_at,
        'is_mirror_here', true,
        'is_mirrored',    true,
        'field_values',   coalesce(cfv.field_values, '{}'::jsonb)
      ) as card
    from mirror_card_rows mc
    left join card_field_values cfv on cfv.node_id = mc.id
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
          (select jsonb_agg(hj.card order by hj.position)
           from home_cards_json hj
           where hj.stack_id = s.id),
          '[]'::jsonb
        ),
        'mirror_cards', coalesce(
          (select jsonb_agg(mj.card order by mj.position)
           from mirror_cards_json mj
           where mj.stack_id = s.id),
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
      'workspace', (select to_jsonb(w.*) from workspace w),
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
