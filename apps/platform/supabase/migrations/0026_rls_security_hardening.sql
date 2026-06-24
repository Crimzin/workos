-- Security hardening for solo-mode WorkOS.
--
-- The app intentionally performs database work from Server Components,
-- Server Actions, and route handlers using SUPABASE_SERVICE_ROLE_KEY. Public
-- anon/authenticated roles should not be able to read or mutate app tables
-- directly. Keep RLS enabled with no public policies until multi-user auth
-- lands and can introduce scoped per-user policies.

alter table nodes enable row level security;
alter table instances enable row level security;
alter table actors enable row level security;
alter table node_members enable row level security;
alter table data_fields enable row level security;
alter table data_field_options enable row level security;
alter table node_field_values enable row level security;
alter table workspace_views enable row level security;
alter table node_mirrors enable row level security;
alter table posts enable row level security;
alter table node_links enable row level security;
alter table memory_primitives enable row level security;
alter table ai_standards enable row level security;
alter table agent_actor_capabilities enable row level security;
alter table agent_runs enable row level security;
alter table agent_run_events enable row level security;
alter table agent_run_artifacts enable row level security;
alter table agent_provider_settings enable row level security;
alter table agent_tool_settings enable row level security;
alter table node_pins enable row level security;
alter table post_reactions enable row level security;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

notify pgrst, 'reload schema';
