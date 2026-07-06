update model_provider_settings
set config =
  jsonb_set(
    jsonb_set(
      coalesce(config, '{}'::jsonb),
      '{default_model_id}',
      '"gemini-3.5-flash"'::jsonb,
      true
    ),
    '{default_model_label}',
    '"Gemini 3.5 Flash"'::jsonb,
    true
  )
where provider_key = 'google'
  and coalesce(config->>'default_model_id', '') in (
    '',
    'gemini-3-pro',
    'gemini-3-flash'
  );
