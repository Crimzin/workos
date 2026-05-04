-- The board uses midpoint ordering for drag/drop. Positions must accept
-- fractional values when a card or stack is dropped between two neighbors.
alter table nodes
  alter column position type numeric using position::numeric;

alter table node_mirrors
  alter column position type numeric using position::numeric;
