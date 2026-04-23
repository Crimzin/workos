-- Solo-mode grants for tables added after project init.
--
-- Supabase's default privilege setup auto-grants anon/authenticated on tables
-- created during project creation, but NOT on tables added via later SQL
-- migrations. Without these grants the Supabase JS client (running as anon)
-- sees empty result sets for actors/instances/fields/etc. even with RLS off.
--
-- When multi-user + auth land, replace these broad grants with RLS policies.

grant all on
  instances, actors, node_members,
  data_fields, data_field_options, node_field_values
to anon, authenticated;

-- Also ensure the board RPC is callable by the anon role.
grant execute on function rpc_get_workspace_board(uuid) to anon, authenticated;

-- Future tables in public schema auto-inherit these grants.
alter default privileges in schema public
  grant all on tables to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

notify pgrst, 'reload schema';
