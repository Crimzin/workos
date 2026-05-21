-- 0023_seed_codex_agent.sql
-- Make Codex mentionable and routable in existing WorkOS instances.

do $$
declare
  inst record;
  codex_actor_id uuid;
begin
  for inst in select id from instances loop
    select id
    into codex_actor_id
    from actors
    where instance_id = inst.id
      and kind = 'agent'
      and lower(name) = 'codex'
    limit 1;

    if codex_actor_id is null then
      codex_actor_id := gen_random_uuid();

      insert into actors (id, instance_id, kind, name, agent_type)
      values (codex_actor_id, inst.id, 'agent', 'Codex', 'codex');
    else
      update actors
      set agent_type = 'codex',
          updated_at = now()
      where id = codex_actor_id
        and agent_type is distinct from 'codex';
    end if;

    insert into agent_actor_capabilities (actor_id, capability, enabled)
    values
      (codex_actor_id, 'chat', true),
      (codex_actor_id, 'code', true),
      (codex_actor_id, 'shell', true),
      (codex_actor_id, 'git', true)
    on conflict (actor_id, capability)
    do update set
      enabled = excluded.enabled,
      updated_at = now();

    insert into agent_provider_settings (instance_id, provider_key, label, enabled, config)
    values (inst.id, 'codex', 'Codex', true, '{"requires_confirmation":true}'::jsonb)
    on conflict (instance_id, provider_key)
    do update set
      label = excluded.label,
      enabled = true,
      config = agent_provider_settings.config || excluded.config,
      updated_at = now();
  end loop;
end $$;

notify pgrst, 'reload schema';
