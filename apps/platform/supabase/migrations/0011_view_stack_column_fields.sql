-- Per-stack column-field overrides stored on each saved view.
-- stack_column_fields: {"stackId": "fieldId", ...} — overrides the view-level column_field_id for that stack.
alter table workspace_views
  add column stack_column_fields jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
