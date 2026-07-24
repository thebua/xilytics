-- =====================================================================
--  Rename two columns that collide with reserved words
-- =====================================================================
--  Run this only if you created the schema before this change. Postgres
--  accepted `values` and `position` as column names, but both need
--  quoting in every query that touches them, and a query written without
--  the quotes fails in a way that reads like a syntax error somewhere
--  else. Clearer names cost nothing now and save that later.
--
--  Safe to run twice: each rename checks the column is still there.
-- =====================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries'
      and column_name = 'position'
  ) then
    alter table entries rename column "position" to pos;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries'
      and column_name = 'values'
  ) then
    alter table entries rename column "values" to metric_values;
  end if;
end $$;

-- The indexes were built on the old names; Postgres follows a rename, so
-- they are still valid. This confirms what is there.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'entries'
order by indexname;
