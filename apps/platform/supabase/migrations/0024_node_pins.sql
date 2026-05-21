-- Durable global shortcuts for any node in the recursive tree.
create table if not exists node_pins (
  node_id uuid primary key references nodes(id) on delete cascade,
  instance_id uuid not null references instances(id) on delete cascade,
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists node_pins_instance_position_idx
  on node_pins(instance_id, position);

drop trigger if exists node_pins_set_updated_at on node_pins;
create trigger node_pins_set_updated_at
  before update on node_pins
  for each row execute function set_updated_at();
