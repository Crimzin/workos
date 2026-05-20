-- 0020_ai_standards.sql
-- Instance-level overrides and custom standards for BrainShare inborn AI
-- interaction/output defaults. Code owns defaults; this table stores edits.

create table if not exists ai_standards (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references instances(id) on delete cascade,
  standard_key  text not null,
  category      text not null,
  title         text not null,
  instruction   text not null,
  mode          text not null default 'latent',
  enabled       boolean not null default true,
  position      numeric not null default 0,
  source        text not null default 'override',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(instance_id, standard_key),
  check (category in ('interaction', 'output')),
  check (mode in ('latent', 'visible_when_useful')),
  check (source in ('override', 'custom')),
  check (length(trim(title)) > 0),
  check (length(trim(instruction)) > 0),
  check (length(trim(standard_key)) > 0)
);

create index if not exists ai_standards_instance_idx on ai_standards(instance_id);
create index if not exists ai_standards_category_idx on ai_standards(category);
create index if not exists ai_standards_position_idx on ai_standards(instance_id, position);

create or replace function set_ai_standards_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ai_standards_updated_at on ai_standards;
create trigger trg_ai_standards_updated_at
  before update on ai_standards
  for each row execute function set_ai_standards_updated_at();

notify pgrst, 'reload schema';
