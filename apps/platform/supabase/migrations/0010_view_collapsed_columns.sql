-- Track which column option IDs are collapsed in each saved view.
-- collapsed_column_ids: ["uuid", ...] — option IDs whose columns are hidden to a narrow strip
alter table workspace_views
  add column collapsed_column_ids jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
