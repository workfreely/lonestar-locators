-- VERIFICATION for the favorite sort_order migration. Every statement is a SELECT — safe before
-- and after. Expect 5 rows; row 1 says which state you are in.

select '1. column present' as assertion, count(*)::text as value,
  case when count(*) = 1 then 'MIGRATION APPLIED' else 'NOT YET APPLIED' end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'lead_favorites' and column_name = 'sort_order'

union all

-- NULLABLE is what preserves the existing order. A NOT NULL default would have tied every row.
select '2. it is nullable', coalesce(max(is_nullable), '(none)'),
  case when max(is_nullable) = 'YES' then 'PASS — untouched favorites keep their position'
       when max(is_nullable) is null then 'NOT YET APPLIED' else 'FAIL' end
from information_schema.columns
where table_schema = 'public' and table_name = 'lead_favorites' and column_name = 'sort_order'

union all

select '3. no row was assigned a position', count(*)::text,
  case when count(*) = 0 then 'PASS — every favorite is still unarranged' else 'INSPECT' end
from public.lead_favorites where sort_order is not null

union all

select '4. the ordering index exists', coalesce((select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'lead_favorites' and indexname = 'lead_favorites_lead_order_idx'), '(missing)'),
  case when exists (select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'lead_favorites' and indexname = 'lead_favorites_lead_order_idx') then 'PASS' else 'FAIL' end

union all

-- Top Pick is a pointer on leads, not a position here. Nothing in this migration touches it.
select '5. top_pick_favorite_id untouched', count(*)::text,
  case when count(*) = 1 then 'PASS — still its own field on leads' else 'FAIL' end
from information_schema.columns
where table_schema = 'public' and table_name = 'leads' and column_name = 'top_pick_favorite_id';
