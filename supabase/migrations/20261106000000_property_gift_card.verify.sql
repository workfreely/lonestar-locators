-- VERIFICATION for the gift-card migration. Every statement is a SELECT — this file writes
-- nothing, so it is safe to run before AND after. Expect 7 rows; row 1 says which state you are in.

select '1. columns present' as assertion,
  count(*)::text as value,
  case when count(*) = 3 then 'MIGRATION APPLIED' when count(*) = 0 then 'NOT YET APPLIED' else 'PARTIAL — stop and investigate' end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'property_catalog'
  and column_name in ('gift_card_status', 'gift_card_amount', 'gift_card_checked_at')

union all

select '2. all three are nullable', coalesce(string_agg(is_nullable, ','), '(none)'),
  case when count(*) = 3 and bool_and(is_nullable = 'YES') then 'PASS' else 'FAIL — unknown must stay representable' end
from information_schema.columns
where table_schema = 'public' and table_name = 'property_catalog'
  and column_name in ('gift_card_status', 'gift_card_amount', 'gift_card_checked_at')

union all

select '3. status vocabulary constraint', coalesce((select conname from pg_constraint
    where conrelid = 'public.property_catalog'::regclass and conname = 'property_catalog_gift_card_status_check'), '(missing)'),
  case when exists (select 1 from pg_constraint
    where conrelid = 'public.property_catalog'::regclass and conname = 'property_catalog_gift_card_status_check') then 'PASS' else 'FAIL' end

union all

select '4. amount-requires-yes constraint', coalesce((select conname from pg_constraint
    where conrelid = 'public.property_catalog'::regclass and conname = 'property_catalog_gift_card_amount_check'), '(missing)'),
  case when exists (select 1 from pg_constraint
    where conrelid = 'public.property_catalog'::regclass and conname = 'property_catalog_gift_card_amount_check') then 'PASS' else 'FAIL' end

union all

-- The whole point of the change: nothing that already existed moved.
select '5. bonus_flat untouched (agent bonus)', count(*)::text,
  case when count(*) = 1 then 'PASS — still its own column' else 'FAIL' end
from information_schema.columns
where table_schema = 'public' and table_name = 'property_catalog' and column_name = 'bonus_flat'

union all

select '6. current_special untouched', count(*)::text,
  case when count(*) = 1 then 'PASS' else 'FAIL' end
from information_schema.columns
where table_schema = 'public' and table_name = 'property_catalog' and column_name = 'current_special'

union all

-- No existing row may have been given a gift card by the migration itself.
select '7. no row was assigned a status', count(*)::text,
  case when count(*) = 0 then 'PASS — every existing property is still unknown' else 'INSPECT — rows already carry a status' end
from public.property_catalog where gift_card_status is not null;
