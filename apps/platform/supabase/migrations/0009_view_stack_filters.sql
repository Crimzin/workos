-- Stack-level filtering for saved views.
-- stack_filters: [{ "fieldId": "uuid", "optionIds": ["uuid", ...] }] — same shape as card filters
-- hidden_stack_ids: ["uuid", ...] — explicit per-stack on/off toggles
alter table workspace_views
  add column stack_filters    jsonb not null default '[]'::jsonb,
  add column hidden_stack_ids jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
