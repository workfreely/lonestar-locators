-- VERIFY 20261114000000_lead_screening_resolution — run AFTER applying. Expect ok = true on
-- every row, and the final notice to confirm the CHECK rejected a bad token.
--
-- Checks the facts that matter: the columns exist with the right types, they are NULLABLE with
-- NO DEFAULT (so NULL keeps meaning "nobody has asked" for every lead already on file), no
-- existing row was given a value, and the vocabulary CHECK actually refuses something.
select 'columns exist with the right types' as check,
       count(*) = 3 as ok, count(*)::text as detail
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads'
   and (column_name, data_type) in
       (('broken_lease_paid','boolean'), ('eviction_paid','boolean'), ('rental_debt_status','text'))
union all
select 'all three nullable with no default',
       count(*) = 3, count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads'
   and column_name in ('broken_lease_paid','eviction_paid','rental_debt_status')
   and is_nullable = 'YES' and column_default is null
union all
select 'no existing lead was given a value',
       (select count(*) from public.leads
         where broken_lease_paid is not null or eviction_paid is not null
            or rental_debt_status is not null) = 0,
       (select count(*)::text || ' leads on file' from public.leads)
union all
select 'rental_debt_status vocabulary CHECK present',
       exists (select 1 from pg_constraint where conname = 'leads_rental_debt_status_vocab'),
       (select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'leads_rental_debt_status_vocab');

-- A CHECK is only proved by a rejected write. This writes to a REAL lead and then raises, so
-- the enclosing block rolls back and nothing is left behind either way.
do $v$
declare v_id bigint; v_rejected boolean := false;
begin
  select id into v_id from public.leads order by id limit 1;
  if v_id is null then raise notice 'SKIPPED: no leads to probe'; return; end if;
  begin
    update public.leads set rental_debt_status = 'unpaid' where id = v_id;
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: the CHECK accepted ''unpaid'', which is outside the vocabulary';
  end if;
  -- And a GOOD token must be accepted.
  update public.leads set rental_debt_status = 'payment_plan' where id = v_id;
  raise notice 'OK: ''unpaid'' rejected, ''payment_plan'' accepted (lead %), rolling back', v_id;
  raise exception 'VERIFY ROLLBACK — nothing was kept';
exception when raise_exception then
  if sqlerrm = 'VERIFY ROLLBACK — nothing was kept' then
    raise notice 'OK: probe rolled back, no lead was modified';
  else
    raise;
  end if;
end
$v$;

-- Final proof that the probe left nothing: expect 0.
select 'nothing persisted from the probe' as check,
       count(*) = 0 as ok, count(*)::text as detail
  from public.leads where rental_debt_status is not null;
