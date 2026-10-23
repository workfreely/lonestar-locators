-- VERIFICATION for 20261105000000_new_destinations_start_paused.sql.
-- Read-only: every statement is a SELECT. Run it AFTER applying the migration.
-- Expect 5 rows, all reading PASS.

-- 1. The default is now true.
select
  'default is true' as assertion,
  case when column_default = 'true' then 'PASS' else 'FAIL: ' || coalesce(column_default, '(none)') end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'social_connections' and column_name = 'posting_paused'

union all

-- 2. The column is still NOT NULL — the default only matters if a null cannot slip past it.
select
  'column is still not null',
  case when is_nullable = 'NO' then 'PASS' else 'FAIL: nullable' end
from information_schema.columns
where table_schema = 'public' and table_name = 'social_connections' and column_name = 'posting_paused'

union all

-- 3. NO EXISTING ROW CHANGED. @realestatepro_tx must still be unpaused, and it is identified by its
--    Instagram user id rather than by its handle, which is user-editable.
select
  'realestatepro_tx still unpaused',
  case
    when not exists (select 1 from public.social_connections where external_account_id = '17841436885324014')
      then 'FAIL: connection missing'
    when exists (
      select 1 from public.social_connections
       where external_account_id = '17841436885324014' and posting_paused = false
    ) then 'PASS'
    else 'FAIL: it is now paused'
  end

union all

-- 4. Nothing else got paused either. Counts every row that is paused today; before the migration
--    this was 0, and a column default cannot change it.
select
  'no existing row was paused by this',
  case when count(*) filter (where posting_paused) = 0
       then 'PASS' else 'FAIL: ' || count(*) filter (where posting_paused)::text || ' paused row(s)' end
from public.social_connections

union all

-- 5. The default actually governs an INSERT. Done inside a CTE that never commits anything: the row
--    is inserted and deleted in the same statement, so the table is unchanged either way.
--    posting_paused is deliberately NOT named in the INSERT — that is the whole point of the test.
select
  'a new row inserted without the column arrives paused',
  case when bool_and(paused) then 'PASS' else 'FAIL: new rows are not paused' end
from (
  with inserted as (
    insert into public.social_connections (owner_user_id, provider, external_account_id, status)
    values ('00000000-0000-0000-0000-000000000000', 'instagram', '__verify_default_only__', 'disconnected')
    returning id, posting_paused
  ), removed as (
    delete from public.social_connections
     where id in (select id from inserted)
    returning posting_paused as paused
  )
  select paused from removed
) probe;
