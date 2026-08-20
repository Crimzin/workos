begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into instances (id, name) values
  ('00000000-0000-0000-0000-000000000101', 'Working Model Test');

insert into actors (id, instance_id, kind, name, agent_type) values
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'human', 'Tester', null),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000101', 'agent', 'WorkOS', 'claude');

insert into nodes (id, instance_id, parent_id, type, title, owner_id, position) values
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000101', null, 'workspace', 'Workspace', '00000000-0000-0000-0000-000000000102', 0),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 'card', 'Thread', '00000000-0000-0000-0000-000000000102', 0),
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 'card', 'Other thread', '00000000-0000-0000-0000-000000000102', 1);

insert into posts (id, node_id, actor_id, body) values
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000102', 'What should ship first?'),
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000103', 'Ship trace inspection first.');

insert into agent_runs (
  id, instance_id, workspace_id, target_node_id, trigger_post_id,
  requester_actor_id, agent_actor_id, provider_key, status, response_post_id
) values (
  '00000000-0000-0000-0000-000000000108',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000104',
  '00000000-0000-0000-0000-000000000105',
  '00000000-0000-0000-0000-000000000106',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
  'inline_claude', 'completed',
  '00000000-0000-0000-0000-000000000107'
);

insert into memory_primitives (
  id, instance_id, node_id, type, statement, status, conviction,
  extraction_mode, conviction_posture, created_by_actor_id
) values
  ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000105', 'decision', 'Ship the old panel first.', 'active', 0.9, 'explicit', 'assert', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000105', 'assumption', 'This must remain active after a rejected correction.', 'active', 0.7, 'explicit', 'flag', '00000000-0000-0000-0000-000000000102');

insert into reason_traces (
  id, instance_id, thread_id, trace_kind, subject_type, subject_id,
  agent_run_id, status, snapshot
) values (
  '00000000-0000-0000-0000-000000000110',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000105',
  'answer', 'post', '00000000-0000-0000-0000-000000000107',
  '00000000-0000-0000-0000-000000000108', 'complete',
  '{"schema_version":1,"trace_kind":"answer","working_model":{"claims":[{"id":"00000000-0000-0000-0000-000000000109","statement":"Ship the old panel first."}]}}'::jsonb
);

select lives_ok(
  $$select * from rpc_correct_memory_primitive(
    '00000000-0000-0000-0000-000000000109',
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000104',
    'Ship trace inspection first.',
    null,
    false,
    'The earlier decision was corrected.'
  )$$,
  'global correction commits atomically'
);

select is(
  (select status from memory_primitives where id = '00000000-0000-0000-0000-000000000109'),
  'superseded',
  'the old claim is superseded'
);

select is(
  (select count(*)::integer from workos_events where event_type = 'memory.corrected' and metadata->>'corrected_claim_id' = '00000000-0000-0000-0000-000000000109'),
  1,
  'the correction event commits with the claim change'
);

select is(
  (select snapshot #>> '{working_model,claims,0,statement}' from reason_traces where id = '00000000-0000-0000-0000-000000000110'),
  'Ship the old panel first.',
  'historical trace snapshots remain unchanged after correction'
);

select is(
  (select response_post_id from agent_runs where id = '00000000-0000-0000-0000-000000000108'),
  '00000000-0000-0000-0000-000000000107'::uuid,
  'the run links to its response post'
);

select is(
  (select agent_run_id from reason_traces where id = '00000000-0000-0000-0000-000000000110'),
  '00000000-0000-0000-0000-000000000108'::uuid,
  'the immutable trace links to its run'
);

insert into context_retrieval_overrides (
  instance_id, thread_id, target_type, target_id, directive, created_by_actor_id
) values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000105',
  'memory_primitive', '00000000-0000-0000-0000-000000000112',
  'exclude', '00000000-0000-0000-0000-000000000102'
);

select throws_ok(
  $$insert into context_retrieval_overrides (
    instance_id, thread_id, target_type, target_id, directive, created_by_actor_id
  ) values (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000105',
    'memory_primitive', '00000000-0000-0000-0000-000000000112',
    'exclude', '00000000-0000-0000-0000-000000000102'
  )$$,
  '23505', null,
  'only one active override is allowed for a claim in a thread'
);

select lives_ok(
  $$insert into context_retrieval_overrides (
    instance_id, thread_id, target_type, target_id, directive, created_by_actor_id
  ) values (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000111',
    'memory_primitive', '00000000-0000-0000-0000-000000000112',
    'exclude', '00000000-0000-0000-0000-000000000102'
  )$$,
  'the same claim can be excluded in one other thread only'
);

select throws_ok(
  $$delete from memory_primitive_evidence where memory_primitive_id in (
    select id from memory_primitives where supersedes_primitive_id = '00000000-0000-0000-0000-000000000109'
  )$$,
  'P0001', 'memory evidence is append-only',
  'ordinary evidence deletion is rejected'
);

select throws_ok(
  $$delete from reason_traces where id = '00000000-0000-0000-0000-000000000110'$$,
  'P0001', 'reason traces are immutable',
  'ordinary trace deletion is rejected'
);

select throws_ok(
  $$select * from rpc_correct_memory_primitive(
    '00000000-0000-0000-0000-000000000112',
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000111',
    null,
    null,
    false,
    'This workspace is invalid for the correction.'
  )$$,
  'P0001', 'Correction workspace does not belong to this instance',
  'a correction with an invalid workspace rolls back'
);

select is(
  (select status from memory_primitives where id = '00000000-0000-0000-0000-000000000112'),
  'active',
  'a rejected correction leaves the claim unchanged'
);

insert into instances (id, name) values
  ('00000000-0000-0000-0000-000000000201', 'Cascade Test');
insert into actors (id, instance_id, kind, name) values
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000201', 'human', 'Cascade Tester');
insert into nodes (id, instance_id, type, title, owner_id) values
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000201', 'workspace', 'Cascade Workspace', '00000000-0000-0000-0000-000000000202');
insert into memory_primitives (id, instance_id, node_id, type, statement) values
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000203', 'assumption', 'Cascade claim');
insert into memory_primitive_evidence (instance_id, memory_primitive_id, relation, source_kind, source_node_id) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000204', 'supports', 'node', '00000000-0000-0000-0000-000000000203');
insert into reason_traces (instance_id, thread_id, trace_kind, subject_type, subject_id, status, snapshot) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000203', 'answer', 'post', '00000000-0000-0000-0000-000000000205', 'partial', '{}'::jsonb);

select lives_ok(
  $$delete from instances where id = '00000000-0000-0000-0000-000000000201'$$,
  'account deletion cascades through immutable evidence and traces'
);

select is(
  (select count(*)::integer from instances where id = '00000000-0000-0000-0000-000000000201'),
  0,
  'the account deletion completed'
);

select * from finish();
rollback;
