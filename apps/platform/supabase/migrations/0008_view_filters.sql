-- Add filters JSONB column to workspace_views.
-- Schema: [{ "fieldId": "uuid", "optionIds": ["uuid", ...] }]
alter table workspace_views
  add column filters jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
