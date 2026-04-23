-- Minimal seed data to prove the recursive model end-to-end.
-- Workspace -> Stacks -> Cards, three levels of tree.

do $$
declare
  burn_id uuid := gen_random_uuid();
  personal_id uuid := gen_random_uuid();
  burn_roadmap_id uuid := gen_random_uuid();
  burn_bugs_id uuid := gen_random_uuid();
  personal_inbox_id uuid := gen_random_uuid();
begin
  insert into nodes (id, parent_id, type, title, description, status, position) values
    (burn_id,     null, 'workspace', 'Burn',     'Burn product development',   'active', 0),
    (personal_id, null, 'workspace', 'Personal', 'Personal projects and life', 'active', 1);

  insert into nodes (id, parent_id, type, title, description, status, position) values
    (burn_roadmap_id,   burn_id,     'stack', 'Roadmap',       'In-flight features and next-up work', 'active', 0),
    (burn_bugs_id,      burn_id,     'stack', 'Bugs',          'Known issues and triage',             'active', 1),
    (personal_inbox_id, personal_id, 'stack', 'Inbox',         'Uncategorized items',                 'active', 0);

  insert into nodes (parent_id, type, title, description, status, position) values
    (burn_roadmap_id, 'card', 'Build WorkOS v0 data model', 'Recursive node schema in Supabase',            'in_progress', 0),
    (burn_roadmap_id, 'card', 'Kanban view',                'Columns by status, drag + drop within a stack', 'todo',        1),
    (burn_bugs_id,    'card', 'Login screen flashes',       'Brief render of empty state on cold load',     'todo',        0);
end $$;
